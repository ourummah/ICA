# Progress

## Done

### M0: Foundations (scaffold, tooling, CI)

- Next.js 16 App Router + TypeScript (strict) + Tailwind v4, scaffolded with `create-next-app`.
- shadcn/ui set up by hand (`components.json`, `src/lib/utils.ts`, `src/components/ui/button.tsx`) with a `cleaner` button size (56px+ target, 18px text).
- Brand tokens (navy `#0F243E`, teal `#009193`) and red/amber/green status colours in `src/app/globals.css`.
- Folder layout per CLAUDE.md: `src/app/(marketing)` (placeholder landing page at `/`), `src/app/app` (placeholder at `/app`), `src/lib`, `src/offline`.
- Supabase local dev initialised (`supabase/config.jsonc`, empty `supabase/migrations/`).
- Vitest (jsdom + Testing Library) unit tests, Playwright e2e on a desktop and a phone profile.
- Prettier, ESLint (Next config), `.env.example` with every variable from SPEC section 14.
- GitHub Actions CI: lint, typecheck, format check, unit tests, build, e2e.

### M1: Schema, RLS, hash chain, seed, auth

- Migrations in `supabase/migrations/`: every table from SPEC section 6, enums, composite `(id, site_id)` foreign keys so a row can never point at a parent in another site.
- RLS on every table (`app.*` helper functions). Site visibility: site memberships, org-wide memberships (processor-owned sites, or contractor sites granted via `site_access`), and registered devices.
- Append-only `step_records`, `audit_events`, `note_translations`: UPDATE/DELETE revoked from app roles and blocked by trigger for everyone.
- Per-site hash chain on `audit_events`, computed in a trigger under a per-site advisory lock. Every step record is written into the chain (its `chain_hash` is the link's hash), and other site changes are audited by trigger. `verify_chain(site_id, from, to)` re-walks the chain and checks step records against their chained snapshots.
- SSOP versions: steps only editable while draft; active can't go back to draft; retired can't be reactivated.
- Cleaner PINs: bcrypt in `cleaner_pins`, `set_cleaner_pin` (service role), `verify_cleaner_pin` and `device_cleaners` (registered device only).
- Private `photos` storage bucket with site-folder policies.
- Staff email sign-in at `/app/login`, session refresh in `src/proxy.ts`, signed-in home showing roles.
- Demo seed (`npm run seed`): Southern Cross Meats (Demo), 4 zones, 8 equipment items with active SSOPs (conveyor SSOP from SPEC section 9), 5 chemicals, 3 staff, 4 cleaners with PINs, tonight's shift with 8 tasks. Re-running resets first via `reset_demo_data()`.
- Tests: `npm run test:db` (138 tests: RLS per table and per role, append-only, chain tamper detection, PINs, seed). E2E for staff sign-in.

### M2: Admin setup and SSOP builder

- Site admin area at `/app/admin` (linked from the app home for site admins): overview, zones, equipment, chemicals, people, devices, tonight's tasks.
- People: add cleaners (name, language, PIN), reset PINs, remove a cleaner from the site (records kept); add staff (supervisor, QA, site admin) with a temporary password.
- Devices: list, rename, revoke. Registering a device happens on the device itself, in M3.
- SSOP builder per equipment item: start a draft (copies the latest version), add/edit/delete/reorder steps (step type sets the default icon), import steps from CSV (template at `/app/admin/ssop-template.csv`, every bad row reported with its row number), activate (previous version retired, history shown with who activated it and when).
- Tonight's tasks: assign equipment with an active SSOP to a cleaner; creates tonight's shift (22:00 to 06:00 site time) if needed.
- "Demo values — use your site's SSOP and chemical labels" note on the overview, chemicals and SSOP screens.
- New database functions: `create_ssop_draft`, `activate_ssop`, `move_ssop_step`, `delete_ssop_step`, `replace_ssop_steps`, `ensure_shift` (all check the caller's role), plus one-draft-per-equipment.
- Tests: 148 database tests; unit tests for CSV parsing and admin schemas; e2e for the F1 acceptance check (new equipment + 8-step SSOP via CSV + assigned tonight, timed under 5 minutes), the builder, and adding a cleaner. E2E resets the demo tenant first (`e2e/global-setup.ts`).

## Next

- M3: cleaner PWA (device registration, PIN sign-in, task list, guided steps, photos, timers, ATP), online first.

## Decisions

- **shadcn components added by hand.** The shadcn CLI couldn't reach its registry from the build environment, so components are copied in manually in shadcn's format. `components.json` is in place, so `npx shadcn add <component>` works on a normal machine.
- **System font stack instead of Google Fonts.** Avoids a network fetch at build time and keeps the offline app shell small.
- **Supabase CLI 3.x uses `supabase/config.jsonc`** (not `config.toml`). The CLI is a dev dependency, so use `npx supabase ...` or the `db:*` npm scripts.
- **`typecheck` runs `next typegen` first** so Next's generated route types (`LayoutProps`, `PageProps`) exist before `tsc`.
- Playwright pinned to 1.63.0.
- **`profiles.id` is its own UUID with a nullable `auth_user_id`** (SPEC says "id = auth user id or null"; a primary key can't be null). Staff have an auth user, PIN-only cleaners don't.
- **PIN hashes live in a separate `cleaner_pins` table** with no RLS policies, so they can never be read through the API. Offline PIN checks (M4) will get hashes through a device-only function. Note: a 4-digit PIN hash is easy to brute-force once cached on a device; this is inherent to offline PIN sign-in.
- **Shared devices sign in as their own Supabase auth user** linked from `devices.auth_user_id`. RLS treats a registered device as able to read its site and write step records and photos for it. The cleaner's identity is carried on each record (`profile_id`). Device registration UI comes in M3.
- **Translations go in an append-only `note_translations` table** instead of `step_records.note_en`, so step records are never updated. Newest row wins; supervisor corrections are rows with `source = 'human'`.
- **`audit_events.seq`** (assigned inside the chain trigger after taking the per-site lock) orders the chain, since timestamps can tie.
- Added a few columns the features need: `organisations.is_demo` (demo reset), `devices.revoked_at`, `profiles.consent_accepted_at`/`photo_url`, `tasks.reclean_of_task_id`, `step_records.skip_reason`, `photos.client_photo_id` (idempotent upload), `exceptions.detail`, `releases.override_open_exceptions`.
- **Demo staff password** defaults to `ica-demo-local` only against a local Supabase. Seeding a hosted project requires `DEMO_STAFF_PASSWORD`.
- `package.json` is `"type": "module"` so `node scripts/seed.ts` runs with Node's built-in TypeScript support (no extra runner).

- **One site per admin screen.** An admin with several sites manages the first one (alphabetical) for now; a site switcher can come later.
- **Staff get a temporary password set by the admin** rather than an emailed invite, since email delivery isn't configured yet.
- **Equipment can't be deleted** from the admin screens yet: once it has records, the append-only rules would block it anyway.

## Known gaps

- None yet.
