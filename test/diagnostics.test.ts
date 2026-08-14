import { describe, expect, it, vi } from 'vitest';
import { normalizeConfig } from '../src/config.js';
import { diagnosticScan } from '../src/diagnostics.js';
import type { DeviceState, DiscoveredDevice } from '../src/types.js';

const logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() };

function state(): DeviceState {
  return {
    on: true,
    brightness: 100,
    red: 255,
    green: 0,
    blue: 0,
    warmWhite: 0,
    coolWhite: 0,
    raw: Buffer.alloc(14),
    query: 'current',
    capability: 'rgb',
    firmwareBytes: '813523612100',
  };
}

describe('diagnostic discovery', () => {
  it('includes configured subnet probing, merges duplicate sources, and retains manual devices', async () => {
    const config = normalizeConfig({
      discovery: { subnetProbe: { enabled: true, cidrs: ['192.168.1.0/30'] } },
    }).discovery;
    const manual: DiscoveredDevice = {
      host: '192.168.1.20',
      name: 'Manual light',
      source: 'configuration',
      sources: ['configuration'],
    };
    const discover = vi.fn(async () => [{
      host: '192.168.1.40',
      mac: 'aa:bb:cc:dd:ee:ff',
      model: 'AK001',
      source: 'udp',
      sources: ['udp'],
    }]);
    const probe = vi.fn(async () => [{
      host: '192.168.1.40',
      source: 'subnet-probe',
      sources: ['subnet-probe'],
    }]);
    const queryState = vi.fn(async () => state());

    const report = await diagnosticScan(config, [manual], logger, {
      discovery: { discover, probe },
      queryState,
    });

    expect(discover).toHaveBeenCalledOnce();
    expect(probe).toHaveBeenCalledOnce();
    expect(queryState).toHaveBeenCalledTimes(2);
    expect(report).toHaveLength(2);
    expect(report).toContainEqual(expect.objectContaining({
      host: '192.168.1.40',
      mac: 'AABBCCDDEEFF',
      model: 'AK001',
      source: 'udp, subnet-probe',
      tcpReachable: true,
    }));
    expect(report).toContainEqual(expect.objectContaining({
      host: '192.168.1.20',
      source: 'configuration',
      tcpReachable: true,
    }));
  });

  it('skips subnet probing when it is disabled', async () => {
    const config = normalizeConfig({ discovery: { subnetProbe: { enabled: false } } }).discovery;
    const discover = vi.fn(async () => []);
    const probe = vi.fn(async () => []);

    await diagnosticScan(config, [], logger, {
      discovery: { discover, probe },
      queryState: async () => state(),
    });

    expect(discover).toHaveBeenCalledOnce();
    expect(probe).not.toHaveBeenCalled();
  });
});
