-- 0005_status_realtime_audit.sql
-- Three things the dashboard needs before it tells the truth on its own:
-- order status that follows production, realtime so screens refresh themselves,
-- and an audit trail for the profile changes that happen through RLS, not Edge Functions.

-- ---------------------------------------------------------------------------
-- 1. Order status derived from production, never typed in by hand
-- ---------------------------------------------------------------------------
create or replace function derive_order_status() returns trigger
language plpgsql as $$
declare
  days_left int := case when new.delivery_date is null
                        then null
                        else new.delivery_date - current_date end;
  share numeric := case when new.order_quantity > 0
                        then new.produced_quantity::numeric / new.order_quantity
                        else 0 end;
begin
  -- production_status
  if new.order_quantity > 0 and new.produced_quantity >= new.order_quantity then
    new.production_status := 'completed';
  elsif days_left is not null and days_left <= 7 and share < 0.70 then
    -- a week out with under 70% made is what "at risk" means on this floor
    new.production_status := 'at_risk';
  elsif new.produced_quantity > 0 then
    new.production_status := 'in_production';
  else
    new.production_status := 'pending';
  end if;

  -- delivery_status
  if new.production_status = 'completed' then
    new.delivery_status := 'completed';
  elsif days_left is null then
    new.delivery_status := 'upcoming';
  elsif days_left < 0 then
    new.delivery_status := 'delayed';
  elsif days_left <= 14 then
    new.delivery_status := 'on_time';
  else
    new.delivery_status := 'upcoming';
  end if;

  return new;
end;
$$;

create trigger t_orders_derive_status
before insert or update of produced_quantity, order_quantity, delivery_date on orders
for each row execute function derive_order_status();

/*
 * The trigger fires on change. Nothing fires when a delivery date simply passes,
 * so an import calls this afterwards to sweep every open order forward in time.
 * Service role only — an employee has no reason to reclassify the order book.
 */
create or replace function refresh_order_statuses() returns void
language sql security definer set search_path = public as $$
  update orders set produced_quantity = produced_quantity
  where production_status <> 'completed';
$$;

revoke all on function refresh_order_statuses() from public, anon, authenticated;
grant execute on function refresh_order_statuses() to service_role;

-- Bring the seeded rows in line with the rule above.
update orders set produced_quantity = produced_quantity;

-- ---------------------------------------------------------------------------
-- 2. Realtime — the dashboards subscribe to these, so replication must be on
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table production_records;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table orders;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table production_lines;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Audit profile changes made through RLS
-- ---------------------------------------------------------------------------
-- Role and status changes are the only privileged writes the browser performs
-- directly, so they are logged in the database rather than in an Edge Function.
create or replace function audit_profile_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    insert into audit_logs (user_id, action, entity_type, entity_id, description, metadata)
    values (current_profile_id(), 'ROLE_CHANGE', 'profile', new.id,
            new.full_name || ' changed from ' || old.role || ' to ' || new.role,
            jsonb_build_object('from', old.role, 'to', new.role, 'email', new.email));
  end if;

  if new.status is distinct from old.status then
    insert into audit_logs (user_id, action, entity_type, entity_id, description, metadata)
    values (current_profile_id(), 'STATUS_CHANGE', 'profile', new.id,
            new.full_name || ' was ' || case when new.status = 'active' then 'activated' else 'deactivated' end,
            jsonb_build_object('from', old.status, 'to', new.status, 'email', new.email));
  end if;

  return new;
end;
$$;

create trigger t_profiles_audit
after update on profiles
for each row execute function audit_profile_change();

-- ---------------------------------------------------------------------------
-- 4. First admin
-- ---------------------------------------------------------------------------
-- There is deliberately no in-app way to mint the first admin: profiles_self_update
-- forbids changing your own role, so a compromised employee session cannot escalate.
-- Sign up once through the app, then run this in the Supabase SQL editor:
--
--   update profiles set role = 'admin' where email = 'you@example.com';
--
-- After that, admins promote colleagues from the Employees screen.
