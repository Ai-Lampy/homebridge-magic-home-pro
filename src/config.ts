import { isIPv4, isValidCidr } from './network.js';
import type { DiscoveryConfig, LogLevel, MagicHomeConfig, ManualDeviceConfig, SubnetProbeConfig } from './types.js';

const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const bool = (value: unknown, fallback: boolean): boolean => typeof value === 'boolean' ? value : fallback;
const integer = (value: unknown, fallback: number, min: number, max: number): number =>
  Number.isInteger(value) ? Math.min(max, Math.max(min, value as number)) : fallback;
const strings = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean)
  : [];

export function normalizeConfig(input: unknown): MagicHomeConfig {
  const root = object(input);
  const discoveryInput = object(root.discovery);
  const subnetInput = object(discoveryInput.subnetProbe);
  const subnetProbe: SubnetProbeConfig = {
    enabled: bool(subnetInput.enabled, false),
    cidrs: strings(subnetInput.cidrs).filter(isValidCidr),
    concurrency: integer(subnetInput.concurrency, 10, 1, 64),
    ratePerSecond: integer(subnetInput.ratePerSecond, 20, 1, 200),
    allowPublic: bool(subnetInput.allowPublic, false),
  };
  const discovery: DiscoveryConfig = {
    enabled: bool(discoveryInput.enabled, true),
    timeoutMs: integer(discoveryInput.timeoutMs, 3000, 250, 30000),
    retries: integer(discoveryInput.retries, 3, 1, 10),
    retryDelayMs: integer(discoveryInput.retryDelayMs, 250, 0, 10000),
    limitedBroadcast: bool(discoveryInput.limitedBroadcast, true),
    targets: strings(discoveryInput.targets).filter(value => isIPv4(value) || isValidCidr(value)),
    interfaces: strings(discoveryInput.interfaces),
    subnetProbe,
  };
  const devices: ManualDeviceConfig[] = Array.isArray(root.devices) ? root.devices.flatMap(value => {
    const item = object(value);
    if (typeof item.host !== 'string' || !isIPv4(item.host.trim())) return [];
    return [{
      host: item.host.trim(),
      ...(typeof item.name === 'string' && item.name.trim() ? { name: item.name.trim() } : {}),
      ...(typeof item.mac === 'string' && item.mac.trim() ? { mac: item.mac.trim() } : {}),
    }];
  }) : [];
  const levels: LogLevel[] = ['error', 'warn', 'info', 'debug', 'trace'];
  const requestedLevel = root.logLevel;
  return {
    platform: 'MagicHomePro',
    name: typeof root.name === 'string' && root.name.trim() ? root.name.trim() : 'Magic Home Pro',
    discovery,
    devices,
    logLevel: typeof requestedLevel === 'string' && levels.includes(requestedLevel as LogLevel)
      ? requestedLevel as LogLevel : 'info',
  };
}
