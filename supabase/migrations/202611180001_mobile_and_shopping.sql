begin;

alter table public.ingredients add column if not exists category text;
drop policy if exists "Members edit ingredients" on public.ingredients;
create policy "Members edit ingredients" on public.ingredients
for update to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));
grant update (name, category) on public.ingredients to authenticated;

create table if not exists public.shopping_items (
 id uuid primary key default gen_random_uuid(),
 household_id uuid not null references public.households(id) on delete cascade,
 name text not null check (char_length(btrim(name)) between 1 and 100),
 quantity text not null default '' check (char_length(quantity) <= 40),
 unit text not null default '' check (char_length(unit) <= 20),
 purchased boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists shopping_items_household_created_idx on public.shopping_items(household_id, created_at desc);
alter table public.shopping_items enable row level security;
revoke all on public.shopping_items from anon;
grant select, insert, delete on public.shopping_items to authenticated;
grant update (name, quantity, unit, purchased) on public.shopping_items to authenticated;
drop policy if exists "Household members share shopping" on public.shopping_items;
create policy "Household members share shopping" on public.shopping_items
for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create or replace function public.shopping_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at=now(); return new; end;
$$;
drop trigger if exists shopping_touch on public.shopping_items;
create trigger shopping_touch before update on public.shopping_items
for each row execute function public.shopping_touch_updated_at();

do $$ begin
 if exists (select 1 from pg_publication where pubname='supabase_realtime')
 and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='shopping_items') then
  alter publication supabase_realtime add table public.shopping_items;
 end if;
end $$;

commit;
