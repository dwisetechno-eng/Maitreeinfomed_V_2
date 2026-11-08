-- Purchase order details captured on tax invoices.
--
-- The buyer's purchase order number and date are printed on the tax invoice
-- template. They used to be hardcoded in `src/lib/invoice-documents.ts`; storing
-- them per invoice lets each document carry its own PO.
--
-- Everything here is additive and safe to run on an existing project. Apply with
-- `supabase db push` or paste into the Supabase SQL editor.

alter table public.tax_invoices
  add column if not exists po_number text;

alter table public.tax_invoices
  add column if not exists po_date date;
