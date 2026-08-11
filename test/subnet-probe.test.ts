import { describe, expect, it, vi } from 'vitest';
import { probeSubnets } from '../src/subnet-probe.js';
import type { SubnetProbeConfig } from '../src/types.js';

describe('bounded subnet probing', () => {
  it('applies one global rate schedule across all concurrent workers', async () => {
    const config: SubnetProbeConfig = {
      enabled: true,
      cidrs: ['192.168.1.0/29'],
      concurrency: 6,
      ratePerSecond: 20,
      allowPublic: false,
    };
    const waits: number[] = [];
    const query = vi.fn(async () => undefined);

    const found = await probeSubnets(config, 500, undefined, {
      now: () => 0,
      wait: async delayMs => { waits.push(delayMs); },
      query,
    });

    expect(waits).toEqual([0, 50, 100, 150, 200, 250]);
    expect(query).toHaveBeenCalledTimes(6);
    expect(found).toHaveLength(6);
  });
});
