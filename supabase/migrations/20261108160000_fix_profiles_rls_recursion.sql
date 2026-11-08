-- Fix infinite recursion in profiles RLS policies.
--
-- The previous policies checked admin status by subquerying `profiles` itself,
-- which made Postgres re-evaluate the same policies recursively. Replace that
-- with a SECURITY DEFINER helper so the admin check runs with elevated
-- privileges and never re-enters the policy evaluation.
--
-- Apply with `supabase db push` or paste into the Supabase SQL editor.

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- Replace the recursive policies.
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_admin" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
drop policy if exists "profiles_delete_admin" on public.profiles;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_select_admin"
  on public.profiles for select
  using (public.is_admin());

create policy "profiles_update_admin"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "profiles_delete_admin"
  on public.profiles for delete
  using (public.is_admin());
