import type { PlatformAccessory } from 'homebridge';
import { describe, expect, it, vi } from 'vitest';
import { MagicHomeAccessory } from '../src/accessory.js';
import type { MagicHomePlatform } from '../src/platform.js';
import type { CachedDeviceContext, Capability, DeviceState, DiscoveredDevice } from '../src/types.js';

class FakeCharacteristic {
  onGet(): this { return this; }
  onSet(): this { return this; }
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

const state = (capability: Capability): DeviceState => ({
  on: false,
  brightness: 39,
  red: 100,
  green: 0,
  blue: 0,
  warmWhite: 0,
  coolWhite: 0,
  raw: Buffer.alloc(14),
  query: 'current',
  capability,
  firmwareBytes: '814124614110',
});

describe('accessory capability changes', () => {
  it('removes cached colour controls when a controller is identified as a dimmer', () => {
    const information = new FakeService();
    const lightbulb = new FakeService();
    const Service = { AccessoryInformation: 'information', Lightbulb: 'lightbulb', Switch: 'switch' };
    const Characteristic = {
      Manufacturer: 'manufacturer', Model: 'model', SerialNumber: 'serial', Name: 'name', On: 'on',
      ConfiguredName: 'configured-name',
      Brightness: 'brightness', Hue: 'hue', Saturation: 'saturation', ColorTemperature: 'temperature',
    };
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
      capability: 'rgbcct',
    };
    const accessory = {
      context,
      displayName: 'LED Dim Controller',
      UUID: 'test-uuid',
      getService: (type: unknown) => type === Service.AccessoryInformation ? information : lightbulb,
      addService: () => lightbulb,
    } as unknown as PlatformAccessory<CachedDeviceContext>;
    const device: DiscoveredDevice = {
      host: context.host,
      mac: context.mac,
      source: 'discovery',
      sources: ['discovery'],
    };

    const handler = new MagicHomeAccessory(platform, accessory, device, state('rgbcct'));
    expect(lightbulb.testCharacteristic(Characteristic.Hue)).toBe(true);
    expect(lightbulb.testCharacteristic(Characteristic.ColorTemperature)).toBe(true);

    handler.update(device, state('dimmer'));

    expect(lightbulb.testCharacteristic(Characteristic.Brightness)).toBe(true);
    expect(lightbulb.testCharacteristic(Characteristic.Hue)).toBe(false);
    expect(lightbulb.testCharacteristic(Characteristic.Saturation)).toBe(false);
    expect(lightbulb.testCharacteristic(Characteristic.ColorTemperature)).toBe(false);

    handler.update({ ...device, name: 'Kitchen LEDs' }, state('dimmer'));
    expect(accessory.displayName).toBe('Kitchen LEDs');
    expect(information.values.get(Characteristic.Name)).toBe('Kitchen LEDs');
    expect(lightbulb.values.get(Characteristic.Name)).toBe('Kitchen LEDs');
    expect(lightbulb.values.get(Characteristic.ConfiguredName)).toBe('Kitchen LEDs');
  });
});
