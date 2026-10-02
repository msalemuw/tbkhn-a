# Sign-up funnel tracking (backend only)

The mobile app never shows this data. Goal: see where new users get stuck and tell a technical fault from a user drop-off.

## Steps (event names)
1. `welcome_viewed`
2. `signup_method_chosen` — `method`: phone | google | email
3. `phone_entered` — `valid`: bool, `attempts`
4. `code_sent` — `channel`: whatsapp | sms, `provider_status`
5. `code_entered` — `attempts`, `result`: ok | wrong | expired
6. `profile_started` / `profile_field_error` — `field` (username_taken, invalid_format …)
7. `communities_selected`
8. `signup_completed`

Google/email sign-ups always pass 3–5: **phone verification is mandatory for every new member**. Existing users logging in with Google/email skip it.

## Every event carries
`session_id`, `user_ref` (anonymous until phone verified), `step`, `ts` (UTC), `app_version`, `os`, `device`, `network`, `locale`, `latency_ms`, `error_code` (if any).

## Stuck detection (admin dashboard + alerts)
- **Drop-off per step** by day, area/community and method.
- **Technical suspect:** step conversion falls >X% vs 7-day baseline, or `error_code` / `provider_status` spikes (SMS/WhatsApp delivery failure, Google error), or p95 `latency_ms` jumps.
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
