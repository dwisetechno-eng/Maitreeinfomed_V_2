-- ---------------------------------------------------------------------------
-- Diagnose + repair: Supabase signup returns
--   500 "Database error saving new user"
--
-- Paste this whole file into Supabase Dashboard -> SQL Editor -> Run.
-- It prints what is attached to auth.users, then applies a safe fix
-- (making the new-user trigger SECURITY DEFINER so it can insert into
-- public.user_profiles even though that table has RLS enabled).
-- ---------------------------------------------------------------------------

select 'trigger' as kind, t.tgname as name, pg_get_triggerdef(t.oid) as detail
from pg_trigger t
where t.tgrelid = 'auth.users'::regclass
  and not t.tgisinternal

union all

select 'policy', p.polname, 'cmd=' || p.polcmd::text
from pg_policy p
where p.polrelid = 'public.user_profiles'::regclass

union all

select 'function', pr.proname, pg_get_functiondef(pr.oid)
from pg_proc pr
join pg_namespace n on n.oid = pr.pronamespace
where n.nspname = 'public'
  and pr.proname = 'handle_new_user'

union all

select
  'column',
  c.column_name,
  c.data_type
    || ' null=' || c.is_nullable
    || ' default=' || coalesce(c.column_default, '-')
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'user_profiles'

order by 1, 2;


-- Safe repair: trigger functions that write to another table must be
-- SECURITY DEFINER, otherwise RLS on public.user_profiles rejects the insert
-- and Supabase surfaces it as "Database error saving new user".
do $$
begin
  if exists (
    select 1
    from pg_proc pr
    join pg_namespace n on n.oid = pr.pronamespace
    where n.nspname = 'public'
      and pr.proname = 'handle_new_user'
  ) then
    execute 'alter function public.handle_new_user() security definer';
    raise notice 'handle_new_user() is now SECURITY DEFINER.';
  else
    raise notice 'No public.handle_new_user() found - send the output above.';
  end if;
end $$;
