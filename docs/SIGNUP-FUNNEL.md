# Sign-up funnel tracking (backend only)

The mobile app never shows this data. Goal: see where new users get stuck and tell a technical fault from a user drop-off.

## Steps (event names)
1. `welcome_viewed`
2. `signup_method_chosen` — `method`: phone | google | apple
3. `phone_entered` — `valid`: bool, `attempts`
4. `code_sent` — `channel`: whatsapp (no SMS since 2026-10-04), `provider_status`
5. `code_entered` — `attempts`, `result`: ok | wrong | expired
6. `profile_started` / `profile_field_error` — `field` (username_taken, invalid_format, photo_upload …); a failed optional photo upload is logged and sign-up continues without it
7. `communities_selected`
   - `community_requested`: a member asked for a community that was not in the list (props: kind, country)
   - `community_request_matched` (web): a typed name matched one already in the list, which is used instead (props: kind, status)
   - `community_request_duplicate`: a typed name someone else already requested; it is kept as typed and never blocks sign-up (props: kind)
8. `signup_completed`

Website only: `inapp_browser_shown` (props: `app` instagram | facebook) when the page opens inside Instagram's or Facebook's own browser, where Google sign-in sometimes fails (the sign-in buttons stay, with the way out shown under them); `inapp_open_tapped` for the "Open in my browser" button; `inapp_open_failed` when the page is still showing 1.5 s after that tap (the link is copied and the menu steps are highlighted). The browser link carries the ad tags plus `inapp`, saved in `profiles.signup_source` with `placement` (Meta's {{placement}}). Every web event also carries `utm_campaign`, `utm_term`, `utm_content` and `placement` from the landing link, and `signup_source` is written at sign-in (first touch wins, only while the account has no username), so drop-offs count for their ad.

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
