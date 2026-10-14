# Device Registry

Internal tool for tracking company devices, MDM enrollment status, and
custody history. Next.js (App Router, TypeScript) + Supabase (Postgres,
Auth, Row Level Security), deployed on Vercel.

## Local setup

1. `nvm use stable` (or any Node 18.17+; the default `node` on some setups
   may resolve to an old version via nvm — check `node --version`).
2. `npm install`
3. Create a Supabase project, then copy the project URL and anon key into
   `.env.local` (see `.env.local.example`):
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
4. Run the migrations in `supabase/migrations/` in order, via the Supabase
   SQL editor (or `supabase db push` if you use the CLI):
   - `0001_core_schema.sql` — enums, `devices`, `device_assignments`
   - `0002_history_trigger.sql` — auto-close the previous assignment on reassign
   - `0003_allowlist_and_rls.sql` — `allowed_users`, the sign-in gate, RLS policies
   - `0004_import_devices.sql` — the bulk import/sync function
5. Seed `allowed_users` with at least one email before relying on the
   sign-in gate:
   ```sql
   insert into allowed_users (email) values ('you@example.com');
   ```
6. Create a Google OAuth client (Google Cloud Console). Set the Supabase
   auth callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`)
   as an authorized redirect URI. If everyone signing in shares one Google
   Workspace domain, set the OAuth consent screen to **Internal**.
7. In Supabase: Authentication → Providers → enable Google with that
   client's credentials. Then Authentication → Hooks → wire up
   `check_allowed_user` as the **Before User Created** hook.
8. `npm run dev` and sign in at `/login`.

## Deploying

### Vercel

Deploy to Vercel with the same two environment variables
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`), and add the
production callback URL as an additional authorized redirect URI in Google
Cloud Console.

### Cloudflare Workers (alternative)

The project is also set up to run on Cloudflare Workers via
[vinext](https://github.com/cloudflare/vinext) — the original `next dev` /
`next build` / `npm run dev` scripts are untouched, so this is additive, not
a replacement.

- `npm run dev:vinext` — local dev server on Vite (port 3001)
- `npm run build:vinext` — production build (`.cloudflare/output/`, gitignored)
- `npm run start:vinext` — preview the built Worker locally
- `npm run deploy:vinext` — deploy to Cloudflare Workers (requires `cf login`
  or `wrangler login` first)

Config lives in `vite.config.ts` (the vinext + `@cloudflare/vite-plugin`
Vite plugins) and `cloudflare.config.ts` (the Worker's name, compatibility
date/flags, and the `ASSETS` binding) — no `wrangler.jsonc` needed, this
project uses the newer `cf` CLI config format. `compatibility_flags:
["nodejs_compat"]` is required since `exceljs` (used for reading uploaded
`.xlsx` files) and `@supabase/ssr` rely on Node builtins (`Buffer`, etc.).

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as
Cloudflare Workers environment variables/secrets, and add the Workers
production URL as an additional authorized redirect URI in both Google
Cloud Console and Supabase's Auth → URL Configuration (the OAuth callback
itself still goes through Supabase's own `.../auth/v1/callback`, unchanged).

`exceljs` is the single largest dependency in the Worker bundle (~950 KB
uncompressed in the `parse-spreadsheet` chunk, ~260 KB gzipped) — worth
keeping an eye on against your Workers plan's script size limit if other
large dependencies get added later.

## Managing access

Day-to-day access control is just adding/removing a row in `allowed_users`
— no redeploy required.

## Importing devices in bulk

The "Import" button on the dashboard accepts an `.xlsx` or `.json` file.
Expected columns/keys (case-insensitive): `serial_number`, `device_name`
(required), `origin`, `order_date`, `enrollment_status`, `enrolled_at`,
`owner_name`, `owner_email`, `assigned_at`. Existing devices are matched
and updated by `serial_number`; a row whose owner differs from the
device's current owner creates a new assignment (the previous owner
becomes history), matching a manual reassign.
