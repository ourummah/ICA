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

### M3: Cleaner app (online first)

- Device registration at `/app/device`: a site admin signs in on the phone, names it, and the browser becomes that site's device (its own auth user; the admin is signed out on that phone). Linked from the app home for site admins.
- Cleaner app at `/app/cleaner` (client-rendered): name tiles, 4-digit PIN keypad (5 wrong tries locks for 30 s), language picker (flag + native name, saved per cleaner), consent notice on first sign-in, tonight's task list (yours first, others below), one step per screen.
- Step screen: big icon, title and instructions, chemical and strength in a highlighted box, photo capture (compressed to 1600px JPEG ~0.7, SHA-256 on the device), dwell/contact-time countdown that survives refresh and vibrates/beeps at the end ("Finish early" needs a second tap), ATP keypad with "Fail — re-clean" guidance, optional note, "Can't do this step" with reasons.
- Header on every screen: cleaner's name, save status, language, sign out.
- Server routes: `POST /api/sync/step-records` (batch; recomputes `payload_hash`, idempotent by `client_record_id`) and `POST /api/sync/photos` (recomputes SHA-256, stores under `<site>/<task>/`, idempotent by `client_photo_id`). M4's outbox will use these same routes.
- Task status is derived on the server from step records (pending → in progress → completed); devices' `last_seen_at` updates on sync.
- next-intl for every cleaner string (`src/messages/en.json`); `tl` and `id` fall back to English until M8.
- `DEMO_FAST_TIMERS=true` turns dwell minutes into seconds (e2e runs with it on).
- Tests: 153 database tests; unit tests for payload hashing and i18n fallback; phone e2e that registers a device, signs in by PIN, completes the 10-step conveyor SSOP (3 photos, early dwell finish, a note, failed ATP), survives a refresh mid-task, then checks the records, photos, task status and hash chain in the database.

### M4: Offline

- Service worker (Serwist, `@serwist/turbopack`): static assets precached; the cleaner page cached on every online visit and served from cache with no signal. Scoped to `/app/cleaner` so staff pages are never served from cache. Web app manifest and icon.
- IndexedDB via Dexie (`src/offline/db.ts`): local step records (kept after sync), photo blobs (freed once the server has them), cached cleaners and tonight's tasks.
- Every step is saved to IndexedDB first, record and photo in one transaction (`src/offline/outbox.ts`), then synced from the outbox (`src/offline/sync.ts`): records oldest first in batches, then photos of synced records. Idempotent end to end, so interrupted syncs are safe to repeat.
- Sync runs when the browser comes online, on app focus, every 30 s while online and after each save, with exponential backoff (5 s doubling to 5 min) on failure (`src/offline/use-sync.ts`).
- Sync indicator on every cleaner screen: "All saved ✓" / "Saved on device — N items waiting to sync" / "Syncing…".
- Offline PIN sign-in: PIN hashes for the device's own cleaners are cached (`device_cleaner_pin_hashes()`) and checked on the device with bcryptjs while less than a day old; otherwise the server checks.
- Cached data renders first; network loads time out after 8–10 s and fall back to the cache.
- Fixed: registering a device or signing out now ends the session on that browser only (it used to sign the admin out everywhere).
- Tests: unit tests for the outbox (offline queueing, sync, retry without duplicates, rejection, photo cleanup), backoff and offline PIN checks against a real pgcrypto hash. **M4 acceptance e2e (`e2e/offline.spec.ts`)**: with `context.setOffline(true)`, signs in by PIN with no signal, completes the 9-step Slicer 2 SSOP (3 photos, a note, early dwell, ATP), shows "12 items waiting to sync", reloads while offline with progress intact, then goes online and checks 9 records with no duplicates, 3 photos, a completed task and an intact chain.

### M5: Exceptions engine, supervisor dashboard, re-clean

