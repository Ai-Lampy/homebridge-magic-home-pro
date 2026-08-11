import os from 'node:os';
import net from 'node:net';

export interface IPv4Interface {
  name: string;
  address: string;
  netmask: string;
  broadcast: string;
}

export function isIPv4(value: string): boolean {
  return net.isIPv4(value);
}

export function ipv4ToNumber(address: string): number {
  if (!isIPv4(address)) throw new Error(`Invalid IPv4 address: ${address}`);
  return address.split('.').reduce((result, octet) => (result * 256) + Number(octet), 0) >>> 0;
}

export function numberToIPv4(value: number): string {
  const unsigned = value >>> 0;
  return [24, 16, 8, 0].map(shift => (unsigned >>> shift) & 255).join('.');
}

export function prefixToNetmask(prefix: number): string {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw new Error(`Invalid prefix: ${prefix}`);
  return numberToIPv4(prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0);
}

export function broadcastAddress(address: string, netmask: string): string {
  const ip = ipv4ToNumber(address);
  const mask = ipv4ToNumber(netmask);
  return numberToIPv4((ip | (~mask >>> 0)) >>> 0);
}

export function isValidCidr(value: string): boolean {
  const [address, prefix, extra] = value.split('/');
  if (extra !== undefined || address === undefined || prefix === undefined || !isIPv4(address)) return false;
  const parsed = Number(prefix);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 32;
}

export function cidrBroadcast(cidr: string): string {
  if (!isValidCidr(cidr)) throw new Error(`Invalid IPv4 CIDR: ${cidr}`);
  const [address = '', prefix = ''] = cidr.split('/');
  return broadcastAddress(address, prefixToNetmask(Number(prefix)));
}

export function cidrHosts(cidr: string, allowPublic = false): string[] {
  if (!isValidCidr(cidr)) throw new Error(`Invalid IPv4 CIDR: ${cidr}`);
  const [address = '', prefixString = ''] = cidr.split('/');
  if (!allowPublic && !isPrivateOrLocal(address)) throw new Error(`Refusing non-private subnet: ${cidr}`);
  const prefix = Number(prefixString);
  const count = 2 ** (32 - prefix);
  if (count > 65536) throw new Error(`Subnet is too large to probe: ${cidr}`);
  const mask = ipv4ToNumber(prefixToNetmask(prefix));
  const first = (ipv4ToNumber(address) & mask) >>> 0;
  if (prefix === 32) return [numberToIPv4(first)];
  const start = prefix === 31 ? first : first + 1;
  const end = prefix === 31 ? first + 1 : first + count - 2;
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => numberToIPv4(start + index));
}

export function isPrivateOrLocal(address: string): boolean {
  if (!isIPv4(address)) return false;
  const value = ipv4ToNumber(address);
  const within = (base: string, prefix: number): boolean => {
    const mask = ipv4ToNumber(prefixToNetmask(prefix));
    return (value & mask) === (ipv4ToNumber(base) & mask);
  };
  return within('10.0.0.0', 8) || within('172.16.0.0', 12) || within('192.168.0.0', 16)
    || within('169.254.0.0', 16) || within('127.0.0.0', 8) || within('100.64.0.0', 10);
}

export function eligibleInterfaces(names: string[] = [], source = os.networkInterfaces()): IPv4Interface[] {
  const selected = new Map<string, IPv4Interface>();
  for (const [name, addresses] of Object.entries(source)) {
    if (names.length > 0 && !names.includes(name)) continue;
    for (const entry of addresses ?? []) {
      if (entry.family !== 'IPv4' || entry.internal || !isIPv4(entry.address) || !isIPv4(entry.netmask)) continue;
      const item = { name, address: entry.address, netmask: entry.netmask, broadcast: broadcastAddress(entry.address, entry.netmask) };
      selected.set(`${item.address}/${item.broadcast}`, item);
    }
  }
  return [...selected.values()];
}

export function normalizeMac(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const compact = value.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
  return /^[A-F0-9]{12}$/.test(compact) ? compact : undefined;
}
