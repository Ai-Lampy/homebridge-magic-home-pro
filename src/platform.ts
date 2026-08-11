import type {
  API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service,
} from 'homebridge';
import { MagicHomeAccessory } from './accessory.js';
import { effectiveCapability } from './capability.js';
import { normalizeConfig } from './config.js';
import { discoverDevices } from './discovery.js';
import { readCachedContext, stableDeviceId } from './identity.js';
import { normalizeMac } from './network.js';
import { retryWithDelay } from './retry.js';
import {
  DEVICE_RESCAN_DELAY_MS, DEVICE_SCAN_ATTEMPTS, PLATFORM_NAME, PLUGIN_NAME,
} from './settings.js';
import { probeSubnets } from './subnet-probe.js';
import { MagicHomeTransport, type TransportOptions } from './transport.js';
import type { CachedDeviceContext, DiscoveredDevice, MagicHomeConfig } from './types.js';

export class MagicHomePlatform implements DynamicPlatformPlugin {
  readonly Service: typeof Service;
  readonly Characteristic: typeof Characteristic;
  private readonly config: MagicHomeConfig;
  private readonly cached = new Map<string, PlatformAccessory<CachedDeviceContext>>();
  private readonly handlers = new Map<string, MagicHomeAccessory>();
  private readonly recoveryTasks = new Map<string, Promise<void>>();
  private scanPromise: Promise<Set<string>> | undefined;
  private readonly abortController = new AbortController();

  constructor(readonly log: Logger, rawConfig: PlatformConfig, readonly api: API) {
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
    const cachedAccessory = accessory as PlatformAccessory<CachedDeviceContext>;
    this.cached.set(context.stableId, cachedAccessory);
    this.handlers.set(accessory.UUID, new MagicHomeAccessory(this, cachedAccessory, this.deviceFromContext(context)));
  }

  transportOptions(): TransportOptions {
    return {
      timeoutMs: this.config.discovery.timeoutMs,
      ...(this.config.logLevel === 'trace' ? { trace: (message: string) => this.log.debug(message) } : {}),
    };
  }

  private async start(): Promise<void> {
    this.removeExcludedCachedAccessories();
    const pending = new Set(this.cached.keys());
    const result = await retryWithDelay(
      DEVICE_SCAN_ATTEMPTS,
      DEVICE_RESCAN_DELAY_MS,
      async attempt => {
        if (attempt > 1) {
          this.log.info(`Startup recovery scan ${attempt}/${DEVICE_SCAN_ATTEMPTS} for ${pending.size} missing cached device(s)`);
        }
        const found = await this.scan(true);
        for (const stableId of found) pending.delete(stableId);
        return found;
      },
      () => pending.size === 0,
      this.abortController.signal,
    );
    if (!result.succeeded && !this.abortController.signal.aborted) {
      for (const stableId of pending) {
        this.disableCachedDevice(stableId, `not found after ${DEVICE_SCAN_ATTEMPTS} startup scans`);
      }
    }
  }

  async scan(registerNewDevices = true): Promise<Set<string>> {
    if (this.scanPromise) {
      this.log.debug('Discovery scan already in progress; joining the existing scan');
      return this.scanPromise;
    }
    const scan = this.performScan(registerNewDevices);
    this.scanPromise = scan;
    try {
      return await scan;
    } finally {
      if (this.scanPromise === scan) this.scanPromise = undefined;
    }
  }

