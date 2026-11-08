-- Security hardening: tighten RLS now that Supabase Auth is in use.
--
-- Before this migration every transactional table allowed writes to the `anon`
-- role (i.e. anyone holding the publishable key). That is unsafe in production.
-- This migration:
--   * keeps reads available to anon + authenticated (so the UI keeps working),
--   * restricts writes to authenticated users only,
--   * restricts masters writes to admin/manager roles.
--
-- Apply with `supabase db push` or paste into the Supabase SQL editor.

-- Helper: can the current user manage master data?
create or replace function public.can_manage_masters()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role in ('admin', 'manager')
  );
$$;

grant execute on function public.can_manage_masters() to anon, authenticated;

do $$
declare
  target_table text;
  all_tables text[] := array[
    'article_status_master',
    'proforma_status_master',
    'tax_status_master',
    'clients',
    'vendors',
    'departments',
    'client_contacts',
    'article_requests',
    'proforma_invoices',
    'tax_invoices',
    'payment_receipts',
    'payment_allocations'
  ];
  transactional_tables text[] := array[
    'article_requests',
    'proforma_invoices',
    'tax_invoices',
    'payment_receipts',
    'payment_allocations'
  ];
  master_tables text[] := array[
    'article_status_master',
    'proforma_status_master',
    'tax_status_master',
    'clients',
    'vendors',
    'departments',
    'client_contacts'
  ];
begin
  -- 1) Enable RLS + open reads on every table.
  foreach target_table in array all_tables
  loop
    execute format('alter table public.%I enable row level security', target_table);

    execute format('drop policy if exists %I on public.%I', target_table || '_anon_read_write', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || '_authenticated_write', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || '_read', target_table);

    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      target_table || '_read',
      target_table
    );
  end loop;

  -- 2) Transactional writes: any signed-in user.
  foreach target_table in array transactional_tables
  loop
    execute format('drop policy if exists %I on public.%I', target_table || '_write', target_table);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      target_table || '_write',
      target_table
    );
  end loop;

  -- 3) Masters writes: admin/manager only.
  foreach target_table in array master_tables
  loop
    execute format('drop policy if exists %I on public.%I', target_table || '_masters_write', target_table);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.can_manage_masters()) with check (public.can_manage_masters())',
      target_table || '_masters_write',
      target_table
    );
  end loop;
end
$$;
