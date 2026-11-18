-- Proforma invoice department.
--
-- Stores the department a proforma invoice was raised for so the proforma list
-- can group invoices by client → department, and so tax invoices can derive a
-- department from the proformas linked to them.
--
-- The referenced master table is `public.departments`, keyed by its `id`
-- column (uuid). `article_requests.department_id` already points at the same
-- table, so the backfill below is a straight copy of that value.
--
-- `20261104170000_proforma_invoicing.sql` already declared this column, but on
-- projects where only part of that migration ran the column is still missing.
-- Everything below is additive and idempotent, so it is safe to re-run.
--
-- Apply with `supabase db push` or paste into the Supabase SQL editor.

-- 1. Column: plain uuid first, so a previously half-applied migration (column
--    present without the foreign key) is repaired instead of skipped.
alter table public.proforma_invoices
  add column if not exists department_id uuid;

-- 2. Foreign key to public.departments (id), added only when absent.
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any (c.conkey)
    where c.contype = 'f'
      and c.conrelid = 'public.proforma_invoices'::regclass
      and a.attname = 'department_id'
  ) then
    alter table public.proforma_invoices
      add constraint proforma_invoices_department_id_fkey
      foreign key (department_id) references public.departments (id)
      on delete set null;
  end if;
end
$$;

-- 3. Index for department filters and grouping.
create index if not exists proforma_invoices_department_idx
  on public.proforma_invoices (department_id);

-- 4. Backfill existing invoices from their linked article requests. Only
--    invoices whose linked requests all share exactly one department are
--    filled; anything mixed or missing a department is left null so nothing is
--    guessed.
update public.proforma_invoices as pi
set department_id = shared.department_id
from (
  select
    ar.proforma_invoice_id as proforma_id,
    (array_agg(ar.department_id))[1] as department_id
  from public.article_requests as ar
  where ar.proforma_invoice_id is not null
  group by ar.proforma_invoice_id
  having count(distinct ar.department_id) = 1
     and count(*) = count(ar.department_id)
) as shared
where pi.id = shared.proforma_id
  and pi.department_id is null;

-- 5. Make the new column visible to PostgREST immediately.
notify pgrst, 'reload schema';
