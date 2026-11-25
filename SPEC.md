# Intelligent Cleaning Audit (ICA) — MVP Specification

Version 1.0 · 25 Nov 2026 · Owner: Max Thomas

## 1. Goal

Build a **demonstrable MVP** of ICA: an offline-capable app that guides night-shift cleaners through a food plant's sanitation procedures (SSOPs), captures proof (photos, timers, ATP readings, sign-offs), shows supervisors which zones are ready, lets QA release the line for production, and produces a tamper-evident audit pack.

"Done" for this MVP = we can run the **demo script in section 12** end-to-end on a phone + a laptop, including a period with the phone offline, using a seeded demo plant. It must be deployed (Vercel + Supabase) and reachable by URL.

This is a demo for pilot customers, not yet production. Favour clarity, reliability and a clean UX over breadth.

## 2. Product context (read once)

- Users work in wet, loud washdown rooms, often at night, wearing gloves, with poor or no mobile signal inside steel/concrete rooms.
- Crews are multilingual (Tagalog, Bahasa, Mandarin, Nepali, Burmese, Hindi…). Many have limited English literacy. The UI must be **picture/icon-led with big touch targets**.
- Auditors and QA managers need records they can trust: who did what, when, with evidence, and with any edit visible.
- **AI assists, humans decide.** AI never passes a clean or releases a line. AI output is always labelled as AI-generated and the original is always kept.
- Customers are (a) food processors (meat, poultry, smallgoods, dairy) and (b) contract sanitation companies who clean several client plants.

## 3. Scope

### In scope (MVP)
1. Site setup: zones → equipment → chemicals → SSOPs with ordered steps (admin UI + seed data).
2. Cleaner app (PWA, mobile-first, works offline): sign-in on shared device, tonight's task list, step-by-step guided clean with photos, dwell timers, ATP entry, notes, completion.
3. Offline capture + background sync with visible sync status.
4. Exceptions engine: missed steps, short dwell time, ATP fail, re-clean required, flagged photo.
5. Supervisor dashboard: red/amber/green readiness by zone, exception list, review and resolve.
6. Pre-op inspection checklist and QA release sign-off per zone.
7. Tamper-evident record log (hash chain) and edit history.
8. Audit pack export: PDF + CSV for a site and date range.
9. Text translation of cleaner notes to English via Claude API, original kept (runs on sync).
10. UI in English + 2 demo languages (Tagalog, Bahasa Indonesia) for the cleaner screens.
11. Simple marketing landing page with a "Book a demo" form.
12. Seeded demo tenant (fictional plant) and a reset-demo action.

### Stretch (only after section 12 demo works)
- AI photo flag: "possible residue — please review" using Claude vision, on sync.
- Voice notes recorded and stored (transcription later).

### Out of scope (do NOT build now)
Native iOS/Android apps · face matching / biometrics · billing/subscriptions · SQF/BRCGS/WQA/Halal clause mapping · Bluetooth ATP device integration · SEA localisation/PDPA features · link to the training/certification business · public API · multi-region hosting.

## 4. Tech stack (decided — don't change without asking)

| Layer | Choice | Notes |
| --- | --- | --- |
| App + website | **Next.js (App Router) + TypeScript**, deployed on **Vercel** | Marketing pages at `/`, app under `/app` |
| UI | Tailwind CSS + shadcn/ui; lucide-react icons | Big touch targets (min 56px), high contrast |
| Offline | **PWA**: service worker (Serwist or next-pwa) + **IndexedDB via Dexie** | App shell cached; data + photos queued in an outbox |
| Backend | **Supabase** (Postgres, Auth, Storage, Row Level Security, Edge Functions if needed) | Project region **ap-southeast-2 (Sydney)** |
| AI | **Anthropic Claude API**, called only from server routes | Model name from env `ANTHROPIC_MODEL`; key in `ANTHROPIC_API_KEY` |
| PDF | `@react-pdf/renderer` (server-side) | CSV via plain streaming |
| i18n | `next-intl` | Message files `en`, `tl`, `id` |
| Tests | Vitest (unit) + Playwright (e2e incl. offline mode) | |

Why a PWA and not a native app: fastest route to a demo, runs on any Android rugged phone or iPad via URL, one codebase with the website. A native wrapper can come later.

## 5. Users and roles

