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

Database checks run on a local Postgres: `PSQL_ARGS="-h <host> -U postgres" supabase/tests/run.sh`.
