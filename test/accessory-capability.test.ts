import type { CharacteristicValue, PlatformAccessory } from 'homebridge';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MagicHomeAccessory } from '../src/accessory.js';
import type { MagicHomePlatform } from '../src/platform.js';
import { MagicHomeTransport } from '../src/transport.js';
import type { CachedDeviceContext, Capability, DeviceState, DiscoveredDevice } from '../src/types.js';

class FakeCharacteristic {
  getter?: () => CharacteristicValue | Promise<CharacteristicValue>;
  setter?: (value: CharacteristicValue) => void | Promise<void>;
  onGet(handler: () => CharacteristicValue | Promise<CharacteristicValue>): this { this.getter = handler; return this; }
  onSet(handler: (value: CharacteristicValue) => void | Promise<void>): this { this.setter = handler; return this; }
}

class FakeService {
  readonly characteristics = new Map<unknown, FakeCharacteristic>();
  readonly values = new Map<unknown, unknown>();
  setCharacteristic(type: unknown, value: unknown): this { this.values.set(type, value); return this; }
  getCharacteristic(type: unknown): FakeCharacteristic {
    const characteristic = this.characteristics.get(type) ?? new FakeCharacteristic();
    this.characteristics.set(type, characteristic);
    return characteristic;
  }
  testCharacteristic(type: unknown): boolean { return this.characteristics.has(type); }
  removeCharacteristic(characteristic: FakeCharacteristic): void {
    for (const [type, value] of this.characteristics) {
      if (value === characteristic) this.characteristics.delete(type);
    }
  }
}

const Service = { AccessoryInformation: 'information', Lightbulb: 'lightbulb', Switch: 'switch' };
const Characteristic = {
  Manufacturer: 'manufacturer', Model: 'model', SerialNumber: 'serial', Name: 'name', On: 'on',
  Brightness: 'brightness', Hue: 'hue', Saturation: 'saturation', ColorTemperature: 'temperature',
};

function state(
  capability: Capability,
  values: Partial<Pick<DeviceState, 'red' | 'green' | 'blue' | 'warmWhite' | 'coolWhite' | 'brightness'>> = {},
): DeviceState {
  return {
    on: false,
    brightness: values.brightness ?? 39,
    red: values.red ?? 100,
    green: values.green ?? 0,
    blue: values.blue ?? 0,
    warmWhite: values.warmWhite ?? 0,
    coolWhite: values.coolWhite ?? 0,
    raw: Buffer.alloc(14),
    query: 'current',
    capability,
    firmwareBytes: '814124614110',
  };
}

function harness(capability: Capability, initialState = state(capability)) {
  const services = new Map<unknown, FakeService>([[Service.AccessoryInformation, new FakeService()]]);
  const platform = {
    Service,
    Characteristic,
    transportOptions: () => ({}),
    deviceWentOffline: vi.fn(),
  } as unknown as MagicHomePlatform;
  const context: CachedDeviceContext = {
    schemaVersion: 1,
    stableId: 'mac:A405FD896051',
    host: '192.168.1.58',
    mac: 'A405FD896051',
    capability,
  };
  const accessory = {
    context,
    displayName: 'Test Controller',
    UUID: 'test-uuid',
    getService: (type: unknown) => services.get(type),
    addService: (type: unknown) => {
      const service = new FakeService();
      services.set(type, service);
      return service;
    },
    removeService: (service: FakeService) => {
      for (const [type, candidate] of services) if (candidate === service) services.delete(type);
    },
  } as unknown as PlatformAccessory<CachedDeviceContext>;
  const device: DiscoveredDevice = {
    host: context.host,
    mac: context.mac,
    source: 'discovery',
    sources: ['discovery'],
  };
  return { accessory, device, handler: new MagicHomeAccessory(platform, accessory, device, initialState), services };
}

afterEach(() => vi.restoreAllMocks());

