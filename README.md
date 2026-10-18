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

The same staff area on a computer, with charts and downloads. It is a static page in `website/admin/`, deployed with the website, and sign-in is the same Google account the app uses. It calls the same `admin_*` database functions, so the staff rules are enforced in the database, not in the page. Overview shows members, a day-by-day chart (sign-ups, posts, orders) and a breakdown of members by governorate, area, how they heard, what they love or sign-up source. Members, Orders and Referrals have search and CSV downloads; the full members and orders downloads are owner only and are written to the action log. Run `supabase/migrations/0023_admin_web_data.sql` first. The Communities tab lists every approved community (searchable, with member counts) and flags each waiting request whose name looks like an existing community or another request (`0024_admin_community_duplicates.sql`: generic words like compound/club are ignored, then names are compared by shared letter triplets), so staff can reject duplicates with the existing community named in the reason. A **New community** form at the top creates an approved community directly, and **Add member to communities…** on a request closes it by adding the requester to any number of existing communities and/or newly created ones in one step (`0026_admin_community_tools.sql`; they get a notification naming every community). Each row of the Existing communities list has **Edit** (name, type, governorate, area; a name that already exists is refused), **Hide / Show** (a hidden community disappears from the app, website, search, rankings and announcement audiences but keeps its members and posts) and **Merge…** (moves all members, posts and announcement targets into another community and retires the old one; it cannot be undone) for owners and moderators (`0028_admin_community_manage.sql`, which also adds `communities.hidden_at` and `merged_into`). In Members, **Manage…** opens one member: private staff notes (any staff), **Send warning…** (kept on their record and shown to them as a notification), **Ban…** (a suspension that also blocks sign-in; **Lift ban** undoes it) for owner and moderator, and owner-only **Delete account…** (refused while the member has an open order; staff accounts and yourself are never offered) (`0029_admin_member_safety.sql`). In Orders, each order has **Add staff note…** (any staff, shown in its history) and, for owner and moderator, **Change status…** (any status with a reason: plates go back to the dish when an order is cancelled or declined and are taken again if it is revived; the buyer and cook are both notified), plus a **Stuck 24h+** filter for open orders untouched for a day (`0030_admin_order_disputes.sql`). The page is marked noindex and not cached (`website/_headers`).

Controls and Staff tabs (`0027_admin_staff_controls.sql`): **Controls** has switches to pause ordering or posting (owner or moderator; enforced by database triggers, so older app builds are stopped too), maintenance mode with a message, and a minimum app version (owner only). The app reads them at launch through the open `app_status()` function and shows "Back soon" or "Please update" (`src/components/app-gate.tsx`); a failed check never locks anyone out. **Staff** (owner only) lists staff, adds a member by search, changes a role or removes someone; another owner can only be changed in the SQL Editor.

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
