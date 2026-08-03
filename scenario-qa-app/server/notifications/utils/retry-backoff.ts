export function notificationRetryDelay(
  attemptNumber: number,
  baseDelayMs = 5_000,
  maximumDelayMs = 20_000
): number {
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) return baseDelayMs;
  return Math.min(maximumDelayMs, baseDelayMs * 2 ** (attemptNumber - 1));
}
