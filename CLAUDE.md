# CLAUDE.md — Intelligent Cleaning Audit (ICA)

## What we're building
An offline-capable sanitation compliance app for food processing plants, plus a marketing website. The full specification is in **SPEC.md**. Read it fully before starting, and re-read the relevant section before each milestone.

## How to work
- Build in the milestone order in SPEC.md section 13. Finish a milestone's acceptance criteria before starting the next one.
- At the start of each milestone, write a short plan (files, schema changes, tests), then build it.
- After each milestone: run lint, typecheck and tests. Commit with a clear message. Update `PROGRESS.md` with what's done, what's next, and any decisions you made.
- If a requirement is unclear, choose the simplest option consistent with SPEC.md, record it under "Decisions" in `PROGRESS.md`, and carry on. Stop and ask only for things that are hard to undo (changing the tech stack, deleting data, changing the security model).
- Keep the end goal in view: the demo script in SPEC.md section 12 must run smoothly on a real phone.

## Non-negotiables
- **Row Level Security on every table.** Add a test for each new table proving that users can't read other sites' or other organisations' data.
- **Append-only records.** Never UPDATE or DELETE `step_records` or `audit_events`. Corrections are new rows that point to the record they supersede.
- **Hash chain.** Compute it server-side and verify it in tests.
- **Offline first for cleaner screens.** Write to IndexedDB first, then sync from the outbox. Never lose data on refresh, app close or lost signal.
- **AI never decides.** AI output is labelled, the original is always kept, and AI never passes a clean or releases a zone.
- **Secrets stay server-side.** Call the Claude API only from server routes.
- **Fictional demo data only.** No real people, plants or photos.
- **Don't copy text from food safety standards** (SQF, BRCGS, etc.) into the app or the PDFs.
- **Stay in scope.** Build nothing from the out-of-scope list in SPEC.md section 3.

## Stack
Next.js App Router + TypeScript, Tailwind + shadcn/ui, Dexie (IndexedDB), a PWA service worker (Serwist), Supabase (Postgres/Auth/Storage/Realtime, Sydney region), the Anthropic Claude API, @react-pdf/renderer, next-intl, Vitest and Playwright. Deploy to Vercel.

## Conventions
- TypeScript strict mode, no `any`. Validate inputs with Zod on every API route.
- Database changes go only through Supabase migrations in `supabase/migrations/`. Generate types into `src/lib/database.types.ts`.
- Folder layout: `src/app/(marketing)` for the website, `src/app/app/...` for the app, `src/lib` for shared code, `src/offline` for Dexie and sync code.
- Cleaner UI: minimum 56px touch targets, 18px+ text, icons plus short labels, and every string translated through next-intl (`en`, `tl`, `id`).
- Store times as timestamptz in UTC and display them in the site's timezone.

## Commands (keep this list current as you add scripts)
- `npm run dev` — start the local dev server
- `npm run lint` / `npm run typecheck` / `npm test` / `npm run e2e`
- `npm run format` / `npm run format:check` — Prettier
- `npm run db:types` — regenerate `src/lib/database.types.ts` from the local database
- `npm run seed` — reset and load the demo tenant (Southern Cross Meats (Demo)); local staff password `ica-demo-local`, cleaner PINs 1111–4444
- `npm run test:db` — database tests (RLS, hash chain, PINs, seed) against the local Supabase stack
- `node scripts/compile-anchor-contract.ts` — recompile `contracts/ICAAnchor.sol` into `src/lib/anchor/contract-artifact.ts`
- `node verifier/verify-ica.mjs <bundle.json> [--rpc <url>]` — standalone record verifier (docs/AUDIT_TRAIL.md)
- `npx supabase start` / `npx supabase db reset` (or `npm run db:start` / `npm run db:reset`) — local database (needs Docker)

## Definition of done for the MVP
SPEC.md section 12 runs end-to-end on the deployed Vercel URL with a real phone, including the airplane-mode part, and `PROGRESS.md` lists any known gaps.
