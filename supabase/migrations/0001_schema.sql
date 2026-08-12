-- 0001_schema.sql - tables, indexes, triggers
create extension if not exists "pgcrypto";

create type user_role        as enum ('admin', 'employee');
create type user_status      as enum ('active', 'disabled');
create type line_status      as enum ('running', 'behind', 'changeover', 'idle');
create type prod_status      as enum ('pending', 'in_production', 'at_risk', 'completed');
create type delivery_status  as enum ('on_time', 'upcoming', 'delayed', 'completed');
create type processing_state as enum ('pending', 'scanning', 'imported', 'warnings', 'failed');

-- profiles: the ONLY source of truth for authorization
create table profiles (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  full_name    text not null,
  employee_id  text not null unique,
  email        text not null unique,
  role         user_role   not null default 'employee',
  status       user_status not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table production_lines (
  id          uuid primary key default gen_random_uuid(),
  line_number int  not null unique,
  line_name   text not null,
  department  text,
  status      line_status not null default 'idle',
  active      boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table orders (
  id                 uuid primary key default gen_random_uuid(),
  order_number       text not null unique,
  buyer              text not null,
  style_number       text,
  product_name       text,
  color              text,
  size               text,
  order_quantity     int  not null default 0,
  produced_quantity  int  not null default 0,
  remaining_quantity int  generated always as (greatest(order_quantity - produced_quantity, 0)) stored,
  target_quantity    int  not null default 0,
  delivery_date      date,
  production_status  prod_status     not null default 'pending',
  delivery_status    delivery_status not null default 'upcoming',
  production_line_id uuid references production_lines (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table excel_uploads (
  id                   uuid primary key default gen_random_uuid(),
  uploaded_by          uuid not null references profiles (id) on delete restrict,
  original_filename    text not null,
  compressed_filename  text not null,
  storage_path         text not null,
  original_file_size   bigint not null,
  compressed_file_size bigint not null,
  compression_type     text not null default 'deflate',
  file_hash            text not null,
  row_count            int not null default 0,
  column_count         int not null default 0,
  sheet_count          int not null default 0,
  valid_record_count   int not null default 0,
  warning_count        int not null default 0,
  error_count          int not null default 0,
  duplicate_count      int not null default 0,
  processing_status    processing_state not null default 'pending',
  processing_ms        int,
  upload_version       int not null default 1,
  parent_upload_id     uuid references excel_uploads (id) on delete set null,
  created_at           timestamptz not null default now(),
  completed_at         timestamptz
);

create table excel_versions (
  id                uuid primary key default gen_random_uuid(),
  upload_id         uuid not null references excel_uploads (id) on delete cascade,
  parent_upload_id  uuid references excel_uploads (id) on delete set null,
  version_number    int  not null,
  original_filename text not null,
  storage_path      text not null,
  file_hash         text not null,
  created_by        uuid not null references profiles (id) on delete restrict,
  created_at        timestamptz not null default now(),
  unique (upload_id, version_number)
);

create table production_records (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid references orders (id) on delete set null,
  production_line_id uuid not null references production_lines (id) on delete restrict,
  production_date    date not null,
  target_quantity    int  not null default 0,
  actual_quantity    int  not null default 0,
  efficiency         numeric(5,2),
  status             text,
  source_upload_id   uuid references excel_uploads (id) on delete set null,
  source_row_number  int,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (production_line_id, production_date, order_id)
);

create table excel_rows (
  id                uuid primary key default gen_random_uuid(),
  upload_id         uuid not null references excel_uploads (id) on delete cascade,
  row_number        int  not null,
  raw_data          jsonb not null,
  processing_status text not null default 'valid',
  error_message     text,
  warning_message   text,
  created_at        timestamptz not null default now()
);

create table import_errors (
  id            uuid primary key default gen_random_uuid(),
  upload_id     uuid not null references excel_uploads (id) on delete cascade,
  row_number    int,
  column_name   text,
  error_type    text not null,
  error_message text not null,
  created_at    timestamptz not null default now()
);

create table import_warnings (
  id              uuid primary key default gen_random_uuid(),
  upload_id       uuid not null references excel_uploads (id) on delete cascade,
  row_number      int,
  column_name     text,
  warning_message text not null,
  created_at      timestamptz not null default now()
);

create table audit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles (id) on delete set null,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  description text,
  metadata    jsonb,
  ip_address  inet,
  created_at  timestamptz not null default now()
);

-- indexes on every column the dashboard filters or joins on
create index on production_records (production_date desc);
create index on production_records (production_line_id, production_date desc);
create index on production_records (source_upload_id);
create index on orders (production_line_id);
create index on orders (delivery_date);
create index on orders (production_status);
create index on excel_uploads (uploaded_by, created_at desc);
create index on excel_uploads (file_hash);
create index on excel_rows (upload_id, row_number);
create index on audit_logs (created_at desc);
create index on audit_logs (user_id, created_at desc);

-- role helpers, security definer so policies can call them without recursion
create or replace function current_profile_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from profiles where auth_user_id = auth.uid();
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where auth_user_id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

-- touch updated_at
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger t_profiles_touch   before update on profiles   for each row execute function touch_updated_at();
create trigger t_lines_touch      before update on production_lines for each row execute function touch_updated_at();
create trigger t_orders_touch     before update on orders     for each row execute function touch_updated_at();
create trigger t_records_touch    before update on production_records for each row execute function touch_updated_at();

-- keep orders.produced_quantity in step with imported records
create or replace function sync_order_produced() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update orders o set produced_quantity = coalesce((
    select sum(actual_quantity) from production_records r where r.order_id = o.id
  ), 0)
  where o.id = coalesce(new.order_id, old.order_id);
  return null;
end;
$$;

create trigger t_records_sync_order
after insert or update or delete on production_records
for each row execute function sync_order_produced();

-- new auth user -> profile row (role always defaults to employee, never client-supplied)
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (auth_user_id, full_name, employee_id, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'employee_id', 'EMP-' || substr(new.id::text, 1, 6)),
    new.email
  );
  return new;
end;
$$;

create trigger t_auth_user_created
after insert on auth.users for each row execute function handle_new_user();
