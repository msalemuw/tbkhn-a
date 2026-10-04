// Time choices for "Ready-by time" (s16) and pickup time (s57). Always computed from now (docs/DYNAMIC-DATA.md).

const STEP = 30 * 60_000;

/** End of the local day: when a cooking-today post and its story stop showing. */
export function endOfToday(now: number = Date.now()): number {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/** Half-hour marks from the next one after `from` until the end of the day. */
export function halfHourSlots(from: number, until: number = endOfToday(from)): number[] {
  const out: number[] = [];
  for (let t = Math.ceil((from + 1) / STEP) * STEP; t < until; t += STEP) out.push(t);
  return out;
}

/** Ready-by choices for a cook posting now: at least 30 minutes away. */
export function readySlots(now: number = Date.now()): number[] {
  return halfHourSlots(now + STEP - 1);
}

/** Pickup choices for a buyer: the ready time (or now, if it already passed), then every half hour. */
export function pickupSlots(readyAt: number, expiresAt: number, now: number = Date.now()): number[] {
  const first = Math.max(readyAt, now);
  return [first, ...halfHourSlots(first, expiresAt)].filter((t) => t < expiresAt);
}