- Exceptions engine (`src/lib/exceptions/engine.ts`), run by the sync route right after it saves records: skipped step → `missed_step` red; ATP over the limit (or result `failed`) → `atp_fail` red; timer shorter than the dwell → `dwell_short` amber, red under 50%; device clock more than 5 min off the server at sync → `clock_skew` amber (devices now send their clock with each batch). Each exception links to its step record, so the supervisor sees the record and its photos.
- "Not finished by shift end" → `missed_step` red, raised by `flag_overdue_tasks()` each time a dashboard page loads (idempotent).
- Supervisor dashboard at `/app/supervisor`, linked from the app home for supervisors, QA and site admins:
  - Zone board with a tile per zone: green (all done, nothing open), amber (not started, in progress or amber exceptions), red (open red exceptions or overdue). Each tile has an icon and words as well as colour.
  - Click a zone to see its equipment, then a task to see each step's record: result, who did it, device and server times, ATP, timer, note, photos (signed URLs, 5 min) and exceptions.
  - Exception queue at `/app/supervisor/exceptions` with status, severity and type filters.
  - Actions: resolve with a note, or request a re-clean.
  - A notice explains that alerts appear as devices sync.
- Re-clean (`request_reclean()`): creates a new task for the same equipment on the same cleaner's list, using the SSOP version that is active now. The old task becomes `reclean_required` and its open exceptions are resolved with the supervisor's reason. On the cleaner app, re-cleans show first with a red "Re-clean" badge. The task list refreshes every 15 s and when the cleaner returns to it.
- Live updates via Supabase Realtime on tasks, exceptions, step records and photos (RLS applies). The page re-renders on each change, with a 30 s refresh as a fallback, and shows a "Live" indicator.
- Exceptions can only be changed through `resolve_exception()` / `request_reclean()`, so `resolved_by` is always the real user. Unique indexes allow one exception per type per record, and one overdue exception per task.
- Tests:
  - 164 database tests: resolve, re-clean, overdue, uniqueness, permissions across organisations and for devices, and the realtime publication.
  - Unit tests for every engine rule and for the tile colours.
  - **F4/F5 acceptance e2e (`e2e/supervisor.spec.ts`)**: a supervisor on a laptop and a cleaner on a phone. The cleaner cuts a dwell short and fails an ATP. The Mincing tile turns red with no page reload within 10 s of the sync, and both exceptions show on their steps with the photos. The supervisor requests a re-clean, the cleaner does it properly, and the tile turns green live.

### M6: Pre-op inspection and QA release

- Configurable pre-op checklist per site (new `preop_items` table, with RLS and a test). The demo seeds the 7 default items from SPEC F6. Admins edit the list at `/app/admin/preop`, which also offers "Add the default items" when the list is empty.
- Pre-op inspection per zone at `/app/supervisor/zones/<zone>/preop` (QA or supervisor):
  - Mark each item pass or fail. A failure needs a note and can have a photo, compressed in the browser and stored in the private bucket under the site's folder.
  - On a failure, QA can tick equipment to send back for re-clean. This uses the same `request_reclean()`, which QA may now call too.
- Release or Hold per zone, on the zone page (QA only):
  - Hold needs a reason.
  - Release is blocked by a database trigger while any red exception is open on that zone's tasks this shift. QA can override, which needs a reason and is stored as `override_open_exceptions` with the reason.
  - Times come from the server.
  - Every decision goes into the audit hash chain (existing audit trigger).
- Board and zone page show "Released 05:42 by J. Smith" (or "Held … : reason", with "(override)" when used) and the pre-op result. Both update live (releases and inspections added to Realtime).
- Tests:
  - 177 database tests: checklist permissions, inspector can't be forged, release blocked/overridden/blank reasons, other zones and amber exceptions don't block, server time, audit event and chain, QA re-clean.
  - **F6 acceptance e2e (`e2e/qa-release.spec.ts`)** on the Chillers zone:
    1. A pre-op fails with a note and a photo, and sends the trolleys for re-clean.
    2. A second pre-op passes.
    3. Release is blocked by an open red exception, and an override without a reason is refused.
    4. An override with a reason releases the zone.
    5. The board shows "Released HH:MM by J. Smith", and the chain verifies.

### M7: Audit pack

- `/app/supervisor/audit` (QA, supervisor, site admin): choose shift dates and zones (none ticked = all), then download a PDF or a CSV.
- PDF (`src/lib/audit/pdf.tsx`, @react-pdf/renderer, built-in Helvetica, no network fonts):
  - Cover: site, period, zones, generated at/by. A **record-integrity box** from a fresh `verify_chain()` over the site's whole chain ("Record integrity verified: N records, no breaks", or a red failure with the first broken entry).
  - Summary per shift and zone: status, tasks done, exceptions, pre-op, release.
  - Detail per task:
    - SSOP version, cleaner and status.
    - Every step record with device time and server time, result, ATP against the limit, and timer.
    - The note as written, plus the English with an "AI-translated" / "Supervisor-confirmed" label.
    - Photo thumbnails with the SHA-256 prefix.
  - Then exceptions with resolutions, pre-op inspections and release decisions.
  - A footer on every page with the integrity result and page numbers.
