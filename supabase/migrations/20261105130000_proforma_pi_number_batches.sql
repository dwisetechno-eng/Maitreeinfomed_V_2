-- Proforma invoice numbering/date + article request batch import.
--
-- `proforma_invoices.pi_number` is required by the application, but the live
-- table did not have `pi_date`. Batch imports also need a shared identifier so
-- the UI can offer "entire unbilled batch" proforma creation.
--
-- Everything is additive and safe to run on an existing project. Apply with
-- `supabase db push` or paste into the Supabase SQL editor.

-- Proforma invoices: invoice date separate from the document date -------------
alter table public.proforma_invoices
  add column if not exists pi_date date;

update public.proforma_invoices
set pi_date = coalesce(invoice_date, created_at::date, current_date)
where pi_date is null;

alter table public.proforma_invoices
  alter column pi_date set default current_date;

alter table public.proforma_invoices
  alter column pi_date set not null;

-- Number lookups use the "PI-YYYYMM-" prefix, and the unique index makes the
-- generator's `23505` retry effective under concurrent creation.
create unique index if not exists proforma_invoices_pi_number_unique_idx
  on public.proforma_invoices (pi_number);

-- Article requests: one shared batch per Excel import ------------------------
alter table public.article_requests
  add column if not exists batch_id uuid,
  add column if not exists batch_tag text;

create index if not exists article_requests_batch_id_idx
  on public.article_requests (batch_id);

-- The application writes with the publishable (anon) key until Supabase Auth is
-- wired up. Tighten or replace these policies once sign-in and role checks exist.
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'article_requests',
    'proforma_invoices'
  ]
  loop
    execute format(
      'alter table public.%I enable row level security',
      target_table
    );

    execute format(
      'drop policy if exists %I on public.%I',
      target_table || '_anon_read_write',
      target_table
    );

    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (true) with check (true)',
      target_table || '_anon_read_write',
      target_table
    );
  end loop;
end
$$;
