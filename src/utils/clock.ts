/**
 * "Now" for business logic (dashboard, today's arrivals, default payment date, past/future days).
 * Tests pin it with setNow() so date-based acceptance tests are stable. Never use it for JWTs or locks.
 */
let fixed: Date | null = null;

export const now = (): Date => (fixed ? new Date(fixed.getTime()) : new Date());

/** Test helper: pin the clock (pass null to go back to real time). */
export function setNow(date: Date | null): void {
  fixed = date ? new Date(date.getTime()) : null;
}
