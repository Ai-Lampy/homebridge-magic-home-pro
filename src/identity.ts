import { createHash, randomUUID } from 'node:crypto';
import { isIPv4, normalizeMac } from './network.js';
import { normalizeColorOrder } from './capability.js';
import type { CachedDeviceContext, ColorControlProfile, DeviceType, DiscoveredDevice } from './types.js';

export function stableDeviceId(device: Pick<DiscoveredDevice, 'mac' | 'name' | 'model' | 'host'>): string {
  const mac = normalizeMac(device.mac);
  if (mac) return `mac:${mac}`;
  // Do not turn a DHCP address into HomeKit identity. Named manual devices get a stable
  // configuration-derived fallback; otherwise a generated ID is persisted in cache.
  const label = `${device.name ?? ''}|${device.model ?? ''}`.toLowerCase();
  if (!label.replace('|', '')) return `generated:${randomUUID()}`;
  const seed = label;
  return `manual:${createHash('sha256').update(seed).digest('hex').slice(0, 24)}`;
}

export function readCachedContext(value: unknown): CachedDeviceContext | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (item.schemaVersion !== 1 || typeof item.stableId !== 'string' || !item.stableId
    || typeof item.host !== 'string' || !isIPv4(item.host)) return undefined;
  const mac = typeof item.mac === 'string' ? normalizeMac(item.mac) : undefined;
  const capabilities: CachedDeviceContext['capability'][] = ['rgb', 'rgbw', 'rgbcct', 'cct', 'dimmer', 'switch', 'unknown'];
  const capability = typeof item.capability === 'string' && capabilities.includes(item.capability as CachedDeviceContext['capability'])
    ? item.capability as NonNullable<CachedDeviceContext['capability']> : undefined;
  const deviceTypes: DeviceType[] = ['led-strip', 'lightbulb'];
  const colorProfiles: ColorControlProfile[] = ['auto', 'rgb', 'rgbw', 'rgbww', 'rgbcct', 'rgbwcct', 'rgbwwcw'];
  const colorOrder = normalizeColorOrder(item.colorOrder);
  const detectedCapability = typeof item.detectedCapability === 'string'
    && capabilities.includes(item.detectedCapability as CachedDeviceContext['capability'])
    ? item.detectedCapability as NonNullable<CachedDeviceContext['capability']> : undefined;
  return {
    schemaVersion: 1,
    stableId: item.stableId,
    host: item.host,
    ...(typeof item.name === 'string' && item.name.trim() ? { name: item.name.trim() } : {}),
    ...(mac ? { mac } : {}),
    ...(typeof item.model === 'string' ? { model: item.model } : {}),
    ...(typeof item.location === 'string' ? { location: item.location } : {}),
    ...(typeof item.deviceType === 'string' && deviceTypes.includes(item.deviceType as DeviceType)
      ? { deviceType: item.deviceType as DeviceType } : {}),
    ...(typeof item.cctControl === 'boolean' ? { cctControl: item.cctControl } : {}),
    ...(typeof item.colorControl === 'string' && colorProfiles.includes(item.colorControl as ColorControlProfile)
      ? { colorControl: item.colorControl as ColorControlProfile } : {}),
    ...(typeof item.colorControlOverride === 'boolean' ? { colorControlOverride: item.colorControlOverride } : {}),
    ...(colorOrder ? { colorOrder } : {}),
    ...(detectedCapability ? { detectedCapability } : {}),
    ...(capability ? { capability } : {}),
    ...(typeof item.lastSeen === 'string' ? { lastSeen: item.lastSeen } : {}),
  };
}