| Role | Device | Can do |
| --- | --- | --- |
| Cleaner | Shared phone/tablet | Sign in with name + 4-digit PIN on a registered device; do assigned tasks; add notes/photos/ATP |
| Supervisor | Tablet/laptop | Assign tasks, view dashboard, review/resolve exceptions, confirm translations, request re-clean |
| QA | Laptop/tablet | Pre-op inspection, release/hold zones, export audit packs |
| Site admin | Laptop | Manage zones, equipment, chemicals, SSOPs, users |
| Contractor admin | Laptop | See all sites their company services (read + assign), not other contractors' data |

Multi-tenancy: an **organisation** is either a `processor` or a `contractor`. Sites belong to a processor org. A contractor org is granted access to specific sites via `site_access`. **The site owner (processor) owns all site records.** Enforce with Supabase RLS on every table — no table without RLS.

## 6. Data model (Postgres)

Use UUID primary keys, `created_at`/`updated_at` timestamps (timestamptz), and `site_id` on every site-scoped table for RLS.

- `organisations` (id, name, type: processor|contractor)
- `sites` (id, org_id, name, address, timezone default 'Australia/Sydney')
- `site_access` (site_id, org_id, granted_by, granted_at)
- `profiles` (id = auth user id or null for PIN-only cleaners, display_name, preferred_language, pin_hash)
- `memberships` (profile_id, org_id, site_id nullable, role)
- `devices` (id, site_id, label, registered_by, registered_at, last_seen_at)
- `zones` (id, site_id, name, risk_level: high|medium|low, sort_order)
- `equipment` (id, zone_id, site_id, name, photo_url, teardown_notes)
- `chemicals` (id, site_id, name, type: alkaline|acid|chlorinated|sanitiser|other, default_dilution, sds_url)
- `ssops` (id, equipment_id, site_id, version, status: draft|active|retired, approved_by, approved_at)
- `ssop_steps` (id, ssop_id, step_no, step_type, title_en, instructions_en, icon, chemical_id, dilution, dwell_minutes, photo_required bool, atp_required bool, atp_pass_max int)
  - `step_type` enum: `prepare_isolate`, `dry_clean`, `pre_rinse`, `foam`, `dwell`, `scrub`, `rinse`, `inspect`, `sanitise`, `atp_check`, `reassemble`
- `shifts` (id, site_id, shift_date, starts_at, ends_at)
- `tasks` (id, shift_id, site_id, equipment_id, ssop_id (exact version), assigned_profile_id, status: pending|in_progress|completed|reclean_required|verified)
- `step_records` (id, task_id, ssop_step_id, site_id, profile_id, device_id, client_record_id (uuid from device, unique), device_started_at, device_completed_at, server_received_at, result: done|skipped|failed, note_original, note_language, note_en, note_en_source: ai|human, atp_value, timer_started_at, timer_ended_at, payload_hash, chain_hash, supersedes_id nullable)
- `photos` (id, step_record_id, site_id, storage_path, sha256, device_taken_at, server_received_at, ai_flag jsonb nullable, ai_flag_reviewed_by, ai_flag_review_result)
- `exceptions` (id, site_id, task_id, step_record_id nullable, type: missed_step|dwell_short|atp_fail|reclean|photo_flag|clock_skew|late_sync, severity: red|amber, status: open|resolved, resolution_note, resolved_by, resolved_at)
- `preop_inspections` (id, site_id, zone_id, shift_id, inspector_profile_id, result: pass|fail, items jsonb, completed_at)
- `releases` (id, site_id, zone_id, shift_id, qa_profile_id, decision: released|held, reason, decided_at)
- `audit_events` (id, site_id, actor_profile_id, entity, entity_id, action, data jsonb, created_at, prev_hash, hash) — **append-only**
- `demo_requests` (id, name, company, email, phone, message, created_at) — from the website form

### Record integrity rules
1. `audit_events` and `step_records` are **append-only**: revoke UPDATE/DELETE for app roles; corrections insert a new row with `supersedes_id` and an audit event.
2. Hash chain per site: `hash = sha256(prev_hash || canonical_json(event))`, computed **server-side** in a Postgres function/trigger on insert. Provide a `verify_chain(site_id, from, to)` function used by the audit pack.
3. Devices compute `payload_hash` client-side before queueing; server recomputes and rejects mismatches.
4. Store both device time and server receive time. If device clock differs from server by > 5 min at sync, raise a `clock_skew` amber exception (do not reject the data).
5. Photos: compute SHA-256 on device, store it, verify on upload.

