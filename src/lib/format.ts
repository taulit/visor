/** Format a duration in milliseconds as `m:ss`, or `h:mm:ss` from one hour on. Never negative. */
export function formatDuration(ms: number): string {
  const total = Number.isFinite(ms) ? Math.floor(Math.max(0, ms) / 1000) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`;
  return `${minutes}:${ss}`;
}
