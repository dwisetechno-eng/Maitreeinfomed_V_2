-- Write access for the masters modules.
--
-- The masters tables are readable with the publishable (anon) key but reject
-- INSERT/UPDATE/DELETE because no write policies exist yet. Apply this in the
-- Supabase SQL editor (or with `supabase db push`).
--
-- These policies allow any signed-in user to manage the masters. Tighten the
-- USING / WITH CHECK expressions to match your role model (for example:
--   auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
-- ) before using this in production.

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'article_status_master',
    'proforma_status_master',
    'tax_status_master',
    'clients',
    'vendors'
  ]
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      target_table || '_authenticated_write',
      target_table
    );

    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      target_table || '_authenticated_write',
      target_table
    );
  end loop;
end
$$;

-- Local development only -----------------------------------------------------
-- The app currently has no sign-in flow, so the browser uses the anon role.
-- To let it write to these tables while developing locally, uncomment the
-- block below and run it in a throwaway project. Never enable this in
-- production, and remove it before deploying.
--
-- do $$
-- declare
--   target_table text;
-- begin
--   foreach target_table in array array[
--     'article_status_master',
--     'proforma_status_master',
--     'tax_status_master',
--     'clients',
--     'vendors'
--   ]
--   loop
--     execute format(
--       'drop policy if exists %I on public.%I',
--       target_table || '_anon_dev_write',
--       target_table
--     );
--
--     execute format(
--       'create policy %I on public.%I for all to anon using (true) with check (true)',
--       target_table || '_anon_dev_write',
--       target_table
--     );
--   end loop;
-- end
-- $$;
