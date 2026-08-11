import dgram from 'node:dgram';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverDevices, parseDiscoveryReply } from '../src/discovery.js';
import { normalizeConfig } from '../src/config.js';

describe('UDP discovery', () => {
  afterEach(() => vi.useRealTimers());

  it('parses whitespace, extra fields and malformed replies', () => {
    expect(parseDiscoveryReply(Buffer.from(' 192.168.1.8 , aa:bb:cc:dd:ee:ff , AK001-ZJ214 ,extra\r\n'), '10.0.0.1', 'en0'))
      .toMatchObject({ host: '192.168.1.8', mac: 'AABBCCDDEEFF', model: 'AK001-ZJ214' });
    expect(parseDiscoveryReply(Buffer.from('\0 \r\n'), '10.0.0.1', 'en0')).toBeUndefined();
    expect(parseDiscoveryReply(Buffer.from('not,a,device'), 'also-bad', 'en0')).toBeUndefined();
  });

  it('discovers a simulated device through a direct-IP target', async () => {
    const server = dgram.createSocket('udp4');
    await new Promise<void>(resolve => server.bind(48899, '127.0.0.1', resolve));
    server.on('message', (_packet, remote) => {
      server.send('127.0.0.1,AABBCCDDEEFF,sim-rgb', remote.port, remote.address);
      server.send('127.0.0.1,AABBCCDDEEFF,sim-rgb', remote.port, remote.address);
    });
    try {
      const config = normalizeConfig({ discovery: { targets: ['127.0.0.1'], limitedBroadcast: false, retries: 1, timeoutMs: 250 } }).discovery;
      const devices = await discoverDevices(config, console, { interfaces: [] });
      expect(devices).toHaveLength(1);
      expect(devices[0]).toMatchObject({ mac: 'AABBCCDDEEFF', model: 'sim-rgb' });
    } finally {
      server.close();
    }
  });
});
