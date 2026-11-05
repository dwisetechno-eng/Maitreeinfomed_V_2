-- Proforma invoicing support.
--
-- The original schema only stored the link between article requests and
-- proforma invoices. The UI needs a few descriptive/pricing columns plus write
-- access. Apply this in the Supabase SQL editor (or with `supabase db push`).
--
-- Everything here is additive, so it is safe to run on an existing project.

-- Article requests: what was requested and how much it costs -----------------
alter table public.article_requests
  add column if not exists article_title text,
  add column if not exists rate numeric(12, 2) not null default 0;

-- Proforma invoices: department, contact and tax breakdown ------------------
alter table public.proforma_invoices
  add column if not exists department_id uuid references public.departments (id) on delete set null,
  add column if not exists contact_id uuid references public.client_contacts (id) on delete set null,
  add column if not exists tax_rate numeric(5, 2) not null default 18,
  add column if not exists tax_amount numeric(12, 2) not null default 0;

-- The application writes with the publishable (anon) key until Supabase Auth
-- is wired up, so allow the anon role to read and write these tables. Tighten
-- or replace these policies once sign-in and role checks exist.
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'article_status_master',
    'proforma_status_master',
    'tax_status_master',
    'clients',
    'vendors',
    'departments',
    'client_contacts',
    'article_requests',
    'proforma_invoices',
    'tax_invoices'
  ]
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      target_table || '_anon_read_write',
      target_table
    );

    execute format(
      'create policy %I on public.%I for all to anon using (true) with check (true)',
      target_table || '_anon_read_write',
      target_table
    );
  end loop;
end
$$;
