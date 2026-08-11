import { describe, expect, it, vi } from 'vitest';
import { MagicHomePlatform } from '../src/platform.js';

describe('device removal', () => {
  it('unregisters an excluded device and removes it from the runtime cache', () => {
    const accessory = {
      UUID: 'accessory-uuid',
      displayName: 'Kitchen Strip',
      context: {
        schemaVersion: 1,
        stableId: 'mac:AABBCCDDEEFF',
        host: '192.168.1.20',
        mac: 'AABBCCDDEEFF',
      },
    };
    const unregisterPlatformAccessories = vi.fn();
    const platform = Object.create(MagicHomePlatform.prototype) as MagicHomePlatform & Record<string, unknown>;
    Object.assign(platform, {
      config: { excludedDevices: [{ host: '192.168.1.20', mac: 'AABBCCDDEEFF' }] },
      cached: new Map([['mac:AABBCCDDEEFF', accessory]]),
      handlers: new Map([['accessory-uuid', {}]]),
      api: { unregisterPlatformAccessories },
      log: { info: vi.fn() },
    });

    (platform as unknown as { removeExcludedCachedAccessories(): void }).removeExcludedCachedAccessories();

    expect(unregisterPlatformAccessories).toHaveBeenCalledWith(
      'homebridge-magic-home-pro', 'MagicHomePro', [accessory],
    );
    expect((platform as unknown as { cached: Map<string, unknown> }).cached).toHaveLength(0);
    expect((platform as unknown as { handlers: Map<string, unknown> }).handlers).toHaveLength(0);
  });
});
