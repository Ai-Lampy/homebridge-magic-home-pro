import { afterEach, describe, expect, it, vi } from 'vitest';
import { retryWithDelay } from '../src/retry.js';

describe('device scan retry timing', () => {
  afterEach(() => vi.useRealTimers());

  it('stops immediately when a device is found again', async () => {
    vi.useFakeTimers();
    const attempts: Array<{ attempt: number; time: number }> = [];
    const operation = vi.fn(async (attempt: number) => {
      attempts.push({ attempt, time: Date.now() });
      return attempt === 3;
    });
    const resultPromise = retryWithDelay(5, 10_000, operation, result => result);
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    expect(result).toMatchObject({ attempts: 3, succeeded: true });
    expect(operation).toHaveBeenCalledTimes(3);
    expect(attempts.map(item => item.time - attempts[0]!.time)).toEqual([0, 10_000, 20_000]);
  });

  it('makes exactly five attempts before disabling is required', async () => {
    vi.useFakeTimers();
    const operation = vi.fn(async () => false);
    const resultPromise = retryWithDelay(5, 10_000, operation, result => result);
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    expect(result).toMatchObject({ attempts: 5, succeeded: false });
    expect(operation).toHaveBeenCalledTimes(5);
  });
});
