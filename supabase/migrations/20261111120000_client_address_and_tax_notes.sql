-- Structured client address for invoices + free-text notes on tax invoices.
--
-- The Word proforma / tax invoice letterhead currently falls back to
-- `clients.location`; the structured columns below take precedence when set.
-- Tax invoice notes are printed in the "Purchase Articles Of" block of the
-- Word document.
--
-- Safe to re-run: every statement is guarded with IF NOT EXISTS.

alter table public.clients
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists state text;

alter table public.tax_invoices
  add column if not exists notes text;

comment on column public.clients.address is
  'Street address printed in the "Billed To" block of invoice documents.';
comment on column public.clients.city is
  'City printed in the "Billed To" block of invoice documents.';
comment on column public.clients.state is
  'State printed in the "Billed To" block of invoice documents.';
comment on column public.tax_invoices.notes is
  'Notes / remark printed in the Purchase Articles block of the Word tax invoice.';
