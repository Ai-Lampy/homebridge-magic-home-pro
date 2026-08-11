import type { API, DynamicPlatformPlugin, Logger, PlatformAccessory, Service, Characteristic } from 'homebridge';
import { MagicHomeAccessory } from './accessory.js';
import { normalizeConfig } from './config.js';
import { discoverDevices } from './discovery.js';
import { readCachedContext, stableDeviceId } from './identity.js';
import { normalizeMac } from './network.js';
import { probeSubnets } from './subnet-probe.js';
import { MagicHomeTransport, type TransportOptions } from './transport.js';
import type { CachedDeviceContext, DiscoveredDevice, MagicHomeConfig } from './types.js';
import { PLUGIN_NAME, PLATFORM_NAME } from './settings.js';

export class MagicHomePlatform implements DynamicPlatformPlugin {
  readonly Service: typeof Service;
  readonly Characteristic: typeof Characteristic;
  private readonly config: MagicHomeConfig;
  private readonly cached = new Map<string, PlatformAccessory<CachedDeviceContext>>();
  private readonly handlers = new Map<string, MagicHomeAccessory>();
  private timer: NodeJS.Timeout | undefined;
  private scanPromise: Promise<void> | undefined;
  private abortController = new AbortController();

  constructor(readonly log: Logger, rawConfig: unknown, readonly api: API) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.config = normalizeConfig(rawConfig);
    api.on('didFinishLaunching', () => {
      void this.start().catch(error => this.log.error(`Startup discovery failed: ${(error as Error).message}`));
    });
    api.on('shutdown', () => this.shutdown());
  }

  configureAccessory(accessory: PlatformAccessory): void {
    const context = readCachedContext(accessory.context);
    if (!context) {
      this.log.warn(`Cached accessory “${accessory.displayName}” has old or corrupt context; preserving it without activating it`);
      return;
    }
    accessory.context = context;
    this.cached.set(context.stableId, accessory as PlatformAccessory<CachedDeviceContext>);
  }

  transportOptions(): TransportOptions {
    return {
      timeoutMs: this.config.discovery.timeoutMs,
      ...(this.config.logLevel === 'trace' ? { trace: (message: string) => this.log.debug(message) } : {}),
    };
  }

  private async start(): Promise<void> {
    await this.scan();
    if (this.config.discovery.intervalSeconds > 0) {
      this.timer = setInterval(() => {
        void this.scan().catch(error => this.log.error(`Periodic scan failed: ${(error as Error).message}`));
      }, this.config.discovery.intervalSeconds * 1000);
      this.timer.unref();
    }
  }

  async scan(): Promise<void> {
    if (this.scanPromise) {
      this.log.debug('Discovery scan already in progress; skipping overlapping request');
      return this.scanPromise;
    }
    this.scanPromise = this.performScan();
    try { await this.scanPromise; } finally { this.scanPromise = undefined; }
  }

  private async performScan(): Promise<void> {
    const known: DiscoveredDevice[] = [...this.cached.values()].flatMap(accessory => {
      const context = readCachedContext(accessory.context);
      return context ? [{ host: context.host, mac: context.mac, model: context.model, source: 'cache', sources: ['cache'] } as DiscoveredDevice] : [];
    });
    const manual: DiscoveredDevice[] = this.config.devices.map(device => {
      const mac = normalizeMac(device.mac);
      return ({
      host: device.host,
      ...(mac ? { mac } : {}),
      ...(device.name ? { name: device.name } : {}),
      source: 'configuration', sources: ['configuration'],
    }); });
    const discovered = this.config.discovery.enabled
      ? await discoverDevices(this.config.discovery, this.log, { signal: this.abortController.signal }) : [];
    const probed = await probeSubnets(this.config.discovery.subnetProbe, this.config.discovery.timeoutMs, this.abortController.signal);
    const candidates = this.mergeCandidates([...known, ...manual, ...discovered, ...probed]);
    if (candidates.length === 0) {
      this.log.warn('Discovery completed with zero candidates. Check UDP 48899, VLAN/broadcast routing, or configure a device IP. The controller may expose no LAN endpoint.');
      return;
    }
    await Promise.all(candidates.map(device => this.probeAndRegister(device)));
  }

  private mergeCandidates(input: DiscoveredDevice[]): DiscoveredDevice[] {
    const result = new Map<string, DiscoveredDevice>();
    for (const device of input) {
      const key = normalizeMac(device.mac) ?? device.host;
      const existingKey = [...result.keys()].find(candidate => candidate === key || result.get(candidate)?.host === device.host);
      const existing = existingKey ? result.get(existingKey) : undefined;
      const merged = existing
        ? { ...existing, ...device, sources: [...new Set([...existing.sources, ...device.sources])] }
        : { ...device, sources: [...device.sources] };
      if (existingKey && existingKey !== key) result.delete(existingKey);
      result.set(normalizeMac(merged.mac) ?? key, merged);
    }
    return [...result.values()];
  }

  private async probeAndRegister(device: DiscoveredDevice): Promise<void> {
    let state;
    try {
      state = await new MagicHomeTransport(device.host, this.transportOptions()).queryState();
    } catch (error) {
      const cached = [...this.cached.values()].find(accessory => readCachedContext(accessory.context)?.host === device.host);
      if (cached) this.log.warn(`Previously known device ${cached.displayName} at ${device.host} is offline: ${(error as Error).message}`);
      else this.log.warn(`Device candidate at ${device.host} did not expose a supported TCP 5577 protocol: ${(error as Error).message}`);
      return;
    }
    if (state.capability === 'unknown') {
      this.log.warn(`Controller at ${device.host} answered, but hardware capability is unknown (firmware ${state.firmwareBytes})`);
    }
    let accessory = [...this.cached.values()].find(item => readCachedContext(item.context)?.host === device.host);
    const stableId = accessory ? readCachedContext(accessory.context)!.stableId : stableDeviceId(device);
    accessory ??= this.cached.get(stableId);
    if (!accessory && device.mac) {
      accessory = [...this.cached.values()].find(item => normalizeMac(readCachedContext(item.context)?.mac) === normalizeMac(device.mac));
    }
    const normalizedMac = normalizeMac(device.mac);
    const context: CachedDeviceContext = {
      schemaVersion: 1, stableId, host: device.host,
      ...(normalizedMac ? { mac: normalizedMac } : {}),
      ...(device.model ? { model: device.model } : {}),
      capability: state.capability, lastSeen: new Date().toISOString(),
    };
    if (!accessory) {
      const name = device.name ?? device.model ?? `MagicHome ${device.mac?.slice(-6) ?? device.host}`;
      accessory = new this.api.platformAccessory<CachedDeviceContext>(name, this.api.hap.uuid.generate(stableId));
      accessory.context = context;
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.cached.set(stableId, accessory);
      this.log.info(`Registered ${name} at ${device.host} (${state.capability})`);
    } else {
      const previous = readCachedContext(accessory.context);
      if (previous?.host !== device.host) this.log.info(`${accessory.displayName} moved from ${previous?.host} to ${device.host}; HomeKit identity preserved`);
      accessory.context = { ...context, stableId: previous?.stableId ?? stableId };
      this.api.updatePlatformAccessories([accessory]);
    }
    const handlerKey = accessory.UUID;
    const handler = this.handlers.get(handlerKey);
    if (handler) handler.update(device, state);
    else this.handlers.set(handlerKey, new MagicHomeAccessory(this, accessory, device, state));
  }

  private shutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.abortController.abort();
    this.abortController = new AbortController();
  }
}
