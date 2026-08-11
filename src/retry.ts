export interface RetryResult<T> {
  attempts: number;
  result: T;
  succeeded: boolean;
}

async function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;
  await new Promise<void>(resolve => {
    const finish = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, delayMs);
    signal?.addEventListener('abort', finish, { once: true });
  });
}

export async function retryWithDelay<T>(
  maximumAttempts: number,
  delayMs: number,
  operation: (attempt: number) => Promise<T>,
  succeeded: (result: T) => boolean,
  signal?: AbortSignal,
): Promise<RetryResult<T>> {
  if (!Number.isInteger(maximumAttempts) || maximumAttempts < 1) throw new Error('maximumAttempts must be at least 1');
  let result!: T;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    if (signal?.aborted) return { attempts: Math.max(0, attempt - 1), result, succeeded: false };
    result = await operation(attempt);
    if (succeeded(result)) return { attempts: attempt, result, succeeded: true };
    if (attempt < maximumAttempts) {
      await wait(delayMs, signal);
    }
  }
  return { attempts: maximumAttempts, result, succeeded: false };
}
