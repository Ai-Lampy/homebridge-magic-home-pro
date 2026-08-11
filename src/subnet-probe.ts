import { setTimeout as delay } from 'node:timers/promises';
import { cidrHosts } from './network.js';
import { MagicHomeTransport } from './transport.js';
import type { DiscoveredDevice, SubnetProbeConfig } from './types.js';

export async function probeSubnets(
  config: SubnetProbeConfig,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<DiscoveredDevice[]> {
  if (!config.enabled) return [];
  const hosts = [...new Set(config.cidrs.flatMap(cidr => cidrHosts(cidr, config.allowPublic)))];
  const found: DiscoveredDevice[] = [];
  let cursor = 0;
  const spacing = Math.ceil(1000 / config.ratePerSecond);
  const workers = Array.from({ length: Math.min(config.concurrency, hosts.length) }, async () => {
    while (cursor < hosts.length && !signal?.aborted) {
      const index = cursor++;
      const host = hosts[index];
      if (!host) return;
      if (index > 0 && spacing > 0) await delay(spacing, undefined, { signal }).catch(() => undefined);
      try {
        await new MagicHomeTransport(host, { timeoutMs }).queryState();
        found.push({ host, source: 'subnet-probe', sources: ['subnet-probe'] });
      } catch { /* A closed or incompatible host is an expected scan result. */ }
    }
  });
  await Promise.all(workers);
  return found;
}
