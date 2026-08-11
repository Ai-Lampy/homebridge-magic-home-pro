import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { buildColorCommand, buildPowerCommand, capabilityFromResponse, MagicHomeTransport, parseState } from '../src/transport.js';

const servers: net.Server[] = [];
afterEach(() => servers.splice(0).forEach(server => server.close()));

async function simulatedController(handler: (packet: Buffer, socket: net.Socket) => void): Promise<number> {
  const server = net.createServer(socket => socket.once('data', packet => handler(packet, socket)));
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as net.AddressInfo).port;
}

describe('MagicHome transport', () => {
  it.each([
    [0x25, 'rgb'], [0x35, 'rgbw'], [0x41, 'rgbcct'], [0x43, 'cct'],
    [0x42, 'dimmer'], [0x10, 'switch'], [0x99, 'unknown'],
  ])('detects controller type 0x%s', (type, expected) => {
    expect(capabilityFromResponse(Buffer.from([0x81, type]))).toBe(expected);
  });

  it('parses current state replies', () => {
    const state = parseState(Buffer.from([0x81, 0x35, 0x23, 0x61, 0x21, 0x00, 255, 64, 0, 20, 0]), 'current');
    expect(state).toMatchObject({ on: true, capability: 'rgbw', red: 255, green: 64, warmWhite: 20 });
  });

  it('falls back from current to legacy query against a simulator', async () => {
    const port = await simulatedController((packet, socket) => {
      if (packet[0] === 0x81) socket.end();
      else socket.end(Buffer.from([0xef, 0x41, 0x23, 0x61, 0x21, 0, 1, 2, 3, 4, 5]));
    });
    const state = await new MagicHomeTransport('127.0.0.1', { port, timeoutMs: 500 }).queryState();
    expect(state.query).toBe('legacy');
    expect(state.capability).toBe('rgbcct');
  });

  it('rejects malformed and unknown responses', () => {
    expect(() => parseState(Buffer.from([0x81]), 'current')).toThrow(/only 1 bytes/);
    expect(() => parseState(Buffer.alloc(10, 0xaa), 'current')).toThrow(/Unknown response header/);
  });

  it('builds checksummed power and color packets', () => {
    const power = buildPowerCommand(true);
    expect(power).toEqual(Buffer.from([0x71, 0x23, 0x0f, 0xa3]));
    const color = buildColorCommand('rgbcct', { red: 1, green: 2, blue: 3, warmWhite: 4, coolWhite: 5 });
    expect(color.at(-1)).toBe([...color.subarray(0, -1)].reduce((sum, byte) => sum + byte, 0) & 0xff);
  });
});