- CSV: one row per step record (UTC times, hashes, photo SHA-256s, translation and source), with a byte-order mark so Excel reads Tagalog and Bahasa notes. Fields that look like spreadsheet formulas are neutralised.
- Data is read with the user's own client, so RLS applies. Thumbnails are capped at 200 per PDF to stay well under 15 s.
- Tests:
  - Unit tests for CSV escaping, filters and file names, and PDF rendering (with a photo, and with a failed chain).
  - The F4/F5 e2e now also downloads the demo night's PDF (checked under 15 s) and CSV, which has both Mincer 1 cleans including the failed ATP.

## Next

- M8: translation via the Claude API, and the cleaner UI in Tagalog and Bahasa Indonesia.
- Translation review on the dashboard (part of F5) comes with M8, when there are AI translations to review.

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

- **The device is the trust boundary for cleaner identity.** The PIN is checked when a cleaner signs in on the device; records then carry that cleaner's `profile_id`. The server checks the device and site, not the PIN, on each record. This is what makes offline sign-in possible.
- **Step text is shown in English for now.** SSOP steps are written in English; UI labels go through next-intl. Translating SSOP content per language is out of scope for the MVP (SPEC F3 says English fallback).
- **An ATP reading over the limit is stored as result `failed`** (with the reading), so failures are obvious in records and the exceptions engine (M5).

- **`cacheComponents` turned off** in `next.config.ts`. Serwist's Turbopack route needs route segment config that Cache Components doesn't allow; the app didn't rely on it.
- **Language and consent changes made offline** are saved on the device straight away but only sent to the server the next time they change online. Low impact for the demo.

- **The exceptions engine runs in the sync route, not in a database trigger**, because it needs the demo timer scale (`DEMO_FAST_TIMERS`). Exceptions are written with the service role after checking the device; no app user can insert them.
- **A re-clean resolves the old task's open exceptions** with the supervisor's reason (recorded as resolved by them). The re-clean task replaces the old one on the zone tile. This is what lets the tile go green in demo step 8.
- **A zone with tasks not started yet is amber ("Not started")**, matching demo step 6 ("amber/in progress with nothing new yet").
- **Clock skew is flagged once per task per sync batch**, on the batch's first record for that task, rather than on every record.
- **Overdue tasks are flagged when a dashboard loads**, not on a timer. No background job is needed for the demo; a cron can call `flag_overdue_tasks()` later.
- The admin builder e2e now versions the Paddle mixer SSOP instead of Mincer 1, so it can't change the steps of tasks other tests clean.

- **Release is blocked only by open red exceptions** (as SPEC F6 says), not by a missing or failed pre-op; the zone page shows the pre-op result next to the decision.
- **Pre-op photos go through a server action** with a 4 MB body limit (Vercel's cap is 4.5 MB). They are compressed in the browser first (1600px JPEG), like cleaner photos.
- **QA can request re-cleans** (from a failed pre-op, SPEC F6), as well as supervisors and site admins.
- Release and pre-op forms keep their inputs controlled, because React resets uncontrolled form fields after every action, which wiped the override box after a failed attempt.

- **The audit pack period is by shift date** (the night a shift starts), so a 22:00 to 06:00 shift is never split across two days.
- **The integrity check always walks the site's whole chain**, because a chain can only be verified from its start; the count shown is every chained entry for the site.
- `@react-pdf/renderer` pinned to 4.9.0 (4.9.1 was a day old). Unit tests stub the `server-only` package (see `vitest.config.ts`).

## Known gaps

- E2E tests share one seeded tenant per run, so `--repeat-each` fails on the second pass (tasks are already completed). Run `npm run seed` between repeated runs.
- If inserting exceptions fails after the records were saved, the error is logged and those records get no exceptions (the device doesn't resend saved records).
- Translation review (F5) waits for M8.
- WebP photos (only possible from desktop uploads) are listed by hash in the PDF without a thumbnail; the PDF library can't draw WebP.
