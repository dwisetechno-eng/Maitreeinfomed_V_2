# Security notes for Maitree Infomed Medical Scientific Services

## Authentication & authorization
- Supabase Auth (email/password) gates the workspace via `src/proxy.ts`.
- Roles: `admin`, `manager`, `user`, stored in `public.profiles.role` and mirrored in `auth.users.app_metadata.role`.
- User management (`/masters/users`) is admin-only, enforced in the server actions in `src/actions/users.ts` (role check against `profiles`) and in the UI.
- Masters writes are restricted to admin/manager via the `can_manage_masters()` RLS function.

## Secrets
- `.env.local` is gitignored. Never commit it.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only (used in server actions and `scripts/create-admin.mjs`). Never prefix it with `NEXT_PUBLIC_`.
- Rotate the service role key in Supabase if it is ever exposed.

## Row Level Security
- RLS is enabled on every table (see `supabase/migrations/`).
- `profiles` admin checks use the `is_admin()` SECURITY DEFINER function to avoid infinite recursion.
- Transactional writes require an authenticated session; reads are open to anon + authenticated.
- Review `supabase/migrations/20261108170000_security_hardening_rls.sql` before deploying.

## HTTP hardening
- Security headers (HSTS, X-Frame-Options, CSP, etc.) are set in `next.config.ts`.
- Server actions are CSRF-protected by Next.js.
- Excel import body limit is 8 MB (`next.config.ts`).

## Input handling
- Supabase client uses parameterized queries; no raw SQL string interpolation in app code.
- No `dangerouslySetInnerHTML` / `eval` in the codebase.
- Excel import header matching is alias-based; unknown vendors are auto-created (review for abuse).

## Recommendations before production
- Enable Supabase Auth email confirmation and password strength rules.
- Add rate limiting (e.g., Vercel/Upstash) on auth and server actions.
- Audit storage/RLS if file uploads are added later.
- Run `npm audit` and keep dependencies updated.
