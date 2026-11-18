-- Article request batch serial number.
--
-- Stores the position of an article inside the Excel batch it was imported
-- with. Bulk import fills blank cells with 1, 2, 3… in row order, and the
-- article request form lets users edit it. Additive and idempotent.
--
-- Apply with `supabase db push` or paste into the Supabase SQL editor.

alter table public.article_requests
  add column if not exists sr_no integer;

-- Keep serial numbers positive without blocking un-batched manual entries.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'article_requests_sr_no_positive'
      and conrelid = 'public.article_requests'::regclass
  ) then
    alter table public.article_requests
      add constraint article_requests_sr_no_positive
      check (sr_no is null or sr_no > 0);
  end if;
end
$$;

-- Backfill existing imported batches that have no serial numbers yet. The
-- order matches the import order (oldest first); batches that already carry
-- explicit numbers are left untouched.
with numbered as (
  select
    id,
    batch_id,
    row_number() over (partition by batch_id order by created_at, id) as position
  from public.article_requests
  where batch_id is not null
)
update public.article_requests as ar
set sr_no = numbered.position
from numbered
where ar.id = numbered.id
  and ar.sr_no is null
  and not exists (
    select 1
    from public.article_requests as existing
    where existing.batch_id = numbered.batch_id
      and existing.sr_no is not null
  );

-- Make the new column visible to PostgREST immediately.
notify pgrst, 'reload schema';
