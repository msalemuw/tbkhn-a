// Time and distance formatting from docs/DYNAMIC-DATA.md.
// Never store or hard-code the strings these return; always compute from raw values.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Age label for posts, stories, comments, messages and notifications. */
export function fmtAgo(createdAt: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - createdAt);
  if (diff < MINUTE) return 'Just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  const created = new Date(createdAt);
  const today = startOfDay(new Date(now));
  if (startOfDay(created) === today - DAY) return 'Yesterday';
  if (diff < 7 * DAY) return WEEKDAYS[created.getDay()];
  return `${created.getDate()} ${MONTHS[created.getMonth()]}`;
}

/** Ready or pickup time: local 12-hour "h:mm AM/PM", or "Ready now" once readyAt has passed. */
export function fmtReady(readyAt: number, now: number = Date.now()): string {
  if (readyAt <= now) return 'Ready now';
  return fmtClock(readyAt);
}

export function fmtClock(at: number): string {
  const d = new Date(at);
  const h = d.getHours() % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

export type LatLng = { lat: number; lng: number };

/** Great-circle distance in meters. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** "350 m" under 950 m (nearest 50 m), else one decimal km ("1.2 km"). */
export function fmtDist(meters: number): string {
  if (meters < 950) return `${Math.max(50, Math.round(meters / 50) * 50)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Cook-level distance: the nearest of the cook's active pickup points. */
export function nearestDistance(user: LatLng, pickupPoints: LatLng[]): number | null {
  if (pickupPoints.length === 0) return null;
  return Math.min(...pickupPoints.map((p) => distanceMeters(user, p)));
}
