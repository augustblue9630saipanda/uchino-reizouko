begin;
alter table public.ingredients add column quantity_level text not null default 'normal'
 check (quantity_level in ('low','normal','high'));
grant update(quantity_level) on public.ingredients to authenticated;

create function public.ingredient_name_key(value text) returns text
 language sql immutable set search_path='' as $$
 select lower(regexp_replace(normalize(coalesce(value,''),NFKC),'[[:space:]　]+','','g'));
$$;
revoke all on function public.ingredient_name_key(text) from public, anon;
grant execute on function public.ingredient_name_key(text) to authenticated;

-- New additions use one transaction for fresh duplicate detection and insertion.
-- Existing duplicates are untouched; an explicit override allows separate rows.
create function public.add_pantry_items(p_household uuid,p_items jsonb,p_allow_duplicates boolean default false)
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
 perform pg_advisory_xact_lock(hashtextextended(p_household::text,20261123));
 select coalesce(jsonb_agg(name order by name),'[]'::jsonb) into duplicates from (
  select distinct btrim(a.value->>'name') as name from jsonb_array_elements(p_items) a
  where exists(select 1 from public.ingredients i where i.household_id=p_household and public.ingredient_name_key(i.name)=public.ingredient_name_key(a.value->>'name'))
  or (select count(*) from jsonb_array_elements(p_items) b where public.ingredient_name_key(b.value->>'name')=public.ingredient_name_key(a.value->>'name'))>1
 ) d;
 if jsonb_array_length(duplicates)>0 and not coalesce(p_allow_duplicates,false) then
  return jsonb_build_object('status','duplicate','duplicates',duplicates);
 end if;
 insert into public.ingredients(household_id,name,category,quantity_level)
 select p_household,btrim(value->>'name'),coalesce(value->>'category','その他'),coalesce(value->>'quantity_level','normal') from jsonb_array_elements(p_items);
 get diagnostics n=row_count;
 return jsonb_build_object('status','saved','count',n);
end;
$$;
revoke all on function public.add_pantry_items(uuid,jsonb,boolean) from public, anon;
grant execute on function public.add_pantry_items(uuid,jsonb,boolean) to authenticated;
commit;