describe('accessory capability behaviour', () => {
  it('removes cached colour controls when a controller is identified as a dimmer', () => {
    const { accessory, device, handler, services } = harness('rgbcct');
    const lightbulb = services.get(Service.Lightbulb)!;
    expect(lightbulb.testCharacteristic(Characteristic.Hue)).toBe(true);
    expect(lightbulb.testCharacteristic(Characteristic.ColorTemperature)).toBe(true);

    handler.update(device, state('dimmer'));

    expect(lightbulb.testCharacteristic(Characteristic.Brightness)).toBe(true);
    expect(lightbulb.testCharacteristic(Characteristic.Hue)).toBe(false);
    expect(lightbulb.testCharacteristic(Characteristic.Saturation)).toBe(false);
    expect(lightbulb.testCharacteristic(Characteristic.ColorTemperature)).toBe(false);

    handler.update({ ...device, name: 'Kitchen LEDs' }, state('dimmer'));
    expect(accessory.displayName).toBe('Kitchen LEDs');
    expect(services.get(Service.AccessoryInformation)!.values.get(Characteristic.Name)).toBe('Kitchen LEDs');
    expect(lightbulb.values.get(Characteristic.Name)).toBe('Kitchen LEDs');
  });

  it('replaces Switch and Lightbulb services when the effective capability changes', () => {
    const { device, handler, services } = harness('switch');
    expect(services.has(Service.Switch)).toBe(true);
    expect(services.has(Service.Lightbulb)).toBe(false);

    handler.update(device, state('rgb'));
    expect(services.has(Service.Switch)).toBe(false);
    expect(services.has(Service.Lightbulb)).toBe(true);
    expect(services.get(Service.Lightbulb)!.testCharacteristic(Characteristic.Hue)).toBe(true);

    handler.update(device, state('switch'));
    expect(services.has(Service.Lightbulb)).toBe(false);
    expect(services.has(Service.Switch)).toBe(true);
    expect(services.get(Service.Switch)!.testCharacteristic(Characteristic.Brightness)).toBe(false);
  });

  it('keeps RGBW colour and white output mutually exclusive', async () => {
    const setColor = vi.spyOn(MagicHomeTransport.prototype, 'setColor').mockResolvedValue();
    const { services } = harness('rgbw', state('rgbw', { brightness: 50, red: 128 }));
    const lightbulb = services.get(Service.Lightbulb)!;

    await lightbulb.getCharacteristic(Characteristic.Saturation).setter?.(100);
    expect(setColor).toHaveBeenLastCalledWith('rgbw', expect.objectContaining({ warmWhite: 0 }));

    await lightbulb.getCharacteristic(Characteristic.Saturation).setter?.(0);
    expect(setColor).toHaveBeenLastCalledWith('rgbw', {
      red: 0, green: 0, blue: 0, warmWhite: 127.49999999999999,
    });

    await lightbulb.getCharacteristic(Characteristic.Hue).setter?.(120);
    expect(setColor).toHaveBeenLastCalledWith('rgbw', {
      red: 0, green: 0, blue: 0, warmWhite: 127.49999999999999,
    });
  });

  it('preserves CCT white mode when brightness changes and reports the observed temperature', async () => {
    const cctState = state('cct', { brightness: 60, red: 0, warmWhite: 153, coolWhite: 153 });
    vi.spyOn(MagicHomeTransport.prototype, 'queryState').mockResolvedValue(cctState);
    const setColor = vi.spyOn(MagicHomeTransport.prototype, 'setColor').mockResolvedValue();
    const { services } = harness('cct', cctState);
    const lightbulb = services.get(Service.Lightbulb)!;

    await lightbulb.getCharacteristic(Characteristic.Brightness).setter?.(50);
    expect(setColor).toHaveBeenLastCalledWith('cct', expect.objectContaining({
      red: 0, green: 0, blue: 0,
      warmWhite: expect.any(Number), coolWhite: expect.any(Number),
    }));
    expect((setColor.mock.calls.at(-1)?.[1].warmWhite ?? 0) + (setColor.mock.calls.at(-1)?.[1].coolWhite ?? 0))
      .toBeCloseTo(127.5);

    await expect(lightbulb.getCharacteristic(Characteristic.ColorTemperature).getter?.()).resolves.toBe(320);
  });

  it('does not expose unconfirmed colour characteristics for unknown controllers', () => {
    const { services } = harness('unknown');
    const lightbulb = services.get(Service.Lightbulb)!;
    expect(lightbulb.testCharacteristic(Characteristic.Brightness)).toBe(true);
    expect(lightbulb.testCharacteristic(Characteristic.Hue)).toBe(false);
    expect(lightbulb.testCharacteristic(Characteristic.Saturation)).toBe(false);
  });
});
