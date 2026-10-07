-- Geek POS v0.2.0 operational schema
-- Adds hall tables and payment methods used by the offline-first Windows app.

create table if not exists public.pos_dining_tables (
  id uuid primary key,
  business_id uuid not null references public.pos_businesses(id) on delete cascade,
  branch_id uuid references public.pos_branches(id) on delete set null,
  name text not null,
  area text,
  seats integer default 4,
  sort_order integer default 0,
  active integer default 1,
  created_at timestamptz,
  updated_at timestamptz,
  synced_at timestamptz not null default now()
);

create table if not exists public.pos_payment_methods (
  id uuid primary key,
  business_id uuid not null references public.pos_businesses(id) on delete cascade,
  branch_id uuid references public.pos_branches(id) on delete set null,
  name text not null,
  code text not null,
  active integer default 1,
  sort_order integer default 0,
  created_at timestamptz,
  updated_at timestamptz,
  synced_at timestamptz not null default now()
);

create unique index if not exists uq_pos_payment_methods_business_code
  on public.pos_payment_methods(business_id, code);

alter table public.pos_orders
  add column if not exists table_id uuid references public.pos_dining_tables(id) on delete set null;

create index if not exists idx_pos_orders_table_id on public.pos_orders(table_id);
create index if not exists idx_pos_dining_tables_business on public.pos_dining_tables(business_id,branch_id);
create index if not exists idx_pos_payment_methods_business on public.pos_payment_methods(business_id,branch_id);

alter table public.pos_dining_tables enable row level security;
alter table public.pos_payment_methods enable row level security;

drop policy if exists pos_dining_tables_business on public.pos_dining_tables;
create policy pos_dining_tables_business
on public.pos_dining_tables
for all to authenticated
using (
  business_id=public.current_pos_business_id()
  or public.current_pos_role()='administrator'
)
with check (
  business_id=public.current_pos_business_id()
  or public.current_pos_role()='administrator'
);

drop policy if exists pos_payment_methods_business on public.pos_payment_methods;
create policy pos_payment_methods_business
on public.pos_payment_methods
for all to authenticated
using (
  business_id=public.current_pos_business_id()
  or public.current_pos_role()='administrator'
)
with check (
  business_id=public.current_pos_business_id()
  or public.current_pos_role()='administrator'
);

notify pgrst, 'reload schema';
