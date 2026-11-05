-- Tax invoice "OVERDUE" status.
--
-- The tax invoice UI can flag an invoice as overdue. Because `status_code`
-- lives in the tax status master, the code must exist there for databases that
-- enforce the foreign key.
--
-- Safe to run on an existing project.

insert into public.tax_status_master (status_code, status_label, display_order, description)
values ('OVERDUE', 'Overdue', 4, 'Payment is past the agreed due date')
on conflict (status_code) do update
  set status_label = excluded.status_label,
      display_order = excluded.display_order,
      description = excluded.description;
