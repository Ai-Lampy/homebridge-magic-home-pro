import type { PlatformConfig } from 'homebridge';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface SubnetProbeConfig {
  enabled: boolean;
  cidrs: string[];
  concurrency: number;
  ratePerSecond: number;
  allowPublic: boolean;
}

export interface DiscoveryConfig {
  enabled: boolean;
  timeoutMs: number;
  retries: number;
  retryDelayMs: number;
  limitedBroadcast: boolean;
  targets: string[];
  interfaces: string[];
  subnetProbe: SubnetProbeConfig;
}

export interface ManualDeviceConfig {
  name?: string;
  host: string;
  mac?: string;
}

export interface MagicHomeConfig extends PlatformConfig {
  platform: 'MagicHomePro';
  name: string;
  discovery: DiscoveryConfig;
  devices: ManualDeviceConfig[];
  logLevel: LogLevel;
}

export type Capability = 'rgb' | 'rgbw' | 'rgbcct' | 'cct' | 'dimmer' | 'switch' | 'unknown';

export interface DiscoveredDevice {
  host: string;
  mac?: string;
  model?: string;
  name?: string;
  source: string;
  sources: string[];
}

export interface DeviceState {
  on: boolean;
  brightness: number;
  red: number;
  green: number;
  blue: number;
  warmWhite: number;
  coolWhite: number;
  raw: Buffer;
  query: 'current' | 'legacy';
  capability: Capability;
  firmwareBytes: string;
}

export interface CachedDeviceContext {
  schemaVersion: 1;
  stableId: string;
  host: string;
  mac?: string;
  model?: string;
  capability?: Capability;
  lastSeen?: string;
}

export interface DiagnosticAttempt {
  host: string;
  source: string;
  udpReply?: string;
  tcpReachable: boolean;
  protocols: string[];
  model?: string;
  mac?: string;
  firmwareBytes?: string;
  capability?: Capability;
  error?: string;
}