## 7. Offline and sync design

- App shell, fonts, icons, translations and the current site's setup data (zones, equipment, SSOPs, chemicals, tonight's tasks) are cached on the device when online.
- All cleaner actions write to IndexedDB first, then go to an **outbox** (records + photo blobs) with `client_record_id` for idempotency.
- Sync runs when the browser reports online, on app focus, and every 30 s while online; exponential backoff on failure. Server endpoint upserts by `client_record_id` (safe to retry).
- Visible sync indicator on every cleaner screen: "All saved ✓" / "Saved on device — 7 items waiting to sync" / "Syncing…". Never lose data on refresh or app close.
- Photos are compressed on device (max 1600px long edge, JPEG ~0.7) before queueing.
- AI work (translation, photo flags) and server-side exception checks run **after** records arrive on the server. The UI must make clear that supervisor alerts appear as devices sync, not before.
- Conflict policy: records are append-only, so no merge conflicts; task status is derived server-side from step records.

## 8. Feature requirements and acceptance criteria

### F1 — Site setup (admin)
- CRUD for zones, equipment, chemicals, users (incl. setting cleaner PINs), devices.
- SSOP builder: add/reorder steps, choose step type (each type has a default icon), set chemical, dilution, dwell minutes, photo/ATP requirements. Save as draft; **Activate** creates a new immutable version (old version retired, history kept).
- Import SSOP steps from CSV (template downloadable).
- ✅ Admin can create a new equipment item with an 8-step SSOP and assign it as a task tonight in under 5 minutes.

