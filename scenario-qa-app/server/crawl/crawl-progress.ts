export function monotonicProgress(previous: number, stageBase: number, visited: number, queued: number, span = 20): number {
  const ratio = visited + queued === 0 ? 0 : visited / (visited + queued);
  return Math.max(previous, Math.min(stageBase + span, Math.round(stageBase + ratio * span)));
}
