# TBKHN A

Neighbors in trusted communities see what home cooks are cooking today, reserve a plate and pick it up.

Built with Expo (SDK 57) and Expo Router. Product context and rules live in `docs/`; start with `docs/TBKHN-CONTEXT.md`.

```bash
npm install
npx expo start
```

## Backend (Supabase)

1. In the Supabase dashboard, open **SQL Editor**, paste `supabase/migrations/0001_initial_schema.sql` and run it, then do the same with `supabase/seed.sql` (starter communities).
2. **Authentication > Sign In / Providers > Phone**: turn it on and connect Twilio (WhatsApp codes first, SMS as the fallback). While testing, add test numbers with a fixed code there.
3. Copy `.env.example` to `.env` and fill in the project URL and **publishable** key. Never put the secret (service_role) key in the app.

## Web admin (tabkheen-a.com/admin)

The same staff area on a computer, with charts and downloads. It is a static page in `website/admin/`, deployed with the website, and sign-in is the same Google account the app uses. It calls the same `admin_*` database functions, so the staff rules are enforced in the database, not in the page. Overview shows members, a day-by-day chart (sign-ups, posts, orders) and a breakdown of members by governorate, area, how they heard, what they love or sign-up source. Members, Orders and Referrals have search and CSV downloads; the full members and orders downloads are owner only and are written to the action log. Run `supabase/migrations/0023_admin_web_data.sql` first. The Communities tab lists every approved community (searchable, with member counts) and flags each waiting request whose name looks like an existing community or another request (`0024_admin_community_duplicates.sql`: generic words like compound/club are ignored, then names are compared by shared letter triplets), so staff can reject duplicates with the existing community named in the reason. A third button, **Add member to <existing community>**, closes the request, adds the requester to that community and notifies them (tap opens it) (`0025_admin_join_existing_community.sql`). The page is marked noindex and not cached (`website/_headers`).

## Admin panel

Staff use the same app: **Profile > Admin** appears only for staff accounts. Roles: **owner** (everything, including adding staff), **moderator** (community requests, reports, removing posts, suspending members, announcements) and **support** (look up members, orders and referrals, and read the queues). **Orders** shows each order's steps with who did them and why; **Referrals** counts finished sign-ups by their "How did you hear" answer, per week and per community.

1. Run `supabase/migrations/0004_admin.sql`, then `0005_admin_orders_referrals.sql`, in the SQL Editor, after the earlier migrations.
2. Sign in to the app once with your own account, then make yourself the first owner in the SQL Editor (put your sign-in email in place of the example):

   ```sql
   insert into public.admin_staff (user_id, role)
   select id, 'owner' from auth.users where email = 'you@example.com';
   ```

3. Add moderators and support staff from **Admin > Members** (find them, then tap their role).

Every admin action is kept in **Admin > Action log** with who did it and why.

Database checks run on a local Postgres: `PSQL_ARGS="-h <host> -U postgres" supabase/tests/run.sh`.
