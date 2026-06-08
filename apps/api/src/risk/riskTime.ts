export function endOfUtcDay(from = new Date()): string {
  const until = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 23, 59, 59, 999));
  return until.toISOString();
}

export function elapsedMinutesSince(isoTimestamp: string, now = new Date()): number {
  const openedAt = new Date(isoTimestamp);
  if (Number.isNaN(openedAt.getTime())) {
    return 0;
  }
  return Math.max(0, (now.getTime() - openedAt.getTime()) / 60_000);
}
