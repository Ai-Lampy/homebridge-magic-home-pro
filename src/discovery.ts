import dgram, { type RemoteInfo, type Socket } from 'node:dgram';
import { setTimeout as delay } from 'node:timers/promises';
import { cidrBroadcast, eligibleInterfaces, isIPv4, isValidCidr, normalizeMac, type IPv4Interface } from './network.js';
import { UDP_DISCOVERY_PORT } from './settings.js';
import { probeSubnets } from './subnet-probe.js';
import type { DiscoveryConfig, DiscoveredDevice } from './types.js';

const DISCOVERY_MESSAGE = Buffer.from('HF-A11ASSISTHREAD', 'ascii');

export interface DiscoveryLogger {
  debug(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface DiscoveryOptions {
  interfaces?: IPv4Interface[];
  createSocket?: () => Socket;
  signal?: AbortSignal;
}

export interface CandidateDiscoveryOptions extends DiscoveryOptions {
  known?: readonly DiscoveredDevice[];
  manual?: readonly DiscoveredDevice[];
  discover?: (
    config: DiscoveryConfig,
    logger: DiscoveryLogger,
    options?: DiscoveryOptions,
  ) => Promise<DiscoveredDevice[]>;
  probe?: (
    config: DiscoveryConfig['subnetProbe'],
    timeoutMs: number,
    signal?: AbortSignal,
  ) => Promise<DiscoveredDevice[]>;
}

export function parseDiscoveryReply(packet: Buffer, remoteAddress: string, source: string): DiscoveredDevice | undefined {
  const sanitized = packet.toString('utf8').replace(/[\0\r\n]/g, '').trim();
  if (!sanitized) return undefined;
  const fields = sanitized.split(',').map(field => field.trim());
  const reportedHost = fields.find(isIPv4);
  const host = reportedHost ?? remoteAddress;
  if (!isIPv4(host)) return undefined;
  const mac = fields.map(normalizeMac).find((value): value is string => value !== undefined);
  const model = fields.find(field => field !== reportedHost && normalizeMac(field) === undefined && field.length > 0);
  return { host, ...(mac ? { mac } : {}), ...(model ? { model } : {}), source, sources: [source] };
}

function mergeDevice(devices: Map<string, DiscoveredDevice>, incoming: DiscoveredDevice): void {
  const incomingMac = normalizeMac(incoming.mac);
  const normalizedIncoming: DiscoveredDevice = {
    ...incoming,
    ...(incomingMac ? { mac: incomingMac } : {}),
  };
  if (!incomingMac) delete normalizedIncoming.mac;
  const key = incomingMac ?? normalizedIncoming.host;
  const existingByHost = [...devices.entries()].find(([, item]) => item.host === normalizedIncoming.host);
  const existingEntry = devices.get(key) ? [key, devices.get(key)] as const : existingByHost;
  if (!existingEntry?.[1]) {
    devices.set(key, normalizedIncoming);
    return;
  }
  const [oldKey, existing] = existingEntry;
  const merged: DiscoveredDevice = {
    ...existing,
    ...normalizedIncoming,
    sources: [...new Set([...existing.sources, ...normalizedIncoming.sources])],
  };
  // Saved configuration is authoritative for optional overrides. Their
  // absence means the user has switched the override off, so an older cached
  // value must not survive candidate merging.
  if (normalizedIncoming.source === 'configuration') {
    if (!normalizedIncoming.colorControlOverride) delete merged.colorControl;
    if (!normalizedIncoming.colorOrder) delete merged.colorOrder;
  }
  if (oldKey !== key) devices.delete(oldKey);
  devices.set(normalizeMac(merged.mac) ?? key, merged);
}

export function mergeDiscoveredDevices(input: readonly DiscoveredDevice[]): DiscoveredDevice[] {
  const merged = new Map<string, DiscoveredDevice>();
  for (const device of input) mergeDevice(merged, device);
  return [...merged.values()];
}

async function scanFromInterface(
  iface: IPv4Interface | undefined,
  targets: string[],
  config: DiscoveryConfig,
  logger: DiscoveryLogger,
  options: DiscoveryOptions,
): Promise<DiscoveredDevice[]> {
  const socket = (options.createSocket ?? (() => dgram.createSocket({ type: 'udp4', reuseAddr: false })))();
  const devices = new Map<string, DiscoveredDevice>();
  let closed = false;
  const close = (): void => {
    if (!closed) { closed = true; try { socket.close(); } catch { /* already closed */ } }
  };
  try {
    socket.on('message', (packet: Buffer, remote: RemoteInfo) => {
      const parsed = parseDiscoveryReply(packet, remote.address, iface?.name ?? 'configured-target');
      if (parsed) mergeDevice(devices, parsed);
    });
    socket.on('error', error => logger.error(`UDP discovery socket error${iface ? ` on ${iface.name}` : ''}: ${error.message}`));
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => reject(error);
      socket.once('error', onError);
      socket.bind(0, iface?.address, () => {
        socket.off('error', onError);
        try { socket.setBroadcast(true); resolve(); } catch (error) { reject(error); }
      });
    });
    for (let retry = 0; retry < config.retries; retry += 1) {
      if (options.signal?.aborted) break;
      for (const target of targets) {
        await new Promise<void>(resolve => {
          socket.send(DISCOVERY_MESSAGE, UDP_DISCOVERY_PORT, target, error => {
            if (error) logger.warn(`UDP discovery send to ${target} failed: ${error.message}`);
            resolve();
          });
        });
      }
      if (retry + 1 < config.retries) await delay(config.retryDelayMs, undefined, { signal: options.signal }).catch(() => undefined);
    }
    await delay(config.timeoutMs, undefined, { signal: options.signal }).catch(() => undefined);
  } catch (error) {
    logger.error(`UDP socket could not bind${iface ? ` to ${iface.address}` : ''}: ${(error as Error).message}`);
  } finally {
    close();
  }
  return [...devices.values()];
}

