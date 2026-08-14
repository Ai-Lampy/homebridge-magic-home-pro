import net from 'node:net';
import { remapFromDeviceOrder, remapToDeviceOrder } from './capability.js';
import { TCP_CONTROL_PORT } from './settings.js';
import type { Capability, DeviceState } from './types.js';

export const CURRENT_QUERY = Buffer.from([0x81, 0x8a, 0x8b, 0x96]);
export const LEGACY_QUERY = Buffer.from([0xef, 0x01, 0x77]);

const MINIMUM_STATE_RESPONSE_LENGTH = 10;
const CURRENT_STATE_RESPONSE_LENGTH = 14;
const FRAME_IDLE_MS = 30;

export interface TransportOptions {
  port?: number;
  timeoutMs?: number;
  trace?: (message: string) => void;
  colorOrder?: string;
}

export class TransportError extends Error {
  constructor(message: string, readonly code: 'timeout' | 'unreachable' | 'malformed' | 'unsupported') {
    super(message);
    this.name = 'TransportError';
  }
}

function checksum(bytes: readonly number[]): number {
  return bytes.reduce((total, value) => total + value, 0) & 0xff;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function capabilityFromResponse(packet: Buffer): Capability {
  const model = packet[1];
  const fixedCapabilities: Readonly<Record<number, Capability>> = {
    0x01: 'rgb',
    0x03: 'cct',
    0x04: 'rgbw',
    0x06: 'rgbw',
    0x07: 'rgbcct',
    0x08: 'rgb',
    0x09: 'cct',
    0x0e: 'rgbcct',
    0x16: 'cct',
    0x17: 'dimmer',
    0x1c: 'cct',
    0x1d: 'dimmer',
    0x1e: 'rgbcct',
    0x21: 'dimmer',
    0x33: 'rgb',
    0x35: 'rgbcct',
    0x41: 'dimmer',
    0x44: 'rgbw',
    0x45: 'rgb',
    0x52: 'cct',
    0x54: 'rgbw',
    0x62: 'cct',
    0x81: 'rgbw',
    0x93: 'switch',
    0x94: 'switch',
    0x95: 'switch',
    0x96: 'switch',
    0x97: 'switch',
    0xe1: 'cct',
  };
  if (model !== undefined && fixedCapabilities[model]) return fixedCapabilities[model];

  // Model 0x25 and some unknown controllers encode their configured output
  // layout in the low nibble of the state mode byte.
  const mode = (packet[4] ?? 0) & 0x0f;
  switch (mode) {
    case 0x01: return 'dimmer';
    case 0x02: return 'cct';
    case 0x03: return 'rgb';
    case 0x04:
    case 0x06: return 'rgbw';
    case 0x05:
    case 0x07: return 'rgbcct';
    default: return 'unknown';
  }
}

export function parseState(packet: Buffer, query: 'current' | 'legacy', colorOrder?: string): DeviceState {
  if (packet.length < 10) throw new TransportError(`State response is only ${packet.length} bytes`, 'malformed');
  const offset = packet[0] === 0x81 ? 0 : packet[0] === 0xef ? 0 : -1;
  if (offset < 0) throw new TransportError(`Unknown response header 0x${packet[0]?.toString(16) ?? 'none'}`, 'unsupported');
  const capability = capabilityFromResponse(packet);
  const [red, green, blue, warmWhite, coolWhite] = remapFromDeviceOrder([
    packet[6] ?? 0,
    packet[7] ?? 0,
    packet[8] ?? 0,
    packet[9] ?? 0,
    packet[10] ?? 0,
  ], colorOrder);
  const maximum = Math.max(red, green, blue, warmWhite, coolWhite);
  return {
    on: packet[2] === 0x23,
    brightness: Math.round(maximum / 255 * 100),
    red,
    green,
    blue,
    warmWhite,
    coolWhite,
    raw: Buffer.from(packet),
    query,
    capability,
    firmwareBytes: packet.subarray(0, Math.min(packet.length, 6)).toString('hex'),
  };
}

export function buildPowerCommand(on: boolean): Buffer {
  const bytes = [0x71, on ? 0x23 : 0x24, 0x0f];
  return Buffer.from([...bytes, checksum(bytes)]);
}

export function buildColorCommand(
  capability: Capability,
  color: { red: number; green: number; blue: number; warmWhite?: number; coolWhite?: number },
  colorOrder?: string,
): Buffer {
  const red = clampByte(color.red);
  const green = clampByte(color.green);
  const blue = clampByte(color.blue);
  const warm = clampByte(color.warmWhite ?? 0);
  const cool = clampByte(color.coolWhite ?? 0);
  const [deviceRed, deviceGreen, deviceBlue, deviceWarm, deviceCool] = remapToDeviceOrder(
    [red, green, blue, warm, cool],
    colorOrder,
  );
  let body: number[];
  if (capability === 'dimmer') {
    const brightness = Math.max(red, green, blue, warm, cool);
    body = [0x31, brightness, 0x00, 0x00, 0x00, 0x00, 0x0f];
  } else if (capability === 'rgbcct' || capability === 'cct') {
    body = [0x31, deviceRed, deviceGreen, deviceBlue, deviceWarm, deviceCool, 0xf0, 0x0f];
  } else {
    body = [0x31, deviceRed, deviceGreen, deviceBlue, capability === 'rgbw' ? deviceWarm : 0, 0x00, 0x0f];
  }
  return Buffer.from([...body, checksum(body)]);
}

export class MagicHomeTransport {
  private readonly port: number;
  private readonly timeoutMs: number;
  private readonly trace: ((message: string) => void) | undefined;
  private readonly colorOrder: string | undefined;

  constructor(private readonly host: string, options: TransportOptions = {}) {
    this.port = options.port ?? TCP_CONTROL_PORT;
    this.timeoutMs = options.timeoutMs ?? 3000;
    this.trace = options.trace;
    this.colorOrder = options.colorOrder;
  }

  private exchange(packet: Buffer, expectReply: boolean): Promise<Buffer> {
    this.trace?.(`TCP ${this.host}:${this.port} tx=${packet.toString('hex')}`);
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      const chunks: Buffer[] = [];
      let settled = false;
      let frameTimer: NodeJS.Timeout | undefined;
      const collectedResponse = (): Buffer => Buffer.concat(chunks);
      const expectedResponseLength = (response: Buffer): number | undefined => {
        // Current-protocol controllers normally return a 14-byte state frame.
        // Legacy and older variants do not expose a reliable length field, so
        // those frames are completed by EOF or the short inter-chunk idle gap.
        if (packet.equals(CURRENT_QUERY) && response[0] === 0x81) return CURRENT_STATE_RESPONSE_LENGTH;
        return undefined;
      };
      const finish = (error?: Error, result: Buffer = Buffer.alloc(0)): void => {
        if (settled) return;
        settled = true;
        if (frameTimer) clearTimeout(frameTimer);
        socket.destroy();
        if (error) {
          reject(error);
        } else {
          if (result.length > 0) this.trace?.(`TCP ${this.host}:${this.port} rx=${result.toString('hex')}`);
          resolve(result);
        }
      };
      const scheduleFrameCompletion = (): void => {
        if (frameTimer) clearTimeout(frameTimer);
        frameTimer = setTimeout(() => {
          const result = collectedResponse();
          if (result.length >= MINIMUM_STATE_RESPONSE_LENGTH) finish(undefined, result);
        }, FRAME_IDLE_MS);
      };
      socket.setTimeout(this.timeoutMs);
      socket.once('timeout', () => {
        const result = collectedResponse();
        if (expectReply && result.length >= MINIMUM_STATE_RESPONSE_LENGTH) finish(undefined, result);
        else finish(new TransportError(`TCP ${this.host}:${this.port} timed out`, 'timeout'));
      });
      socket.once('error', error => finish(new TransportError(`TCP ${this.host}:${this.port} unreachable: ${error.message}`, 'unreachable')));
      socket.on('data', chunk => {
        chunks.push(Buffer.from(chunk));
        const result = collectedResponse();
        const expectedLength = expectedResponseLength(result);
        if (expectedLength !== undefined && result.length >= expectedLength) {
          finish(undefined, result.subarray(0, expectedLength));
          return;
        }
        if (result.length >= MINIMUM_STATE_RESPONSE_LENGTH) scheduleFrameCompletion();
      });
      socket.once('connect', () => socket.write(packet, error => {
        if (error) finish(new TransportError(`TCP write failed: ${error.message}`, 'unreachable'));
        else if (!expectReply) finish();
      }));
      socket.once('end', () => {
        const result = collectedResponse();
        if (result.length > 0) finish(undefined, result);
        else if (expectReply) finish(new TransportError('Controller closed without a response', 'malformed'));
      });
    });
  }

  async queryState(): Promise<DeviceState> {
    const failures: string[] = [];
    for (const [name, query] of [['current', CURRENT_QUERY], ['legacy', LEGACY_QUERY]] as const) {
      try {
        return parseState(await this.exchange(query, true), name, this.colorOrder);
      } catch (error) {
        failures.push(`${name}: ${(error as Error).message}`);
      }
    }
    throw new TransportError(`No supported state protocol (${failures.join('; ')})`, 'unsupported');
  }

  async setPower(on: boolean): Promise<void> {
    await this.exchange(buildPowerCommand(on), false);
  }

  async setColor(capability: Capability, color: Parameters<typeof buildColorCommand>[1]): Promise<void> {
    await this.exchange(buildColorCommand(capability, color, this.colorOrder), false);
  }
}
