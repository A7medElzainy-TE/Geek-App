create extension if not exists pgcrypto;

create table if not exists public.pos_licenses (
  id uuid primary key default gen_random_uuid(),
  license_hash text not null unique,
  key_tail text,
  status text not null default 'unused' check (status in ('unused','active','revoked')),
  customer_name text,
  customer_phone text,
  notes text,
  machine_hash text,
  activation_token uuid,
  app_version text,
  activated_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pos_businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pos_branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.pos_businesses(id) on delete cascade,
  name text not null,
  code text,
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pos_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_id uuid references public.pos_businesses(id) on delete cascade,
  branch_id uuid references public.pos_branches(id) on delete set null,
  display_name text,
  role text not null check (role in ('administrator','admin','cashier')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pos_categories (
  id uuid primary key,
  business_id uuid not null references public.pos_businesses(id) on delete cascade,
  branch_id uuid references public.pos_branches(id) on delete set null,
  name text not null,
  sort_order integer default 0,
  active integer default 1,
  created_at timestamptz,
  updated_at timestamptz,
  synced_at timestamptz not null default now()
);
create table if not exists public.pos_products (
  id uuid primary key,
  business_id uuid not null references public.pos_businesses(id) on delete cascade,
  branch_id uuid references public.pos_branches(id) on delete set null,
  category_id uuid,
  sku text, barcode text, name text not null, price numeric default 0, cost numeric default 0,
  tax_rate numeric default 0, active integer default 1, kitchen_printer text,
  created_at timestamptz, updated_at timestamptz, synced_at timestamptz not null default now()
);
create table if not exists public.pos_customers (
  id uuid primary key,
  business_id uuid not null references public.pos_businesses(id) on delete cascade,
  branch_id uuid references public.pos_branches(id) on delete set null,
  name text not null, mobile text not null, notes text,
  created_at timestamptz, updated_at timestamptz, synced_at timestamptz not null default now()
);
create unique index if not exists uq_pos_customers_business_mobile on public.pos_customers(business_id,mobile);
create table if not exists public.pos_customer_addresses (
  id uuid primary key,
  business_id uuid not null references public.pos_businesses(id) on delete cascade,
  branch_id uuid references public.pos_branches(id) on delete set null,
  customer_id uuid not null references public.pos_customers(id) on delete cascade,
  label text, address text not null, area text, is_default integer default 0, notes text,
  created_at timestamptz, updated_at timestamptz, synced_at timestamptz not null default now()
);
create table if not exists public.pos_drivers (
  id uuid primary key,
  business_id uuid not null references public.pos_businesses(id) on delete cascade,
  branch_id uuid references public.pos_branches(id) on delete set null,
  name text not null, mobile text, active integer default 1,
  created_at timestamptz, updated_at timestamptz, synced_at timestamptz not null default now()
);
create table if not exists public.pos_shifts (
  id uuid primary key,
  business_id uuid not null references public.pos_businesses(id) on delete cascade,
  branch_id uuid references public.pos_branches(id) on delete set null,
  user_id text, opened_at timestamptz, opening_cash numeric default 0, closed_at timestamptz,
  closing_cash numeric, status text, notes text, created_at timestamptz, updated_at timestamptz,
  synced_at timestamptz not null default now()
);
create table if not exists public.pos_orders (
  id uuid primary key,
  business_id uuid not null references public.pos_businesses(id) on delete cascade,
  branch_id uuid references public.pos_branches(id) on delete set null,
  order_no integer, order_type text, customer_id uuid references public.pos_customers(id) on delete set null,
  address_id uuid references public.pos_customer_addresses(id) on delete set null,
  driver_id uuid references public.pos_drivers(id) on delete set null,
  shift_id uuid, user_id text, status text, subtotal numeric default 0, discount numeric default 0,
  delivery_fee numeric default 0, total numeric default 0, paid numeric default 0, payment_method text,
  notes text, kitchen_sent_at timestamptz, driver_loaded_at timestamptz, settled_at timestamptz,
  returned_at timestamptz, created_at timestamptz, updated_at timestamptz,
  synced_at timestamptz not null default now()
);
create table if not exists public.pos_order_items (
  id uuid primary key,
  business_id uuid not null references public.pos_businesses(id) on delete cascade,
  branch_id uuid references public.pos_branches(id) on delete set null,
  order_id uuid not null references public.pos_orders(id) on delete cascade,
  product_id uuid, product_name text, qty numeric, unit_price numeric, total numeric, notes text,
  created_at timestamptz, updated_at timestamptz, synced_at timestamptz not null default now()
);
create table if not exists public.pos_expenses (
  id uuid primary key,
  business_id uuid not null references public.pos_businesses(id) on delete cascade,
  branch_id uuid references public.pos_branches(id) on delete set null,
  shift_id uuid, title text, amount numeric, notes text, user_id text,
  created_at timestamptz, updated_at timestamptz, synced_at timestamptz not null default now()
);

create or replace function public.current_pos_business_id()
returns uuid language sql stable security definer set search_path=public as $$
  select business_id from public.pos_profiles where user_id = auth.uid() and active = true limit 1
$$;
create or replace function public.current_pos_role()
returns text language sql stable security definer set search_path=public as $$
  select role from public.pos_profiles where user_id = auth.uid() and active = true limit 1
$$;

create or replace function public.activate_license(p_license_key text, p_device_hash text, p_app_version text default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_hash text;
  v_row public.pos_licenses%rowtype;
begin
  v_hash := encode(digest(upper(trim(p_license_key)), 'sha256'), 'hex');
  select * into v_row from public.pos_licenses where license_hash=v_hash for update;
  if not found then
    return jsonb_build_object('success',false,'message','مفتاح التفعيل غير صحيح. تواصل مع الإدارة المالكة للتطبيق لشراء نسخة.');
  end if;
  if v_row.status='revoked' then
    return jsonb_build_object('success',false,'message','تم إيقاف هذا المفتاح. تواصل مع الإدارة المالكة للتطبيق.');
  end if;
  if v_row.status='active' and v_row.machine_hash is distinct from p_device_hash then
    return jsonb_build_object('success',false,'message','هذا المفتاح مستخدم بالفعل على جهاز آخر.');
  end if;
  if v_row.activation_token is null then v_row.activation_token := gen_random_uuid(); end if;
  update public.pos_licenses set
    status='active', machine_hash=p_device_hash, activation_token=v_row.activation_token,
    app_version=p_app_version, activated_at=coalesce(activated_at,now()), last_seen_at=now(), updated_at=now()
  where id=v_row.id;
  return jsonb_build_object('success',true,'message','تم التفعيل بنجاح','activation_token',v_row.activation_token,'activated_at',coalesce(v_row.activated_at,now()));
end $$;
revoke all on function public.activate_license(text,text,text) from public;
grant execute on function public.activate_license(text,text,text) to anon, authenticated;

alter table public.pos_licenses enable row level security;
alter table public.pos_businesses enable row level security;
alter table public.pos_branches enable row level security;
alter table public.pos_profiles enable row level security;
alter table public.pos_categories enable row level security;
alter table public.pos_products enable row level security;
alter table public.pos_customers enable row level security;
alter table public.pos_customer_addresses enable row level security;
alter table public.pos_drivers enable row level security;
alter table public.pos_shifts enable row level security;
alter table public.pos_orders enable row level security;
alter table public.pos_order_items enable row level security;
alter table public.pos_expenses enable row level security;

drop policy if exists profile_self_or_system on public.pos_profiles;
create policy profile_self_or_system on public.pos_profiles for select to authenticated using (user_id=auth.uid() or public.current_pos_role()='administrator');
drop policy if exists business_read on public.pos_businesses;
create policy business_read on public.pos_businesses for select to authenticated using (id=public.current_pos_business_id() or public.current_pos_role()='administrator');
drop policy if exists branch_business on public.pos_branches;
create policy branch_business on public.pos_branches for all to authenticated using (business_id=public.current_pos_business_id() or public.current_pos_role()='administrator') with check (business_id=public.current_pos_business_id() or public.current_pos_role()='administrator');

do $$
declare t text;
begin
  foreach t in array array['pos_categories','pos_products','pos_customers','pos_customer_addresses','pos_drivers','pos_shifts','pos_orders','pos_order_items','pos_expenses']
  loop
    execute format('drop policy if exists %I on public.%I', t||'_business', t);
    execute format('create policy %I on public.%I for all to authenticated using (business_id=public.current_pos_business_id() or public.current_pos_role()=''administrator'') with check (business_id=public.current_pos_business_id() or public.current_pos_role()=''administrator'')', t||'_business', t);
  end loop;
end $$;

drop policy if exists licenses_system_admin on public.pos_licenses;
create policy licenses_system_admin on public.pos_licenses for all to authenticated using (public.current_pos_role()='administrator') with check (public.current_pos_role()='administrator');

drop view if exists public.pos_customer_stats;
create view public.pos_customer_stats with (security_invoker=true) as
select c.id,c.business_id,c.branch_id,c.name,c.mobile,c.notes,
       a.address,a.area,
       count(o.id) as order_count,
       coalesce(sum(case when o.status='closed' then o.total else 0 end),0) as total_spent,
       max(o.created_at) as last_order
from public.pos_customers c
left join lateral (
  select address,area from public.pos_customer_addresses ca where ca.customer_id=c.id order by is_default desc,created_at desc limit 1
) a on true
left join public.pos_orders o on o.customer_id=c.id
group by c.id,a.address,a.area;

grant select on public.pos_customer_stats to authenticated;
