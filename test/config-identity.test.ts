import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../src/config.js';
import { readCachedContext, stableDeviceId } from '../src/identity.js';

describe('configuration and identity', () => {
  it('defaults missing and partial nested objects safely', () => {
    const config = normalizeConfig({
      discovery: { retries: 99, subnetProbe: null },
      devices: [{ host: 'bad' }, {
        host: '192.168.1.2', location: 'Kitchen', deviceType: 'led-strip', cctControl: true,
        colorControl: 'rgbwwcw', colorOrder: 'GRBWC',
      }],
      excludedDevices: [{ host: '192.168.1.3', mac: 'aa:bb:cc:dd:ee:ff' }, { host: 'bad' }],
    });
    expect(config.discovery.retries).toBe(10);
    expect(config.discovery.subnetProbe.enabled).toBe(false);
    expect(config.devices).toHaveLength(1);
    expect(config.devices[0]).toMatchObject({
      location: 'Kitchen', deviceType: 'led-strip', cctControl: true, colorControl: 'rgbwwcw', colorOrder: 'GRBWC',
    });
    expect(config.excludedDevices).toEqual([{ host: '192.168.1.3', mac: 'AABBCCDDEEFF' }]);
  });

  it('uses normalized MAC rather than changing IP for identity', () => {
    const a = stableDeviceId({ host: '192.168.1.2', mac: 'aa:bb:cc:dd:ee:ff' });
    const b = stableDeviceId({ host: '192.168.1.99', mac: 'AA-BB-CC-DD-EE-FF' });
    expect(a).toBe('mac:AABBCCDDEEFF');
    expect(b).toBe(a);
  });

  it('rejects old and corrupt cached contexts without throwing', () => {
    expect(readCachedContext(null)).toBeUndefined();
    expect(readCachedContext({ host: '192.168.1.2' })).toBeUndefined();
    expect(readCachedContext({ schemaVersion: 1, stableId: 'x', host: 'garbage' })).toBeUndefined();
  });
});
