# Sign-up funnel tracking (backend only)

The mobile app never shows this data. Goal: see where new users get stuck and tell a technical fault from a user drop-off.

## Steps (event names)
1. `welcome_viewed`
2. `signup_method_chosen` — `method`: phone | google | apple; since 2026-11-19 the app also logs how a Google or Apple attempt ended, on this same step: `result` = `ok` | `error` | `cancelled` and `stage` = `native` (the Apple or Google sign-in screen itself: cancelled, or failed with its own `error_code` such as ERR_REQUEST_UNKNOWN) | `no_token` | `server` (the token was handed to our server). A tap with no `result` in its session is a person who closed the app or lost the connection. In the app `mode` is `welcome` when tapped on the welcome screen (Google and Apple sit there since 2026-10-25, so there is no separate "Create account" screen before them; "More sign-in options" opens the old choice screen with phone, demo sign-in and help)
3. `phone_entered` — `valid`: bool, `attempts`
4. `code_sent` — `channel`: whatsapp (no SMS since 2026-10-04), `provider_status`
5. `code_entered` — `attempts`, `result`: ok | wrong | expired
6. `profile_started` / `profile_field_error` — `field` (username_taken, invalid_format, photo_upload …); a failed optional photo upload is logged and sign-up continues without it; since 2026-11-07 the Continue / Create my account buttons are never greyed out: tapping with something missing logs `profile_field_error` with `field` = `missing_name`, `missing_username`, `username_taken`, `username_checking`, `missing_phone` (half-typed number), `missing_governorate` or `missing_area` and shows what to fix
   - Three-step profile (founder, 2026-10-25, iOS, Android and website): `profile_started` opens step 1 (photo, name, username; the username starts from the name as first.last, never from the email); `basics_saved` (prop `photo`) means step 1 is saved on the account; `details_started` opens step 2, the required details (governorate and area; "I love…" became optional on 2026-11-07, so `profiles.loves` can be empty; WhatsApp is optional on the website). Finishing step 2 saves the account as complete (`communities_selected`, `signup_completed`; the "how did you hear" answer is saved there too, a friend by default, so nothing is lost if step 3 is skipped). Then `extras_started` opens step 3, the optional extras (club, Sahel, school, work, InstaPay, how you heard); `extras_saved` (prop `communities`) or `extras_skipped` ends it. Someone who stops after step 1 has a username but no area: they count as not finished (`finished` = username and area) and come back to step 2 when they sign in again. Back goes to the step before. The admin shows each member's step from the database, not from events: signed in only (no username), step 1 done (username), step 2 done (area), all 3 steps (`profiles.extras_done_at`, set when step 3 is saved or skipped; older one-page sign-ups count as all 3). Migration 0044 adds the column and `admin_signup_stages`.
7. `communities_selected`
   - `community_requested`: a member asked for a community that was not in the list (props: kind, country)
   - `community_request_matched` (web): a typed name matched one already in the list, which is used instead (props: kind, status)
   - `community_request_duplicate`: a typed name someone else already requested; it is kept as typed and never blocks sign-up (props: kind)
8. `signup_completed`

