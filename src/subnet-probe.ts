import { setTimeout as delay } from 'node:timers/promises';
import { cidrHosts } from './network.js';
import { MagicHomeTransport } from './transport.js';
import type { DiscoveredDevice, SubnetProbeConfig } from './types.js';

export interface SubnetProbeOptions {
  now?: () => number;
  wait?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  query?: (host: string, timeoutMs: number) => Promise<void>;
}

const defaultWait = async (delayMs: number, signal?: AbortSignal): Promise<void> => {
  if (delayMs <= 0 || signal?.aborted) return;
  await delay(delayMs, undefined, { signal }).catch(() => undefined);
};

export async function probeSubnets(
  config: SubnetProbeConfig,
  timeoutMs: number,
  signal?: AbortSignal,
  options: SubnetProbeOptions = {},
): Promise<DiscoveredDevice[]> {
  if (!config.enabled) return [];
  const hosts = [...new Set(config.cidrs.flatMap(cidr => cidrHosts(cidr, config.allowPublic)))];
  const found: DiscoveredDevice[] = [];
  let cursor = 0;
  let nextProbeAt = (options.now ?? Date.now)();
  const spacing = Math.ceil(1000 / config.ratePerSecond);
  const wait = options.wait ?? defaultWait;
  const query = options.query ?? (async (host: string, queryTimeoutMs: number) => {
    await new MagicHomeTransport(host, { timeoutMs: queryTimeoutMs }).queryState();
  });
  const workers = Array.from({ length: Math.min(config.concurrency, hosts.length) }, async () => {
    while (cursor < hosts.length && !signal?.aborted) {
      const index = cursor++;
      const host = hosts[index];
      if (!host) return;
      const scheduledAt = nextProbeAt;
      nextProbeAt += spacing;
      await wait(Math.max(0, scheduledAt - (options.now ?? Date.now)()), signal);
      if (signal?.aborted) return;
      try {
        await query(host, timeoutMs);
        found.push({ host, source: 'subnet-probe', sources: ['subnet-probe'] });
      } catch { /* A closed or incompatible host is an expected scan result. */ }
    }
  });
  await Promise.all(workers);
  return found;
}
