/**
 * Human-readable "X ago" strings built on Intl.RelativeTimeFormat.
 *
 * Picks the largest unit that fits — minutes for the first hour, then hours,
 * then days, weeks, months, years. Returns "just now" for anything under a
 * minute so the UI doesn't churn on 0/1-second values.
 */

const DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
];

const RTF = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export function formatRelativeTime(input: string | Date | null | undefined): string {
  if (!input) return '';
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';

  let duration = (date.getTime() - Date.now()) / 1000; // negative when in the past

  if (Math.abs(duration) < 45) {
    return 'just now';
  }

  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return RTF.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }

  // Should not be reached, but RelativeTimeFormat needs a fallback.
  return RTF.format(Math.round(duration), 'year');
}
