begin;
alter table public.ingredients add column registered_on date;
-- Existing real timestamps only; unknown dates stay NULL.
update public.ingredients set registered_on=(created_at at time zone 'Asia/Tokyo')::date where created_at is not null;
alter table public.ingredients alter column registered_on set default ((now() at time zone 'Asia/Tokyo')::date);
grant update(registered_on) on public.ingredients to authenticated;
create or replace function public.add_pantry_items(p_household uuid,p_items jsonb,p_allow_duplicates boolean default false)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare duplicates jsonb; item jsonb; n integer;
begin
 if auth.uid() is null or not public.is_household_member(p_household) then
  raise exception 'この冷蔵庫を使う権限がありません。' using errcode='42501';
 end if;
 if jsonb_typeof(p_items) is distinct from 'array' then raise exception '食材を配列で指定してください。'; end if;
 if jsonb_array_length(p_items) not between 1 and 100 then raise exception '食材は1〜100件で指定してください。'; end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'name') is distinct from 'string'
   or char_length(btrim(item->>'name')) not between 1 and 100 or public.ingredient_name_key(item->>'name')=''
   or coalesce(item->>'category','その他') not in ('野菜・果物','肉・魚','卵・乳製品','主食','その他')
   or coalesce(item->>'quantity_level','normal') not in ('low','normal','high') then
   raise exception '食材名・カテゴリ・量を確認してください。';
  end if;
 end loop;
 for item in select value from jsonb_array_elements(p_items) loop
  if item ? 'registered_on' and item->>'registered_on' is not null then
   if (item->>'registered_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (item->>'registered_on')::date > (now() at time zone 'Asia/Tokyo')::date then raise exception '登録日を確認してください。'; end if;
  end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended(p_household::text,20261123));
 select coalesce(jsonb_agg(name order by name),'[]'::jsonb) into duplicates from (
  select distinct btrim(a.value->>'name') as name from jsonb_array_elements(p_items) a
  where exists(select 1 from public.ingredients i where i.household_id=p_household and public.ingredient_name_key(i.name)=public.ingredient_name_key(a.value->>'name'))
  or (select count(*) from jsonb_array_elements(p_items) b where public.ingredient_name_key(b.value->>'name')=public.ingredient_name_key(a.value->>'name'))>1
 ) d;
 if jsonb_array_length(duplicates)>0 and not coalesce(p_allow_duplicates,false) then
  return jsonb_build_object('status','duplicate','duplicates',duplicates);
 end if;
 insert into public.ingredients(household_id,name,category,quantity_level,registered_on)
 select p_household,btrim(value->>'name'),coalesce(value->>'category','その他'),coalesce(value->>'quantity_level','normal'),case when value ? 'registered_on' then (value->>'registered_on')::date else (now() at time zone 'Asia/Tokyo')::date end from jsonb_array_elements(p_items);
 get diagnostics n=row_count;
 return jsonb_build_object('status','saved','count',n);
end;
$$;

revoke all on function public.add_pantry_items(uuid,jsonb,boolean) from public,anon;
grant execute on function public.add_pantry_items(uuid,jsonb,boolean) to authenticated;
commit;