  private async performScan(registerNewDevices: boolean): Promise<Set<string>> {
    const known: DiscoveredDevice[] = [...this.cached.values()].flatMap(accessory => {
      const context = readCachedContext(accessory.context);
      return context ? [this.deviceFromContext(context)] : [];
    });
    const manual: DiscoveredDevice[] = this.config.devices.map(device => {
      const mac = normalizeMac(device.mac);
      return {
        host: device.host,
        ...(mac ? { mac } : {}),
        ...(device.name ? { name: device.name } : {}),
        ...(device.location ? { location: device.location } : {}),
        ...(device.deviceType ? { deviceType: device.deviceType } : {}),
        ...(device.cctControl !== undefined ? { cctControl: device.cctControl } : {}),
        ...(device.colorControl ? { colorControl: device.colorControl } : {}),
        ...(device.colorOrder ? { colorOrder: device.colorOrder } : {}),
        source: 'configuration',
        sources: ['configuration'],
      };
    });
    const discovered = this.config.discovery.enabled
      ? await discoverDevices(this.config.discovery, this.log, { signal: this.abortController.signal }) : [];
    const probed = await probeSubnets(
      this.config.discovery.subnetProbe,
      this.config.discovery.timeoutMs,
      this.abortController.signal,
    );
    const candidates = this.mergeCandidates([...known, ...manual, ...discovered, ...probed])
      .filter(device => !this.isExcluded(device));
    if (candidates.length === 0) {
      this.log.warn('Discovery completed with zero candidates. Check UDP 48899, VLAN/broadcast routing, or configure a device IP. The controller may expose no LAN endpoint.');
      return new Set();
    }
    const found = await Promise.all(candidates.map(device => this.probeAndRegister(device, registerNewDevices)));
    return new Set(found.filter((stableId): stableId is string => stableId !== undefined));
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

  private async probeAndRegister(device: DiscoveredDevice, registerNewDevice: boolean): Promise<string | undefined> {
    let state;
    try {
      state = await new MagicHomeTransport(device.host, {
        ...this.transportOptions(),
        ...(device.colorOrder ? { colorOrder: device.colorOrder } : {}),
      }).queryState();
    } catch (error) {
      const cached = [...this.cached.values()].find(accessory => readCachedContext(accessory.context)?.host === device.host);
      if (cached) this.log.warn(`Previously known device ${cached.displayName} at ${device.host} is offline: ${(error as Error).message}`);
      else this.log.warn(`Device candidate at ${device.host} did not expose a supported TCP 5577 protocol: ${(error as Error).message}`);
      return undefined;
    }
    if (state.capability === 'unknown') {
      this.log.warn(`Controller at ${device.host} answered, but hardware capability is unknown (firmware ${state.firmwareBytes})`);
    }
    const detectedCapability = state.capability;
    state = {
      ...state,
      capability: effectiveCapability(detectedCapability, device.colorControl, device.cctControl),
    };
    if (state.capability !== detectedCapability) {
      this.log.info(`Capability override for ${device.name ?? device.host}: ${detectedCapability} → ${state.capability}`);
    }
    let accessory = [...this.cached.values()].find(item => readCachedContext(item.context)?.host === device.host);
    const stableId = accessory ? readCachedContext(accessory.context)!.stableId : stableDeviceId(device);
    accessory ??= this.cached.get(stableId);
    if (!accessory && device.mac) {
      accessory = [...this.cached.values()].find(item =>
        normalizeMac(readCachedContext(item.context)?.mac) === normalizeMac(device.mac));
    }
    if (!accessory && !registerNewDevice) return undefined;

    const normalizedMac = normalizeMac(device.mac);
    const context: CachedDeviceContext = {
      schemaVersion: 1,
      stableId,
      host: device.host,
      ...(normalizedMac ? { mac: normalizedMac } : {}),
      ...(device.model ? { model: device.model } : {}),
      ...(device.location ? { location: device.location } : {}),
      ...(device.deviceType ? { deviceType: device.deviceType } : {}),
      ...(device.cctControl !== undefined ? { cctControl: device.cctControl } : {}),
      ...(device.colorControl ? { colorControl: device.colorControl } : {}),
      ...(device.colorOrder ? { colorOrder: device.colorOrder } : {}),
      capability: state.capability,
      lastSeen: new Date().toISOString(),
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
      if (previous?.host !== device.host) {
        this.log.info(`${accessory.displayName} moved from ${previous?.host} to ${device.host}; HomeKit identity preserved`);
      }
      accessory.context = { ...context, stableId: previous?.stableId ?? stableId };
      if (device.name && accessory.displayName !== device.name) accessory.displayName = device.name;
      this.api.updatePlatformAccessories([accessory]);
    }
    const handler = this.handlers.get(accessory.UUID);
    if (handler) handler.update(device, state);
    else this.handlers.set(accessory.UUID, new MagicHomeAccessory(this, accessory, device, state));
    return accessory.context.stableId;
  }

  deviceWentOffline(
    accessory: PlatformAccessory<CachedDeviceContext>,
    device: DiscoveredDevice,
    error: Error,
  ): void {
    const stableId = accessory.context.stableId;
    if (this.recoveryTasks.has(stableId) || this.abortController.signal.aborted) return;
    this.handlers.get(accessory.UUID)?.disable(`communication failed: ${error.message}`);
    this.log.warn(`${accessory.displayName} went offline; starting ${DEVICE_SCAN_ATTEMPTS} recovery scans 10 seconds apart`);
    const task = this.recoverDevice(stableId, device).finally(() => this.recoveryTasks.delete(stableId));
    this.recoveryTasks.set(stableId, task);
    void task.catch(recoveryError =>
      this.log.error(`Recovery for ${accessory.displayName} failed: ${(recoveryError as Error).message}`));
  }

  private async recoverDevice(stableId: string, lastDevice: DiscoveredDevice): Promise<void> {
    const result = await retryWithDelay(
      DEVICE_SCAN_ATTEMPTS,
      DEVICE_RESCAN_DELAY_MS,
      async attempt => {
        this.log.info(`Offline recovery scan ${attempt}/${DEVICE_SCAN_ATTEMPTS} for ${lastDevice.mac ?? lastDevice.host}`);
        const replies = this.config.discovery.enabled
          ? await discoverDevices(this.config.discovery, this.log, { signal: this.abortController.signal }) : [];
        const normalizedMac = normalizeMac(lastDevice.mac);
        const rediscovered = normalizedMac
          ? replies.find(reply => normalizeMac(reply.mac) === normalizedMac)
          : replies.find(reply => reply.host === lastDevice.host);
        const candidate = rediscovered
          ? this.mergeCandidates([lastDevice, rediscovered])[0] ?? lastDevice
          : lastDevice;
        return this.probeAndRegister(candidate, false);
      },
      foundStableId => foundStableId === stableId,
      this.abortController.signal,
    );
    if (result.succeeded) {
      this.log.info(`Recovered ${lastDevice.mac ?? lastDevice.host} after ${result.attempts} scan(s)`);
    } else if (!this.abortController.signal.aborted) {
      this.disableCachedDevice(stableId, `not found after ${DEVICE_SCAN_ATTEMPTS} offline recovery scans`);
    }
  }

  private disableCachedDevice(stableId: string, reason: string): void {
    const accessory = this.cached.get(stableId);
    if (!accessory) return;
    this.handlers.get(accessory.UUID)?.disable(reason);
    this.log.error(`Disabled ${accessory.displayName}: ${reason}. The cached accessory is preserved.`);
  }

  private isExcluded(device: Pick<DiscoveredDevice, 'host' | 'mac'>): boolean {
    const deviceMac = normalizeMac(device.mac);
    return this.config.excludedDevices.some(excluded => {
      const excludedMac = normalizeMac(excluded.mac);
      if (deviceMac && excludedMac) return deviceMac === excludedMac;
      return Boolean(excluded.host && excluded.host === device.host);
    });
  }

  private removeExcludedCachedAccessories(): void {
    for (const [stableId, accessory] of this.cached) {
      const context = readCachedContext(accessory.context);
      if (!context || !this.isExcluded(context)) continue;
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.cached.delete(stableId);
      this.handlers.delete(accessory.UUID);
      this.log.info(`Removed ${accessory.displayName} from the Homebridge accessory cache`);
    }
  }

  private deviceFromContext(context: CachedDeviceContext): DiscoveredDevice {
    return {
      host: context.host,
      ...(context.mac ? { mac: context.mac } : {}),
      ...(context.model ? { model: context.model } : {}),
      ...(context.location ? { location: context.location } : {}),
      ...(context.deviceType ? { deviceType: context.deviceType } : {}),
      ...(context.cctControl !== undefined ? { cctControl: context.cctControl } : {}),
      ...(context.colorControl ? { colorControl: context.colorControl } : {}),
      ...(context.colorOrder ? { colorOrder: context.colorOrder } : {}),
      source: 'cache',
      sources: ['cache'],
    };
  }

  private shutdown(): void {
    this.abortController.abort();
  }
}