### F2 — Cleaner sign-in on shared device
- Device registered to a site by an admin once (stores device token).
- Cleaner taps their name/photo tile, enters 4-digit PIN. Language picker (flag + native name) remembered per cleaner.
- First sign-in shows a short consent notice (photos and notes are recorded for food-safety records) in the cleaner's language; acceptance stored.
- ✅ Works offline after the device has synced once that day (PIN hashes cached for that site's cleaners).

### F3 — Guided clean (core screen)
- Task list: tonight's assigned equipment as large cards with photo, zone, status colour.
- Step screen: one step per screen, large icon, short instruction (in cleaner's language where translation exists, English fallback), chemical + dilution shown prominently, big "Done" button, "Can't do this step" option with reason picker.
- If `photo_required`: camera opens; can't complete without a photo.
- `foam`/`dwell` step: starts a countdown timer for `dwell_minutes`; timer survives app close (based on stored start time); vibration/sound at end. Completing the following rinse before the timer ends is allowed but raises `dwell_short`.
- If `atp_required`: numeric keypad entry of RLU; if > `atp_pass_max` show "Fail — re-clean" guidance and raise `atp_fail`.
- Optional note per step: typed text in any language (voice note = stretch).
- Completing the last step marks the task completed (pending server checks).
- ✅ A cleaner can complete a full 10-step SSOP **entirely offline**, close the browser, reopen, and see all progress intact; when back online everything syncs with no duplicates.

### F4 — Exceptions engine (server-side, on sync)
Create exceptions for: required step skipped/missing (`missed_step`, red); dwell shorter than required (`dwell_short`, amber, red if < 50%); ATP over limit (`atp_fail`, red); AI photo flag (`photo_flag`, amber, stretch); clock skew (`clock_skew`, amber); task not completed by shift end (`missed_step`, red).
- ✅ Each exception links to the exact step record and photo; supervisor sees it within 10 s of sync.

### F5 — Supervisor dashboard
- Zone board: each zone a tile coloured **green** (all tasks complete, no open exceptions), **amber** (in progress or amber exceptions), **red** (open red exceptions or overdue). Click → equipment list → step-by-step record with photos.
- Exception queue with filters; actions: resolve with note, request re-clean (creates a new task for the same equipment, status `reclean_required` on the old one).
- Translation review: show note original + AI English side by side; supervisor can confirm or correct (correction stored as `note_en_source = human`, original never overwritten).
- Live updates via Supabase Realtime.
- ✅ When the offline phone reconnects during the demo, the dashboard tile changes colour without page refresh.

### F6 — Pre-op inspection and QA release
- Per zone: checklist (configurable items, seeded defaults: no visible residue, no foreign objects/tools left, equipment reassembled and guards on, no pooled water, no condensation over product zones, sanitiser drained, ATP results within limits).
- Result pass/fail with photos for failures; fail can trigger re-clean tasks.
- QA **Release** or **Hold** per zone with reason; release blocked while red exceptions are open (QA can override with mandatory reason, logged).
- ✅ Release creates an audit event and shows on the dashboard as "Released 05:42 by J. Smith".

### F7 — Audit pack export
- Filter by site, date range, zones. Output **PDF** (human-readable) and **CSV** (all step records).
- PDF contents: cover (site, period, generated at/by), summary table per shift and zone (status, exceptions, release), detail per task (SSOP version, steps, who, device time vs server time, results, ATP values, photo thumbnails with SHA-256 prefix, notes original + English with "AI-translated" / "Supervisor-confirmed" label), exceptions and resolutions, pre-op results, release decisions, and a **chain verification result** ("Record integrity verified: 1,284 records, no breaks").
- No copyrighted standard text (SQF/BRCGS) in the pack.
- ✅ Generating a pack for the demo night produces a readable PDF under 15 s.

### F8 — Translation (AI)
- Server route `/api/ai/translate`: input note + detected/declared language, output English. Prompt instructs: faithful translation, keep chemical names, numbers and units exactly, no added content; return JSON.
- Runs automatically after sync for notes not in English. Failures retry and never block the record.
- Store result in `note_en` with `note_en_source = 'ai'`.
- ✅ A Tagalog note entered offline appears in English on the supervisor screen after sync, labelled "AI-translated".

### F9 — Marketing site
- `/` landing page: headline, problem, how it works (4 steps: Capture → Checks → Pre-op alerts → Audit pack), features, founder pilot offer, "Book a demo" form → `demo_requests` table + email notification (Resend or Supabase function; env-configurable).
- Content source: the ICA Sales Overview deck. Clean, professional, fast. No pricing on the site unless `SHOW_PRICING=true`.
- `/privacy` page placeholder text clearly marked for legal review.

### F10 — Demo tenant
- Seed script creates: processor org "Southern Cross Meats (Demo)", one site, 4 zones (Boning Room — high risk; Slicing & Packing (RTE) — high; Mincing — medium; Chillers — low), ~8 equipment items, chemicals (alkaline foam, chlorinated foam, acid descaler, quat sanitiser, peracetic acid), SSOPs, 4 cleaners (with names suited to a multilingual crew), 1 supervisor, 1 QA, 1 admin, tonight's shift with tasks.
- Admin action **Reset demo** restores seed state.
- ✅ `npm run seed` on a fresh Supabase project gives a working demo.

## 9. Example SSOP (seed data — illustrative, to be validated by our industry partner)

Equipment: **Conveyor belt — Boning Room Line 1**

| # | Type | Instruction (EN) | Chemical | Dwell | Photo | ATP |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | prepare_isolate | Stop, isolate and lock out the conveyor. Remove all product and packaging. Cover electrical boxes. | — | — | Yes (lock applied) | — |
| 2 | dry_clean | Scrape and remove all meat and fat scraps. Use a squeegee and scraper; no water yet. | — | — | — | — |
| 3 | pre_rinse | Rinse top to bottom with warm water at low pressure. | — | — | — | — |
| 4 | foam | Apply alkaline foam to all surfaces, bottom to top, including underside and frame. | Alkaline foam, per label | — | Yes (fully foamed) | — |
| 5 | dwell | Leave foam on. Do not let it dry. | — | 15 min | — | — |
| 6 | scrub | Scrub belt edges, rollers and hard-to-reach areas. | — | — | — | — |
| 7 | rinse | Rinse top to bottom until no foam remains. Don't spray onto clean areas. | — | — | — | — |
| 8 | inspect | Check with a torch: no residue, no fat film. If dirty, repeat from step 4. | — | — | Yes (underside) | — |
| 9 | sanitise | Apply sanitiser at the correct strength. Leave for contact time on label. | Quat sanitiser | 10 min | — | — |
| 10 | atp_check | Swab belt surface and enter ATP reading. | — | — | — | Yes (pass ≤ 150 RLU, demo value) |

All seeded temperatures, dilutions, dwell times and ATP limits are **demo placeholders** — show a small "Demo values — use your site's SSOP and chemical labels" note in the admin SSOP view.

## 10. UX rules

- Cleaner screens: one action per screen, icons + short text, min 56px buttons, 18px+ text, high contrast, works in portrait on a 6" phone, usable with gloves (no small toggles, no swipe-only actions).
- Colour is never the only signal (add icons/labels for red/amber/green).
- Every cleaner screen shows sync status and the cleaner's name.
- Supervisor/QA screens: tablet + desktop first; data-dense but readable.
- All times shown in site timezone.
- Accessibility: semantic HTML, labels, focus states.

## 11. Security and privacy

- RLS on every table; tests that a contractor user cannot read another contractor's or an unrelated site's data.
- AI keys and Supabase service key only on the server. Never ship secrets to the client.
- Photos in a private storage bucket; signed URLs with short expiry.
- Consent notice for cleaners (F2) and a privacy page placeholder (F9).
- Demo data must be fictional — no real worker names, plants or photos.
- Basic rate limiting on public endpoints (demo request form, AI routes).

## 12. Demo script (the MVP is done when this runs smoothly)

1. **Website** (laptop): open the landing page, show "how it works", submit a demo request.
2. **Admin** (laptop): show the Boning Room conveyor SSOP; tonight's tasks are assigned.
3. **Cleaner** (phone): sign in as a cleaner with PIN, choose Tagalog. Turn on **airplane mode**.
4. Complete the conveyor SSOP offline: photos, 15-min dwell timer (demo mode: `DEMO_FAST_TIMERS=true` shortens to 15 s), deliberately rinse early on one step, add a Tagalog note, enter an ATP value that fails.
5. Show "Saved on device — N items waiting to sync". Close and reopen the app; progress intact.
6. **Supervisor** (laptop): Boning Room tile is amber/in progress with nothing new yet.
7. Turn airplane mode **off** on the phone → syncs → supervisor tile turns **red** live; exceptions show `dwell_short` and `atp_fail`; the Tagalog note appears with "AI-translated" English.
8. Supervisor requests re-clean; cleaner re-does steps; ATP passes; tile turns **green**.
9. **QA**: complete pre-op checklist, **Release** the zone.
10. Export the **audit pack PDF**: show records, photos, exception and resolution, translation labels, release, and "Record integrity verified".

## 13. Build milestones (work in this order; finish acceptance criteria before moving on)

| # | Milestone | Done when |
| --- | --- | --- |
| M0 | Repo, Next.js + TS + Tailwind + shadcn, Supabase local dev, lint/format, CI (lint + typecheck + tests) | `npm run dev` works; CI green |
| M1 | Schema, RLS, hash-chain functions, seed script, auth (email for staff, PIN for cleaners) | Seed creates demo tenant; RLS tests pass; chain verify passes |
| M2 | Admin setup screens incl. SSOP builder + versioning + CSV import | F1 criteria met |
| M3 | Cleaner PWA: sign-in, task list, guided steps, photos, timers, ATP — online first | F2, F3 work online |
| M4 | Offline: service worker, Dexie outbox, sync endpoint, sync indicator | F3 offline criterion passes in Playwright with `context.setOffline(true)` |
| M5 | Exceptions engine + supervisor dashboard + realtime + re-clean | F4, F5 met |
| M6 | Pre-op inspection + QA release | F6 met |
| M7 | Audit pack PDF/CSV with chain verification | F7 met |
| M8 | Translation via Claude API + i18n (en, tl, id) for cleaner UI | F8 met |
| M9 | Marketing site + demo request form | F9 met |
| M10 | Deploy to Vercel + Supabase (Sydney), demo reset, run section 12 end-to-end, fix rough edges | Demo script passes on real phone |
| S1 | Stretch: AI photo flag; voice notes | Only after M10 |

## 14. Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only
ANTHROPIC_API_KEY=                # server only
ANTHROPIC_MODEL=                  # set to a current Claude model id
RESEND_API_KEY=                   # optional, demo-request emails
DEMO_REQUEST_NOTIFY_EMAIL=
DEMO_FAST_TIMERS=false
SHOW_PRICING=false
```

## 15. Open questions (do not block on these — use the defaults given)

1. Real SSOP example from our industry partner → replaces section 9 seed data.
2. Real pilot site languages → default demo uses Tagalog and Bahasa Indonesia.
3. Brand assets (logo, colours) → default: navy `0F243E` + teal `009193` from the deck.
4. Domain name for the website → use the Vercel default URL until provided.
