export function parseTimestampMillis(timestamp: string | null | undefined): number {
  if (!timestamp) return 0;
  const timestampWithZone = timestamp.at(-1) === 'Z' ? timestamp : `${timestamp}Z`;
  const millis = new Date(timestampWithZone).getTime();
  return Number.isFinite(millis) ? millis : 0;
}
