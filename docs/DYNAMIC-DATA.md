# Dynamic data rule (TBKHN A)

**Every time and every distance shown in the app must be computed, never hard-coded.** The prototype (`TBKHN A App.dc.html`) already follows this; the production build must too. Backend stores raw values; the client formats them.

## Time

| What the UI shows | Source of truth | Format |
| --- | --- | --- |
| Post / story / comment / message / notification age ("2m", "5h", "Yesterday", "Mon", "12 Sep") | `createdAt` (UTC timestamp) | `< 1 min` → "Just now" · `< 60 min` → `Nm` · `< 24 h` → `Nh` · calendar day before → "Yesterday" · `< 7 days` → weekday short · else `D Mon` |
| Cook "Ready at 1:00 PM", pickup time, order summary | `readyAt` / `pickupAt` on the cooking-today post or order (cook sets it) | Local time, 12-hour, `h:mm AM/PM`; "Ready now" when `readyAt <= now` |
| Phone status-bar clock (mock only) | device clock | `h:mm` |
| Story expiry | plain story: `createdAt + 24 h` · "what's cooking today" story: end of the local day (midnight) | Never hard-code "midnight" or "24 hours" in copy where the type is known; derive from post type |

Rules:
- Relative labels **re-render on a timer** (≤ 30 s) and when the app returns to foreground.
- Timestamps are stored in UTC, displayed in the user's local timezone.
- A comment/message the user just sent gets `createdAt = now` and ages like any other.
- Unread state is per item (`readAt` null), and drives dot, bold weight and tab/header counts together.

## Distance

| What the UI shows | Source of truth | Format |
| --- | --- | --- |
| "1.2 km away" on posts, Menu offers, search, cook cards | haversine between the **user's current location** (GPS, or the area chosen in "Choose your location") and the **cook's pickup point** for that post | `< 950 m` → nearest 50 m (`350 m`) · else one decimal km (`1.2 km`) |
| Home feed posts (signature dishes) | **live** distance between the member and the cook: the member's GPS now vs the cook's last known position (`profiles.last_lat/last_lng`, refreshed through `report_position()` when they open the app or bring it to the front). Computed by `people_distance()` on the server, rounded **up to whole km**, only for positions under 2 days old; coordinates are never exposed | `Less than 1 km away` · `52 km away` · no distance (shows time ago) when either position is unknown |
| Cook-level distance (feed header) | **nearest** of the cook's active pickup points | same |
| Own posts | not shown on Home or in the Menu list (they live on the member's profile) | — |

Rules:
- Recompute whenever the user's location changes ("Use current location", area change).
- The Home location follows the phone's GPS (on app open and each time the app returns to the front, once the phone has moved 300 m) until the member pins a spot by hand on the map; tapping "use my current location" and confirming hands it back to the GPS (`manual` in `src/lib/location.tsx`).
- Never store a distance string; store coordinates for each pickup point (`lat`, `lng`) and the user's last known position.
- Sort/filter by distance ("Watching: Nearby", Menu filters) must use the same computed value.
- Menu filter "Nearby" keeps a dish when its pickup point is within `NEARBY_METERS` (10 km, `src/components/dish-list.tsx`) of the member's current location; with no known location it does not narrow the list.

## In the prototype

Search `TBKHN A App.dc.html` for: `fmtAgo`, `slots`, `tm(`, `distTo`, `fmtDist`, `cookDist`, `SPOTS`, `userPos`. Template holes `{{ ago.* }}`, `{{ clock }}`, `{{ slot1..3 }}`, `{{ dHoda }}`, `{{ dMariam }}`, `{{ cm... }}` are the dynamic values; literal `42m`, `1.2 km`, `1:00 PM` in markup would be a regression.

Exceptions (intentionally fixed): legal "Last updated" dates, pickup-policy text such as "after 2:30 PM", flow-canvas captions.
