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
    expect(query).toHaveBeenNthCalledWith(1, '192.168.1.1', 500);
    expect(found).toHaveLength(6);
  });

  it('keeps scanning when an individual host probe fails', async () => {
    const config: SubnetProbeConfig = {
      enabled: true,
      cidrs: ['192.168.1.0/30'],
      concurrency: 2,
      ratePerSecond: 20,
      allowPublic: false,
    };
    const query = vi.fn(async (host: string) => {
      if (host === '192.168.1.1') throw new Error('offline');
    });

    const found = await probeSubnets(config, 250, undefined, {
      now: () => 0,
      wait: async () => undefined,
      query,
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(found).toEqual([{ host: '192.168.1.2', source: 'subnet-probe', sources: ['subnet-probe'] }]);
  });

  it('rejects invalid and excessive CIDR ranges before probing', async () => {
    const base: SubnetProbeConfig = {
      enabled: true,
      cidrs: [],
      concurrency: 1,
      ratePerSecond: 20,
      allowPublic: false,
    };

    await expect(probeSubnets({ ...base, cidrs: ['192.168.1.0/33'] }, 250)).rejects.toThrow(/Invalid IPv4 CIDR/);
    await expect(probeSubnets({ ...base, cidrs: ['10.0.0.0/8'] }, 250)).rejects.toThrow(/too large/);
  });
});
