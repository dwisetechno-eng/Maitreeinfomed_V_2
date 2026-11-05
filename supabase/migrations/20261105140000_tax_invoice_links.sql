-- Tax invoice ↔ proforma invoice linkage.
--
-- A tax invoice can consolidate one or more approved/open proforma invoices.
-- The tax invoice itself has no single proforma reference, so the link lives on
-- `proforma_invoices` as a nullable foreign key.
--
-- Everything here is additive and safe to run on an existing project. Apply with
-- `supabase db push` or paste into the Supabase SQL editor.

alter table public.proforma_invoices
  add column if not exists tax_invoice_id uuid references public.tax_invoices (id) on delete set null;

create index if not exists proforma_invoices_tax_invoice_id_idx
  on public.proforma_invoices (tax_invoice_id);
