# Maitree Infomed Medical Scientific Services

Next.js 16 (App Router, Turbopack) + Supabase app for scientific article requests, proforma invoices, tax invoices and payment receipts. Single app, no monorepo. No ESLint/Prettier config is wired into scripts; `npm run build` is the production/type check path.

## Commands

- `npm run dev` — dev server with Turbopack.
- `npm run build` — production build; also the main typecheck wired into scripts.
- `npx tsc --noEmit` — fast typecheck without building (useful on low-memory Windows hosts where `build` can OOM; Vercel does the real build).
- `npm test` / `npm run test:watch` — Vitest (`jsdom`, `src/**/*.test.ts(x)`, `@` alias via `vitest.config.ts`).
- `npm run deploy` / `deploy.bat` — build, `git add .`, commit, push `main`. Vercel deploys from `main`; pushing is the release step.

## Environment

`.env.local` must define `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (publishable/anon key, not service role). Without them `src/proxy.ts` redirects protected routes to `/login`. Routes are dynamic because auth reads cookies. Never commit `.env.local`; `SUPABASE_SERVICE_ROLE_KEY` is server-only and required only for admin user create/delete (`src/actions/users.ts`, `scripts/create-admin.mjs`).

## Architecture

- `src/proxy.ts` is the Next 16 replacement for `middleware.ts`; it refreshes the Supabase session cookie and gates protected prefixes. Do not add `middleware.ts`.
- `src/app/<route>/page.tsx` are server components; `*-manager.tsx` client components do most Supabase reads/writes. Server actions live in `src/actions/`.
- Supabase clients: `src/utils/supabase/client.ts` (browser) and `src/utils/supabase/server.ts` (server actions/pages).
- `src/lib/invoice-links.ts` owns FK links between article requests, proformas, tax invoices and receipts plus aggregate totals/status recalculation. Reuse its helpers instead of rewriting invoice math.
- Article status is derived, not stored: PAID tax invoice → `COMPLETED`; any linked invoice → `PI_GENERATED`; otherwise keep `status_code`. Use `deriveArticleStatus`.
- Reversal order matters: remove a proforma from its tax invoice before editing/deleting the proforma; remove receipt allocations (or delete the receipt) before recalculating invoices.
- Invoice numbering: `src/lib/proforma-invoices.ts` and `src/lib/tax-invoices.ts` (`PI-YYYYMM-NNNN`, `TI-YYYYMM-NNNN`).

## Invoice documents

- Proforma/tax invoices download as Word (`.docx`) via shared renderer `src/lib/invoice-docx.ts` and model `src/lib/invoice-documents.ts` (blue proforma, green tax theme).
- Brand mark: `src/components/brand/brand-mark.tsx` (SVG in UI/icon). Word letterhead embeds generated PNG in `src/lib/maitree-logo.ts`; do not add image assets, regenerate that file if the SVG changes.
- `src/actions/invoice-documents.ts` fetches data, renders, returns base64; managers trigger browser download.
- Seller/buyer/service defaults are hardcoded in `src/lib/invoice-documents.ts`; `clients.location`/`gstin` override buyer. Tax invoices use `tax_invoices.po_number`/`po_date`; optional JSON in `document_content` overrides attention/service/dates.
- Line items: one row per linked article request at SAC `998393`; an adjustment line reconciles line total to stored subtotal.

## Supabase schema

- Schema changes are additive SQL files in `supabase/migrations/`; there is no `supabase/config.toml`. Apply via Supabase SQL editor or `supabase db push`.
- RLS is enabled; policies matter. Masters writes are restricted by `can_manage_masters()` (admin/manager). `profiles` admin checks use `is_admin()` SECURITY DEFINER to avoid recursion.
- `supabase/diagnostics/auth-signup-diagnostics.sql` is a manual diagnostic, not a migration.

## Excel import/export

- ExcelJS runs server-side only; `next.config.ts` pins it in `serverExternalPackages` and raises server-action body limit to 8 MB.
- Import parsing, template download, and filtered export: `src/actions/import-articles.ts`; dialog: `src/components/article-requests/batch-import-dialog.tsx`.
- Header matching is case-insensitive/alias-based (`HEADER_ALIASES`); unknown vendors are auto-created; first sheet is imported.
- ExcelJS `writeBuffer()` is typed loosely: use `Buffer.from(buffer as ArrayBuffer)`.

## UI conventions

- Row/header actions use `src/components/ui/icon-button.tsx` (icon-only, tooltip label, disabled reason in tooltip).
- List screens deep-link via query params: article requests accept `status`, `client`, `department`, `billing`, `from`, `to`; proforma and tax invoices accept `status`. Dashboard KPI/pipeline links rely on these.
- `/masters` has no index page; masters are individual routes under `src/app/masters/*` and nav links in `src/components/layout/app-shell.tsx`.
- User management: `src/app/masters/users` + `src/components/masters/user-manager.tsx`, admin-only. Roles `admin`/`manager`/`user` live in `profiles.role` and mirror to `app_metadata.role`. Without `SUPABASE_SERVICE_ROLE_KEY`, admin user create/delete degrades to profile-only edits.
- Dashboard analytics silently re-fetches on window focus/visibility so reversals from other routes appear without manual refresh.

## Verification, testing, security

- Production: `https://sci-article-hub.vercel.app` (deploys on push to `main`). No CI checks; verify deployed UI manually.
- Tests: `npm test` runs Vitest unit tests next to code (`src/**/*.test.ts(x)`). Pure logic is covered; DB/UI are not unit-tested.
- Security: see `SECURITY.md`. Security headers in `next.config.ts`; RLS hardening in `supabase/migrations/20261108170000_security_hardening_rls.sql`. Never commit secrets.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
