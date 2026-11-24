import { DateTime } from 'luxon';

/**
 * Facility-timezone helpers (spec §3, §8.3, §8.6). Every "day", "today", "month" and "nights" calculation
 * goes through here with `settings.timezone` (default Asia/Kolkata).
 */
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const local = (date: Date, tz: string) => DateTime.fromJSDate(date, { zone: tz });

/** YYYY-MM-DD of an instant in the facility timezone. */
export const localDateKey = (date: Date, tz: string): string => local(date, tz).toISODate() ?? '';

/** Start of the local day containing `date`. */
export const startOfLocalDay = (date: Date, tz: string): Date => local(date, tz).startOf('day').toJSDate();

/** Start of the local day given as YYYY-MM-DD, or null if the key is not a real date. */
export function parseDateKey(key: unknown, tz: string): Date | null {
  if (typeof key !== 'string' || !DATE_KEY.test(key)) return null;
  const dt = DateTime.fromISO(key, { zone: tz });
  return dt.isValid && dt.toISODate() === key ? dt.startOf('day').toJSDate() : null;
}

/** Same local time, `days` calendar days later (DST-safe). */
export const addLocalDays = (date: Date, days: number, tz: string): Date => local(date, tz).plus({ days }).toJSDate();

/** [start, end) of the local calendar month containing `date`. */
export function localMonthRange(date: Date, tz: string): { start: Date; end: Date } {
  const start = local(date, tz).startOf('month');
  return { start: start.toJSDate(), end: start.plus({ months: 1 }).toJSDate() };
}

/** Whole calendar days between two local dates (b - a). */
export function localDaysBetween(a: Date, b: Date, tz: string): number {
  const from = local(a, tz).startOf('day');
  const to = local(b, tz).startOf('day');
  return Math.round(to.diff(from, 'days').days);
}

/** §8.3: nights = max(1, calendar days between local check-in date and local check-out date). */
export const nightsBetween = (checkIn: Date, checkOut: Date, tz: string): number =>
  Math.max(1, localDaysBetween(checkIn, checkOut, tz));

/** True for a valid IANA timezone name. */
export const isValidTimezone = (tz: string): boolean => DateTime.local().setZone(tz).isValid;
