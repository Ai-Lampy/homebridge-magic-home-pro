import { describe, expect, it, vi } from 'vitest';
import { MagicHomePlatform } from '../src/platform.js';

describe('scan concurrency', () => {
  it('prevents overlapping scans', async () => {
    let release!: () => void;
    const work = new Promise<Set<string>>(resolve => { release = () => resolve(new Set(['device'])); });
    const platform = Object.create(MagicHomePlatform.prototype) as MagicHomePlatform & {
      scanPromise?: Promise<Set<string>>;
      performScan: () => Promise<Set<string>>;
      log: { debug: (message: string) => void };
    };
    platform.scanPromise = undefined;
    platform.log = { debug: vi.fn() };
    platform.performScan = vi.fn(() => work);
    const first = platform.scan();
    const second = platform.scan();
    expect(platform.performScan).toHaveBeenCalledTimes(1);
    release();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toEqual(new Set(['device']));
    expect(secondResult).toBe(firstResult);
  });

  it('clears cached colour overrides when they are disabled in configuration', () => {
    const platform = Object.create(MagicHomePlatform.prototype) as MagicHomePlatform;
    const merged = (platform as unknown as {
      mergeCandidates(input: Array<Record<string, unknown>>): Array<Record<string, unknown>>;
    }).mergeCandidates([
      {
        host: '192.168.1.20', mac: 'AABBCCDDEEFF', colorControl: 'rgbw',
        colorControlOverride: true, colorOrder: 'GRBW', source: 'cache', sources: ['cache'],
      },
      {
        host: '192.168.1.20', mac: 'AABBCCDDEEFF', colorControlOverride: false,
        source: 'configuration', sources: ['configuration'],
      },
    ]);

    expect(merged).toEqual([expect.objectContaining({
      host: '192.168.1.20', colorControlOverride: false,
      sources: ['cache', 'configuration'],
    })]);
    expect(merged[0]).not.toHaveProperty('colorControl');
    expect(merged[0]).not.toHaveProperty('colorOrder');
  });
});
