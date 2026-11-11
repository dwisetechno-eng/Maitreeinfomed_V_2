-- Seed client contacts for USV Ltd.
--
-- Structure used:
--   clients          -> one row: "USV Ltd"
--   departments      -> one row per branch listed below, linked to USV Ltd
--   client_contacts  -> every person, linked to USV Ltd + their department
--
-- Safe to re-run: existing client / department / contact rows are not
-- duplicated (matched case-insensitively on trimmed names).
--
-- Apply in the Supabase SQL editor (or: supabase db execute --file <this file>).

begin;

-- 1. Ensure the client exists ------------------------------------------------
insert into public.clients (company_name)
select 'USV Ltd'
where not exists (
  select 1
  from public.clients
  where lower(trim(company_name)) = lower('USV Ltd')
);

-- 2. Departments under USV Ltd ----------------------------------------------
with target_client as (
  select id
  from public.clients
  where lower(trim(company_name)) = lower('USV Ltd')
  order by created_at nulls last
  limit 1
)
insert into public.departments (client_id, department_name)
select tc.id, v.department_name
from target_client tc
cross join (values
  ('Scientific Services'),
  ('Centra'),
  ('Concentra'),
  ('Crest'),
  ('Condor'),
  ('Conquer'),
  ('Corona'),
  ('Creat'),
  ('Gurdian')
) as v(department_name)
where not exists (
  select 1
  from public.departments d
  where d.client_id = tc.id
    and lower(trim(d.department_name)) = lower(trim(v.department_name))
);

-- 3. Contacts ---------------------------------------------------------------
-- "Raunak" is listed as "Sales Officer" in the source; there is no designation
-- column on client_contacts, so the role is noted here only.
with target_client as (
  select id
  from public.clients
  where lower(trim(company_name)) = lower('USV Ltd')
  order by created_at nulls last
  limit 1
),
contacts(contact_name, department_name) as (
  values
    -- Scientific Services
    ('Neelam Mourya',        'Scientific Services'),
    ('Dr. T. Ajanthaa',      'Scientific Services'),
    ('Dr. Swetha Jadhav',    'Scientific Services'),
    ('Dr Sona Warrier',      'Scientific Services'),
    ('Dr. Smriti',           'Scientific Services'),
    ('Dr. Varun Sharma',     'Scientific Services'),
    ('Dr Smriti Gadia',      'Scientific Services'),
    ('Dr. Snehal Bansode',   'Scientific Services'),
    ('Dr. Projesh Mukharjee','Scientific Services'),

    -- Centra
    ('Dhruv',                'Centra'),
    ('Swapnil Nate',         'Centra'),
    ('Ravindra Mane',        'Centra'),

    -- Concentra
    ('Dr Pallavi Vanmali',   'Concentra'),
    ('Arvind G',             'Concentra'),
    ('Shrawan Joshi',        'Concentra'),
    ('Vineetha Raja',        'Concentra'),
    ('Hasmukha Khan',        'Concentra'),
    ('Mr Mohd Arif',         'Concentra'),
    ('Ponraj M',             'Concentra'),
    ('Mr Sujith',            'Concentra'),
    ('Raees',                'Concentra'),
    ('Raunak',               'Concentra'),  -- Sales Officer
    ('Sharad Kadam',         'Concentra'),
    ('Mr. Ajit Mishra',      'Concentra'),
    ('Vikas Sharma',         'Concentra'),

    -- Crest
    ('Dr Pallavi Vanmali',   'Crest'),
    ('Mr Arul Robert',       'Crest'),
    ('Mr Bala',              'Crest'),
    ('Amey Kajari',          'Crest'),
    ('Animesh Sahoo',        'Crest'),
    ('Balmurugan',           'Crest'),
    ('Dr. Rohan Kesarkar',   'Crest'),
    ('Mr Nand Singh',        'Crest'),
    ('Mr. Ameya Kejari',     'Crest'),
    ('Mr. Pawan Kumar',      'Crest'),
    ('Mr. Yogesh Pandilwar', 'Crest'),
    ('Pratik Bhuwand',       'Crest'),
    ('Sumit Karkale',        'Crest'),

    -- Condor
    ('Mr. Animesh Sahoo',    'Condor'),
    ('Mr. Vikram',           'Condor'),
    ('Ravi Joshi',           'Condor'),
    ('Dr. Hareesh',          'Condor'),
    ('Dr. Mayuri',           'Condor'),

    -- Conquer
    ('Dr Akash Gupta',       'Conquer'),
    ('Dr. Meeta Keertane',   'Conquer'),

    -- Corona
    ('Dilpreet.s.bhatia',    'Corona'),
    ('Vinod.darade',         'Corona'),
    ('Avinash. Pratap',      'Corona'),

    -- Creat
    ('Shradha Nair',         'Creat'),

    -- Gurdian
    ('Dr. Amit Gupta',       'Gurdian'),
    ('Dr. Shrikant Ban',     'Gurdian'),
    ('Sagar Kuwar',          'Gurdian')
)
insert into public.client_contacts (client_id, department_id, contact_name)
select tc.id, d.id, c.contact_name
from contacts c
cross join target_client tc
join public.departments d
  on d.client_id = tc.id
 and lower(trim(d.department_name)) = lower(trim(c.department_name))
where not exists (
  select 1
  from public.client_contacts cc
  where cc.client_id = tc.id
    and cc.department_id = d.id
    and lower(trim(cc.contact_name)) = lower(trim(c.contact_name))
);

commit;
