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

The project is also set up to run on Cloudflare Workers, via the
[OpenNext](https://opennext.js.org/cloudflare) adapter — deployed
automatically by Cloudflare Workers Builds on every push to `main`. The
original `next dev` / `next build` / `npm run dev` scripts are untouched, so
this is additive, not a replacement.

- `npm run deploy` — build with OpenNext, then `wrangler deploy`
- `npm run preview` — build and preview the Worker locally (`wrangler dev`)

**Cloudflare dashboard settings** (Workers & Pages → this project →
Settings → Build) must have:
- Deploy command: `npm run deploy` (not the dashboard's own default
  `npx wrangler deploy` — without the OpenNext build step first, there's
  nothing for wrangler to deploy; `npm run deploy` runs both).
- Environment variables: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (same two as everywhere else).

Config lives in `wrangler.jsonc` (Worker name, compatibility date/flags,
`ASSETS`/`IMAGES` bindings, and the `WORKER_SELF_REFERENCE` service binding
— whose `service` value **must** match `name` exactly, or deploys fail with
"Worker ... was not found") and `open-next.config.ts` (cache strategy — left
at the default no-op `"dummy"` cache rather than the R2-backed option, since
this app reads everything live from Supabase per request and provisioning
an R2 bucket isn't necessary). `compatibility_flags: ["nodejs_compat"]` is
required since `exceljs` (used for reading uploaded `.xlsx` files) and
`@supabase/ssr` rely on Node builtins (`Buffer`, etc.).

Add the Workers production URL as an additional authorized redirect URI in
both Google Cloud Console and Supabase's Auth → URL Configuration (the OAuth
callback itself still goes through Supabase's own `.../auth/v1/callback`,
unchanged).

For local testing against the Workers runtime, copy `.dev.vars.example` to
`.dev.vars` (gitignored — holds real secrets) before running `npm run
preview`.

`src/proxy.ts` (the auth gate) runs as Cloudflare's "Node.js middleware" —
per OpenNext's own build output, that's "experimental ... and not officially
maintained by OpenNext maintainers." It works, but keep an eye on it.

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
