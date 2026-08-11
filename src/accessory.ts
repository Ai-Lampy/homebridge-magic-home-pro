import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { MagicHomePlatform } from './platform.js';
import { MagicHomeTransport } from './transport.js';
import type { CachedDeviceContext, Capability, DeviceState, DiscoveredDevice } from './types.js';

function hsvToRgb(hue: number, saturation: number, brightness: number): [number, number, number] {
  const s = saturation / 100;
  const v = brightness / 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;
  let rgb: [number, number, number];
  if (hue < 60) rgb = [c, x, 0]; else if (hue < 120) rgb = [x, c, 0];
  else if (hue < 180) rgb = [0, c, x]; else if (hue < 240) rgb = [0, x, c];
  else if (hue < 300) rgb = [x, 0, c]; else rgb = [c, 0, x];
  return rgb.map(value => Math.round((value + m) * 255)) as [number, number, number];
}

function rgbToHsv(red: number, green: number, blue: number): [number, number, number] {
  const [r, g, b] = [red, green, blue].map(value => value / 255) as [number, number, number];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let hue = 0;
  if (delta && max === r) hue = 60 * (((g - b) / delta) % 6);
  else if (delta && max === g) hue = 60 * (((b - r) / delta) + 2);
  else if (delta) hue = 60 * (((r - g) / delta) + 4);
  if (hue < 0) hue += 360;
  return [hue, max === 0 ? 0 : delta / max * 100, max * 100];
}

export class MagicHomeAccessory {
  private service: Service;
  private state: DeviceState | undefined;
  private hue = 0;
  private saturation = 0;
  private brightness = 100;
  private capability: Capability;
  private disabledReason: string | undefined;

  constructor(
    private readonly platform: MagicHomePlatform,
    private readonly accessory: PlatformAccessory<CachedDeviceContext>,
    private device: DiscoveredDevice,
    initialState?: DeviceState,
  ) {
    this.state = initialState;
    this.capability = initialState?.capability ?? accessory.context.capability ?? 'unknown';
    if (initialState) [this.hue, this.saturation, this.brightness] = rgbToHsv(initialState.red, initialState.green, initialState.blue);
    const { Service, Characteristic } = platform;
    const accessoryName = device.name ?? accessory.displayName;
    accessory.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Name, accessoryName)
      .setCharacteristic(Characteristic.Manufacturer, 'MagicHome / LEDnet')
      .setCharacteristic(Characteristic.Model, this.modelLabel(device))
      .setCharacteristic(Characteristic.SerialNumber, device.mac ?? accessory.context.stableId);
    const serviceType = this.capability === 'switch' ? Service.Switch : Service.Lightbulb;
    this.service = accessory.getService(serviceType) ?? accessory.addService(serviceType);
    this.service.setCharacteristic(Characteristic.Name, accessoryName);
    this.service.getCharacteristic(Characteristic.On)
      .onGet(async () => (await this.refresh()).on)
      .onSet(async value => this.execute(transport => transport.setPower(Boolean(value))));
    this.syncOptionalCharacteristics();
  }

  private syncOptionalCharacteristics(): void {
    const { Characteristic } = this.platform;
    const supportsBrightness = this.capability !== 'switch';
    const supportsColor = ['rgb', 'rgbw', 'rgbcct', 'unknown'].includes(this.capability);
    const supportsTemperature = ['rgbcct', 'cct'].includes(this.capability);
    if (supportsBrightness) {
      this.service.getCharacteristic(Characteristic.Brightness)
        .onGet(async () => (await this.refresh()).brightness)
        .onSet(async value => { this.brightness = Number(value); await this.sendColor(); });
    } else {
      this.removeCharacteristic(Characteristic.Brightness);
    }
    if (supportsColor) {
      this.service.getCharacteristic(Characteristic.Hue)
        .onGet(async () => { await this.refresh(); return this.hue; })
        .onSet(async value => { this.hue = Number(value); await this.sendColor(); });
      this.service.getCharacteristic(Characteristic.Saturation)
        .onGet(async () => { await this.refresh(); return this.saturation; })
        .onSet(async value => { this.saturation = Number(value); await this.sendColor(); });
    } else {
      this.removeCharacteristic(Characteristic.Hue);
      this.removeCharacteristic(Characteristic.Saturation);
    }
    if (supportsTemperature) {
      this.service.getCharacteristic(Characteristic.ColorTemperature)
        .onGet(() => 250)
        .onSet(async (value: CharacteristicValue) => {
          const mired = Math.max(140, Math.min(500, Number(value)));
          const ratio = (mired - 140) / 360;
          await this.execute(transport => transport.setColor(this.capability, {
            red: 0, green: 0, blue: 0,
            warmWhite: 255 * ratio * this.brightness / 100,
            coolWhite: 255 * (1 - ratio) * this.brightness / 100,
          }));
        });
    } else {
      this.removeCharacteristic(Characteristic.ColorTemperature);
    }
  }

  private removeCharacteristic(type: typeof this.platform.Characteristic.Brightness): void {
    if (this.service.testCharacteristic(type)) this.service.removeCharacteristic(this.service.getCharacteristic(type));
  }

  update(device: DiscoveredDevice, state?: DeviceState): void {
    this.device = device;
    this.disabledReason = undefined;
    const { Service, Characteristic } = this.platform;
    const accessoryName = device.name ?? this.accessory.displayName;
    this.accessory.displayName = accessoryName;
    this.accessory.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Name, accessoryName)
      .setCharacteristic(Characteristic.Model, this.modelLabel(device));
    this.service.setCharacteristic(Characteristic.Name, accessoryName);
    if (state) {
      this.state = state;
      const capabilityChanged = this.capability !== state.capability;
      this.capability = state.capability;
      if (capabilityChanged) this.syncOptionalCharacteristics();
    }
  }

  private modelLabel(device: DiscoveredDevice): string {
    const type = device.deviceType === 'led-strip' ? 'LED Strip' : device.deviceType === 'lightbulb' ? 'Lightbulb' : undefined;
    return [type, device.model].filter(Boolean).join(' · ') || 'LAN controller';
  }

  disable(reason: string): void {
    this.disabledReason = reason;
  }

  private transport(): MagicHomeTransport {
    return new MagicHomeTransport(this.device.host, {
      ...this.platform.transportOptions(),
      ...(this.device.colorOrder ? { colorOrder: this.device.colorOrder } : {}),
    });
  }

  private async refresh(): Promise<DeviceState> {
    this.state = await this.execute(transport => transport.queryState());
    [this.hue, this.saturation, this.brightness] = rgbToHsv(this.state.red, this.state.green, this.state.blue);
    return this.state;
  }

  private async sendColor(): Promise<void> {
    const [red, green, blue] = hsvToRgb(this.hue, this.saturation, this.brightness);
    await this.execute(transport => transport.setColor(this.capability, {
      red,
      green,
      blue,
      warmWhite: this.capability === 'rgbw' ? this.brightness * 2.55 : 0,
    }));
  }

  private async execute<T>(operation: (transport: MagicHomeTransport) => Promise<T>): Promise<T> {
    if (this.disabledReason) throw new Error(`MagicHome device is unavailable: ${this.disabledReason}`);
    try {
      return await operation(this.transport());
    } catch (error) {
      this.platform.deviceWentOffline(this.accessory, this.device, error as Error);
      throw error;
    }
  }
}
