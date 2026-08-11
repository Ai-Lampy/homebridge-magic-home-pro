import { describe, expect, it, vi } from 'vitest';
import { MagicHomePlatform } from '../src/platform.js';

describe('scan concurrency', () => {
  it('prevents overlapping scans', async () => {
    let release!: () => void;
    const work = new Promise<void>(resolve => { release = resolve; });
    const platform = Object.create(MagicHomePlatform.prototype) as MagicHomePlatform & {
      scanPromise?: Promise<void>;
      performScan: () => Promise<void>;
      log: { debug: (message: string) => void };
    };
    platform.scanPromise = undefined;
    platform.log = { debug: vi.fn() };
    platform.performScan = vi.fn(() => work);
    const first = platform.scan();
    const second = platform.scan();
    expect(platform.performScan).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
  });
});
