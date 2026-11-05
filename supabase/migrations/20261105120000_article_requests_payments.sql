-- Article request contacts, tax invoice balances and payment allocations.
--
-- The base schema stores article requests against a client/department and
-- payment receipts as standalone cash entries. The transactional UI needs:
--   * article_requests.contact_id        — the client contact who requested
--   * tax_invoices.amount_paid           — running paid total per invoice
--   * payment_allocations                — receipt ↔ invoice reconciliation
--
-- Everything is additive and safe to run on an existing project. Apply with
-- `supabase db push` or paste into the Supabase SQL editor.

-- Article requests: remember the contact person ------------------------------
alter table public.article_requests
  add column if not exists contact_id uuid references public.client_contacts (id) on delete set null;

-- Tax invoices: running paid balance -----------------------------------------
alter table public.tax_invoices
  add column if not exists amount_paid numeric(12, 2) not null default 0;

-- Payment allocations: how much of each receipt settled each invoice --------
create table if not exists public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.payment_receipts (id) on delete cascade,
  tax_invoice_id uuid not null references public.tax_invoices (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (receipt_id, tax_invoice_id)
);

create index if not exists payment_allocations_receipt_id_idx
  on public.payment_allocations (receipt_id);

create index if not exists payment_allocations_tax_invoice_id_idx
  on public.payment_allocations (tax_invoice_id);

-- Keep entirely-paid invoices consistent for rows created before this migration.
update public.tax_invoices
set status_code = 'PAID'
where status_code is distinct from 'PAID'
  and amount_paid >= grand_total
  and grand_total > 0;

grant select, insert, update, delete on public.payment_allocations to anon, authenticated;

-- Write access -----------------------------------------------------------------
-- The application writes with the publishable (anon) key until Supabase Auth is
-- wired up. Tighten or replace these policies once sign-in and role checks exist.
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
    'tax_invoices',
    'payment_receipts',
    'payment_allocations'
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
