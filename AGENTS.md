# Maitree Infomed Scientific Hub

Next.js 16 (App Router, Turbopack) + Supabase app for scientific article requests, proforma invoices, tax invoices and payment receipts. Single app, no monorepo, no test suite or lint config. `npm run build` runs the TypeScript check.

## Commands

- `npm run dev` — dev server with Turbopack.
- `npm run build` — production build; also the only typecheck wired into scripts.
- `npx tsc --noEmit` — fast typecheck without building.
- `npm run deploy` / `deploy.bat` — build, commit all changes, push `main`. Vercel deploys from `main`; pushing is the release step.

## Environment

`.env.local` must define `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (publishable/anon key, not service role). Without them `src/proxy.ts` redirects protected routes to `/login`. Routes are dynamic because auth reads cookies.

## Architecture

- `src/proxy.ts` is the Next 16 replacement for `middleware.ts`; it refreshes the Supabase session cookie and gates the workspace prefixes. Do not add `middleware.ts`.
- `src/app/<route>/page.tsx` are server components; the `*-manager.tsx` client components do the Supabase reads/writes. Server actions live in `src/actions/`.
- Supabase clients: `src/utils/supabase/client.ts` (browser) and `server.ts` (server actions/pages).
- `src/lib/invoice-links.ts` owns the foreign-key links between article requests, proformas, tax invoices and receipts plus the aggregate totals/status recalculation. Reuse its helpers instead of rewriting invoice math.
- Article status is derived from links, not stored: on a PAID tax invoice → `COMPLETED`, on any invoice → `PI_GENERATED`, otherwise keep `status_code`. Use `deriveArticleStatus`.
- Reversal order matters: remove a proforma from its tax invoice before editing/deleting the proforma; remove receipt allocations (or delete the receipt) to recalculate invoices.
- Invoice numbering lives in `src/lib/proforma-invoices.ts` and `src/lib/tax-invoices.ts` (`PI-YYYYMM-NNNN`, `TI-YYYYMM-NNNN`); use those helpers.

## Invoice documents

- Proforma invoices and tax invoices both download as Word (`.docx`) from the shared, coloured renderer in `src/lib/invoice-docx.ts` (`docx`), driven by the shared model in `src/lib/invoice-documents.ts`. No logo/image assets are embedded; keep the templates text-and-table only.
- `src/actions/invoice-documents.ts` fetches the invoice, client, linked articles and proformas, renders the file and returns base64; the managers trigger the browser download.
- Seller details, buyer USV address/GSTIN and service/PO defaults are hardcoded in `src/lib/invoice-documents.ts`; `clients.location`/`gstin` override the buyer values. Optional JSON in `document_content` overrides PO, attention, service text and dates.
- Line items are one row per linked article request at SAC `998393`; an adjustment line reconciles the line total to the stored subtotal.

## Supabase schema

- Schema changes are additive SQL files in `supabase/migrations/`; there is no `supabase/config.toml`, so apply them in the Supabase SQL editor or with `supabase db push`.
- Migrations enable RLS and grant `anon, authenticated` access; the app still writes with the publishable key. Keep policies in mind when adding tables.
- `supabase/diagnostics/auth-signup-diagnostics.sql` is a manual diagnostic, not a migration.

## Excel import/export

- ExcelJS runs server-side only; `next.config.ts` pins it in `serverExternalPackages` and raises the server-action body limit to 8 MB.
- Import parsing, the downloadable template and the filtered-list export are in `src/actions/import-articles.ts`; the import dialog is `src/components/article-requests/batch-import-dialog.tsx`.
- Header matching is case-insensitive and alias-based (`HEADER_ALIASES`); unknown vendors are auto-created. The template workbook's first sheet is the one imported.
- ExcelJS `writeBuffer()` is typed loosely: use `Buffer.from(buffer as ArrayBuffer)`.

## UI conventions

- Row/header actions use `src/components/ui/icon-button.tsx` (icon only, tooltip label, disabled reason in tooltip).
- List screens deep-link via query params: article requests accept `status`, `client`, `department`, `billing`, `from`, `to`; proforma and tax invoices accept `status`. Dashboard KPI/pipeline links rely on these.
- Dashboard analytics re-fetches silently on window focus / visibility change so reversals from another route appear without a manual refresh.

## Verification

- Production: `https://sci-article-hub.vercel.app` (deploys on push to `main`). No CI checks; verify the deployed UI manually.
- On low-memory Windows hosts `npm run build` can OOM; `npx tsc --noEmit` still works and Vercel performs the real build.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