export async function discoverDevices(
  config: DiscoveryConfig,
  logger: DiscoveryLogger,
  options: DiscoveryOptions = {},
): Promise<DiscoveredDevice[]> {
  const interfaces = options.interfaces ?? eligibleInterfaces(config.interfaces);
  const configuredTargets = config.targets.map(target => isValidCidr(target) ? cidrBroadcast(target) : target);
  const scans: Promise<DiscoveredDevice[]>[] = [];
  for (const iface of interfaces) {
    const targets = new Set([iface.broadcast, ...configuredTargets]);
    if (config.limitedBroadcast) targets.add('255.255.255.255');
    scans.push(scanFromInterface(iface, [...targets], config, logger, options));
  }
  // Configured direct targets must still run when there are no eligible interfaces.
  if (interfaces.length === 0 && configuredTargets.length > 0) {
    scans.push(scanFromInterface(undefined, [...new Set(configuredTargets)], config, logger, options));
  } else if (interfaces.length === 0) {
    logger.warn('No eligible IPv4 interfaces and no configured discovery targets');
  }
  const merged = new Map<string, DiscoveredDevice>();
  for (const result of await Promise.all(scans)) for (const device of result) mergeDevice(merged, device);
  if (scans.length > 0 && merged.size === 0) logger.warn('UDP discovery packets were sent but no controller replied');
  for (const device of merged.values()) {
    if (device.sources.length > 1) logger.debug(`Duplicate response for ${device.mac ?? device.host} arrived through ${device.sources.join(', ')}`);
  }
  return [...merged.values()];
}

export async function discoverAllCandidates(
  config: DiscoveryConfig,
  logger: DiscoveryLogger,
  options: CandidateDiscoveryOptions = {},
): Promise<DiscoveredDevice[]> {
  const discover = options.discover ?? discoverDevices;
  const probe = options.probe ?? probeSubnets;
  const discoveryOptions: DiscoveryOptions = {
    ...(options.interfaces ? { interfaces: options.interfaces } : {}),
    ...(options.createSocket ? { createSocket: options.createSocket } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  };
  const [discovered, probed] = await Promise.all([
    config.enabled ? discover(config, logger, discoveryOptions) : Promise.resolve([]),
    config.subnetProbe.enabled
      ? probe(config.subnetProbe, config.timeoutMs, options.signal)
      : Promise.resolve([]),
  ]);
  return mergeDiscoveredDevices([
    ...(options.known ?? []),
    ...(options.manual ?? []),
    ...discovered,
    ...probed,
  ]);
}
