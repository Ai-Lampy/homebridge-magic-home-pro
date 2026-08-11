import os from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  broadcastAddress, cidrBroadcast, cidrHosts, eligibleInterfaces, isPrivateOrLocal,
} from '../src/network.js';

describe('IPv4 network calculations', () => {
  it.each([
    ['10.2.3.4', '255.255.0.0', '10.2.255.255'],
    ['192.168.2.17', '255.255.254.0', '192.168.3.255'],
    ['192.168.2.17', '255.255.255.0', '192.168.2.255'],
    ['192.168.2.17', '255.255.255.255', '192.168.2.17'],
  ])('broadcast for %s/%s', (ip, mask, expected) => {
    expect(broadcastAddress(ip, mask)).toBe(expected);
  });

  it.each([
    ['10.2.3.4/16', '10.2.255.255'],
    ['192.168.2.17/23', '192.168.3.255'],
    ['192.168.2.17/24', '192.168.2.255'],
    ['192.168.2.17/32', '192.168.2.17'],
  ])('CIDR broadcast for %s', (cidr, expected) => expect(cidrBroadcast(cidr)).toBe(expected));

  it('handles /32 hosts and restricts probing to local ranges', () => {
    expect(cidrHosts('192.168.1.7/32')).toEqual(['192.168.1.7']);
    expect(() => cidrHosts('8.8.8.8/32')).toThrow(/non-private/);
    expect(isPrivateOrLocal('100.64.1.2')).toBe(true);
  });

  it('enumerates multiple interfaces and removes exact duplicates', () => {
    const source: ReturnType<typeof os.networkInterfaces> = {
      en0: [
        { address: '192.168.1.2', netmask: '255.255.255.0', family: 'IPv4', mac: '', internal: false, cidr: '192.168.1.2/24' },
        { address: '192.168.1.2', netmask: '255.255.255.0', family: 'IPv4', mac: '', internal: false, cidr: '192.168.1.2/24' },
      ],
      en1: [{ address: '10.0.0.2', netmask: '255.255.0.0', family: 'IPv4', mac: '', internal: false, cidr: '10.0.0.2/16' }],
    };
    expect(eligibleInterfaces([], source)).toMatchObject([
      { name: 'en0', broadcast: '192.168.1.255' },
      { name: 'en1', broadcast: '10.0.255.255' },
    ]);
  });
});