Website only: `inapp_browser_shown` (props: `app` instagram | facebook) when the page opens inside Instagram's or Facebook's own browser, where Google sign-in sometimes fails (from 2026-10-28 the "Sign up in your browser" box with the Open in my browser button comes first, the sign-in buttons stay below it); `inapp_open_tapped` for the "Open in my browser" button; `inapp_still_showing` when the page is still showing 1.5 s after that tap (the link is copied and the menu steps are highlighted). It is NOT a failure count: Instagram keeps its own page visible even when the jump worked (before 2026-11-04 this event was called `inapp_open_failed` and fired for every tap). To count jumps that worked, count `welcome_viewed` events carrying `inapp`. The browser link carries the ad tags plus `inapp`, saved in `profiles.signup_source` with `placement` (Meta's {{placement}}). Every web event also carries `utm_campaign`, `utm_term`, `utm_content`, `placement` and (when the visit was moved out of Instagram or Facebook) `inapp` from the landing link, and `signup_source` is written at sign-in (first touch wins, only while the account has no username), so drop-offs count for their ad.

Website only, visit level (2026-10-22): `welcome_viewed` also carries `lang`, `browser` (instagram | facebook | samsung | edge | chrome | safari | other), `width` (screen px) and `ref` (referrer host, if any); no IP or location is stored. `signup_card_seen` = the sign-up card was at least half on screen (since 2026-10-23 the card is at the top of the first screen, and `early_button_tapped` from the old yellow "join now" button is no longer logged); `google_button_tapped` = a tap on Google's own button (seen as the page losing focus to its iframe); `google_returned_no_sign_in` (props `secs`, `app`) = the page came back to the front 2.5 s later with no sign-in, so the person left Google's window; `apple_button_tapped` and `apple_cancelled`. The admin tab shows the taps as steps and the two "left" events under *Where people get stuck* (migration `0040_funnel_left_sign_in.sql`).

Google/Apple sign-ups skip steps 3–5 (phone entry and code) at launch: **phone verification is on hold** (section 13, 2026-10-04). When it comes back it applies to new members who choose "Continue with phone", and later to verified-only Masters likes.

## Every event carries
`session_id`, `user_ref` (anonymous until phone verified), `step`, `ts` (UTC), `app_version`, `os`, `device`, `network`, `locale`, `latency_ms`, `error_code` (if any).

## Stuck detection (admin dashboard + alerts)
- **Drop-off per step** by day, area/community and method.
- **Technical suspect:** step conversion falls >X% vs 7-day baseline, or `error_code` / `provider_status` spikes (WhatsApp delivery failure, Google error), or p95 `latency_ms` jumps.
- **User-stuck:** no next event within 2 min of `code_sent`, 3 wrong codes, 3 `profile_field_error`s on one field, resend tapped twice.
- **Help requests:** each "Contact us" tap logs `help_opened` with the step it came from; the support form attaches `session_id` and last step so staff see the context without asking.

## Recovery paths (no passwords exist)
Login is phone code, Google or email link. Forgot username → it is only a public handle, can be changed in Edit profile. Lost number → verify through the linked Google/email, else Contact us (manual check).

## Unique identifiers
Phone number, email and username must each be unique across all accounts, across every sign-up method (phone, Google, email).
- Normalize before comparing: phone as +20 + 10 digits (no leading 0); email and username lower-cased/trimmed.
- Unique index in the database; the live check in the app is advisory. The final check runs when the code is confirmed or the account is created, so two people cannot claim the same value at once.
- On conflict: sign-up shows "already registered → Log in"; login with an unknown identifier shows "no account → Sign up". Log `identifier_conflict` (type: phone | email | username) in the funnel.
- Never reveal which account owns the value beyond "already registered".

## Admin dashboard
The **Sign-up funnel** tab of the web admin (`website/admin`, migration `0031_admin_signup_funnel.sql`) reads this table: visits per step, day by day, stuck points, per-ad results and unfinished sign-ups. Counts are of distinct `session_id`s; the website's Google/Apple redirect starts a new visit, so a step can read slightly above the one before it.

## Printed handouts (2026-10-30)
The New Giza flyer's QR code opens `tabkheen-a.com/ng`, which `website/_redirects` sends to the sign-up page with `utm_source=handout`, `utm_medium=print`, `utm_campaign=newgiza_handout`, `utm_term=New Giza`, `utm_content=flyer_v1`. Those tags ride on every web event and are saved in `profiles.signup_source`, so the admin shows these sign-ups as source "handout" and the funnel tab can split them by campaign. A new handout gets its own short link (for example `/ng2`) and its own `utm_content`.

## QR codes for Instagram and the website (2026-11-17, changed 2026-11-18)
Two QR codes, two destinations. `tabkheen-a.com/web` (website early sign-up) opens the sign-up page with `utm_source=website`, `utm_medium=qr`, `utm_campaign=early_signup`, so the admin shows those accounts as source "website". `tabkheen-a.com/ig` (Instagram page) opens `website/follow.html`, which logs one `qr_scan_instagram` event (props `code: ig`) in `signup_events` and then sends the person to instagram.com/tabkheen.a. Count scans with `step = 'qr_scan_instagram'`; it counts scans, not follows. The PNGs are in `/mnt/project-files/marketing/qr/`. The QRs only hold the short links, so destinations can change here without reprinting.

## Shooting Club cards (2026-11-19)
2,100 cards were printed with two QR codes: the left one opens `tabkheen-a.com/web`, the right one opens instagram.com/tabkheen.a directly (checked by decoding a photo of a printed card). `/web` now sends people to the sign-up page with `utm_source=handout`, `utm_medium=print`, `utm_campaign=shootingclub_cards`, `utm_term=Shooting Club`, `utm_content=card_v1`, so the admin shows these sign-ups as source "handout" with campaign "shootingclub_cards". Before this change `/web` was tagged `utm_source=website`. The Instagram QR is not counted by our backend.

### Shooting Club card wording (2026-11-19)
Visits tagged `utm_campaign=shootingclub_cards` (the `/web` link on the printed cards) show the card's promise first: "Think you're the best cook in the club? Prove it", "Join Shooting Club Got Talent", sign up / post your signature dish / get likes to win (Arabic too). All other visits keep the normal wording. Wording only; the sign-up steps are identical.
Card visitors also see the card's design at the top (Got Talent title, cooking edition tag, "One photo. One minute. Most likes wins." with the first-50 prize reveal, four steps), a last step titled "Last step: join Shooting Club" with Shooting Club preselected under CLUB (they can change it), and no "Skip for now" on that step. Wording and defaults only; fields and saved data are the same as every other sign-up.

Layout for card visitors: the offer sits above the sign-in card, a yellow arrow points into it, and the card has a glowing yellow ring, so the Google and Apple buttons are on the first screen even on small phones. The four steps and the note come below the buttons. The promo hides after sign-in.

Timing on the card page: sign-up and choosing Shooting Club happen today ("TODAY · 60 SECONDS"); posting the dish and the likes competition start when the app launches ("THE DAY THE APP LAUNCHES"). The page says so in both languages; keep that if the wording changes, because the app cannot take dish posts until launch.

- Shooting Club card auto-join (founder, 2026-11-19): visitors from the card (`utm_campaign=shootingclub_cards`) are added to Shooting Club when step 2 is finished (event `card_club_joined`), so closing the page before the optional step 3 still leaves them in the competition. The skip button is back for them. Their done screen says "You're all set", that they will be notified the day the app opens, and has a Follow on Instagram button. Website only (card page); not an app change.
