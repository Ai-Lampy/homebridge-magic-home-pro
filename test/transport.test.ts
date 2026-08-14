import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildColorCommand, buildPowerCommand, capabilityFromResponse, CURRENT_QUERY, MagicHomeTransport, parseState,
} from '../src/transport.js';

const servers: net.Server[] = [];
afterEach(() => servers.splice(0).forEach(server => server.close()));

async function simulatedController(handler: (packet: Buffer, socket: net.Socket) => void): Promise<number> {
  const server = net.createServer(socket => socket.once('data', packet => handler(packet, socket)));
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as net.AddressInfo).port;
}

describe('MagicHome transport', () => {
  const currentResponse = Buffer.from([
    0x81, 0x35, 0x23, 0x61, 0x21, 0x00, 255, 64, 32, 20, 10, 0x00, 0xf0, 0xef,
  ]);

  it.each([
    { type: 0x33, label: '0x33', expected: 'rgb' },
    { type: 0x35, label: '0x35', expected: 'rgbcct' },
    { type: 0x41, label: '0x41', expected: 'dimmer' },
    { type: 0x44, label: '0x44', expected: 'rgbw' },
    { type: 0x52, label: '0x52', expected: 'cct' },
    { type: 0x93, label: '0x93', expected: 'switch' },
    { type: 0x10, label: '0x10', expected: 'unknown' },
  ])('detects controller type $label', ({ type, expected }) => {
    expect(capabilityFromResponse(Buffer.from([0x81, type]))).toBe(expected);
  });

  it.each([
    { mode: 0x01, label: '0x01', expected: 'dimmer' },
    { mode: 0x02, label: '0x02', expected: 'cct' },
    { mode: 0x03, label: '0x03', expected: 'rgb' },
    { mode: 0x04, label: '0x04', expected: 'rgbw' },
    { mode: 0x05, label: '0x05', expected: 'rgbcct' },
  ])('detects configurable controller mode $label', ({ mode, expected }) => {
    expect(capabilityFromResponse(Buffer.from([0x81, 0x25, 0x23, 0x61, mode]))).toBe(expected);
  });

  it('parses current state replies', () => {
    const state = parseState(Buffer.from([0x81, 0x35, 0x23, 0x61, 0x21, 0x00, 255, 64, 0, 20, 0]), 'current');
    expect(state).toMatchObject({ on: true, capability: 'rgbcct', red: 255, green: 64, warmWhite: 20 });
  });

  it('re-maps state and commands using the configured colour order', () => {
    const state = parseState(Buffer.from([0x81, 0x33, 0x23, 0x61, 0x13, 0, 2, 1, 3, 0]), 'current', 'GRB');
    expect(state).toMatchObject({ red: 1, green: 2, blue: 3 });
    expect(buildColorCommand('rgb', { red: 1, green: 2, blue: 3 }, 'GRB'))
      .toEqual(Buffer.from([0x31, 2, 1, 3, 0, 0, 0x0f, 0x46]));
  });

  it('identifies a 0x41 single-channel LED controller as a dimmer', () => {
    const packet = Buffer.from([0x81, 0x41, 0x24, 0x61, 0x41, 0x10, 0x64, 0, 0, 0, 0x04, 0, 0xf0, 0xef]);
    expect(parseState(packet, 'current')).toMatchObject({ on: false, capability: 'dimmer', brightness: 39 });
  });

  it('falls back from current to legacy query against a simulator', async () => {
    const port = await simulatedController((packet, socket) => {
      if (packet[0] === 0x81) socket.end();
      else socket.end(Buffer.from([0xef, 0x35, 0x23, 0x61, 0x21, 0, 1, 2, 3, 4, 5]));
    });
    const state = await new MagicHomeTransport('127.0.0.1', { port, timeoutMs: 500 }).queryState();
    expect(state.query).toBe('legacy');
    expect(state.capability).toBe('rgbcct');
  });

  it('waits for a fragmented 14-byte current state response', async () => {
    const port = await simulatedController((_packet, socket) => {
      socket.write(currentResponse.subarray(0, 10));
      setTimeout(() => socket.end(currentResponse.subarray(10)), 10);
    });

    const state = await new MagicHomeTransport('127.0.0.1', { port, timeoutMs: 500 }).queryState();

    expect(state.raw).toHaveLength(14);
    expect(state).toMatchObject({
      query: 'current', on: true, capability: 'rgbcct',
      red: 255, green: 64, blue: 32, warmWhite: 20, coolWhite: 10,
    });
  });

  it('accepts a complete current state response in one TCP chunk', async () => {
    const port = await simulatedController((_packet, socket) => socket.end(currentResponse));

    const state = await new MagicHomeTransport('127.0.0.1', { port, timeoutMs: 500 }).queryState();

    expect(state.raw).toEqual(currentResponse);
    expect(state.coolWhite).toBe(10);
  });

  it('accepts a minimum-length legacy response when the controller closes', async () => {
    const legacyResponse = Buffer.from([0xef, 0x35, 0x23, 0x61, 0x21, 0x00, 1, 2, 3, 4]);
    const port = await simulatedController((packet, socket) => {
      if (packet.equals(CURRENT_QUERY)) socket.end();
      else socket.end(legacyResponse);
    });

    const state = await new MagicHomeTransport('127.0.0.1', { port, timeoutMs: 500 }).queryState();

    expect(state.raw).toEqual(legacyResponse);
    expect(state).toMatchObject({ query: 'legacy', warmWhite: 4, coolWhite: 0 });
  });

  it('rejects a controller response shorter than the minimum state frame', async () => {
    const port = await simulatedController((_packet, socket) => socket.end(Buffer.alloc(9, 0x81)));
    const transport = new MagicHomeTransport('127.0.0.1', { port, timeoutMs: 100 });

    await expect(transport.queryState()).rejects.toThrow(/only 9 bytes/);
  });

  it('retains timeout errors when a controller returns no data', async () => {
    const port = await simulatedController(() => undefined);
    const transport = new MagicHomeTransport('127.0.0.1', { port, timeoutMs: 30 });

    await expect(transport.queryState()).rejects.toThrow(/timed out/);
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
    expect(buildColorCommand('dimmer', { red: 128, green: 0, blue: 0 }))
      .toEqual(Buffer.from([0x31, 0x80, 0, 0, 0, 0, 0x0f, 0xc0]));
  });
});
