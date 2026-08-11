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
});
