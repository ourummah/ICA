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

## Next

- M1: schema, RLS, hash-chain functions, seed script, auth (email for staff, PIN for cleaners).

## Decisions

- **shadcn components added by hand.** The shadcn CLI couldn't reach its registry from the build environment, so components are copied in manually in shadcn's format. `components.json` is in place, so `npx shadcn add <component>` works on a normal machine.
- **System font stack instead of Google Fonts.** Avoids a network fetch at build time and keeps the offline app shell small.
- **Supabase CLI 3.x uses `supabase/config.jsonc`** (not `config.toml`). The CLI is a dev dependency, so use `npx supabase ...` or the `db:*` npm scripts.
- **`typecheck` runs `next typegen` first** so Next's generated route types (`LayoutProps`, `PageProps`) exist before `tsc`.
- Playwright pinned to 1.63.0.

## Known gaps

- None yet.
