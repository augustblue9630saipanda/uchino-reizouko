begin;
create function public.pantry_import_name_key(value text) returns text language sql immutable set search_path='' as $$
 select case k when 'たまご' then '卵' when '玉子' then '卵' when '人参' then 'にんじん' when 'たまねぎ' then '玉ねぎ' when '玉葱' then '玉ねぎ' when 'とうふ' then '豆腐' else k end
 from (select translate(public.ingredient_name_key(value),'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶ','ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖ') k) s;
$$;
revoke all on function public.pantry_import_name_key(text) from public,anon;
grant execute on function public.pantry_import_name_key(text) to authenticated;
alter table public.shopping_items add column pantry_registered_at timestamptz;
alter table public.shopping_items add column pantry_ingredient_id uuid references public.ingredients(id) on delete set null;

-- Only idempotency keys and counts are retained. No receipt text or images.
create table public.pantry_imports(
 household_id uuid not null references public.households(id) on delete cascade,
 batch_id uuid not null,receipt_key text,
 result jsonb not null,created_at timestamptz not null default now(),
 primary key(household_id,batch_id),unique(household_id,receipt_key),
 check(receipt_key is null or receipt_key ~ '^[a-f0-9]{64}$')
);
alter table public.pantry_imports enable row level security;
revoke all on public.pantry_imports from anon,authenticated;
grant select on public.pantry_imports to authenticated;
create policy "Members read import receipts" on public.pantry_imports for select to authenticated using(public.is_household_member(household_id));

create function public.commit_pantry_import(p_household uuid,p_batch uuid,p_entries jsonb,p_source text default 'shopping',p_receipt_key text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e jsonb; prior jsonb; conflicts jsonb:='[]'; s public.shopping_items%rowtype;
 sid uuid; target uuid; created uuid; item_name text; act text; matches integer;
 added integer:=0; updated integer:=0; purchased integer:=0; already integer:=0; result jsonb;
begin
 if auth.uid() is null or not public.is_household_member(p_household) then raise exception 'この世帯を使う権限がありません。' using errcode='42501';end if;
 if p_batch is null or p_source is null or p_source not in('shopping','receipt') or jsonb_typeof(p_entries) is distinct from 'array' then raise exception '登録内容を確認してください。';end if;
 if jsonb_array_length(p_entries) not between 1 and 100 then raise exception '一度に1〜100件を選択してください。';end if;
 if p_receipt_key is not null and (p_source<>'receipt' or p_receipt_key !~ '^[a-f0-9]{64}$') then raise exception '写真の識別情報を確認してください。';end if;
 -- Share the same household lock as manual additions, so duplicate checks stay fresh.
 perform pg_advisory_xact_lock(hashtextextended(p_household::text,20261123));
 select i.result into prior from public.pantry_imports i where i.household_id=p_household and (i.batch_id=p_batch or (p_receipt_key is not null and i.receipt_key=p_receipt_key)) limit 1;
 if prior is not null then return prior||jsonb_build_object('replayed',true);end if;
 if exists(select 1 from jsonb_array_elements(p_entries) x where nullif(x->>'shopping_id','') is not null group by x->>'shopping_id' having count(*)>1) then raise exception '同じ買い物項目が複数選ばれています。照合先を確認してください。';end if;
 if exists(select 1 from jsonb_array_elements(p_entries) x group by x->>'key' having count(*)>1) then raise exception '登録候補が重複しています。';end if;
 -- Validate the entire batch before applying any purchase or inventory writes.
 for e in select value from jsonb_array_elements(p_entries) loop
  act:=e->>'action';item_name:=btrim(e->>'name');sid:=nullif(e->>'shopping_id','')::uuid;
  if act is null or act not in('add','update','purchase_only') or coalesce(e->>'key','')='' then raise exception '候補の登録方法を確認してください。';end if;
  if sid is not null then
   select * into s from public.shopping_items where id=sid and household_id=p_household for update;
   if not found then raise exception '買い物項目が削除されたか共有先が変わりました。';end if;
   if p_source='shopping' and not s.purchased then raise exception '購入済みの商品だけ選択してください。';end if;
   if s.pantry_registered_at is not null and act<>'purchase_only' then continue;end if;
  elsif act='purchase_only' or p_source='shopping' then raise exception '買い物リストの照合先を確認してください。';end if;
  if act='purchase_only' then continue;end if;
  if coalesce(char_length(item_name),0) not between 1 and 100 or public.ingredient_name_key(item_name)='' or coalesce(e->>'category','') not in('野菜・果物','肉・魚','卵・乳製品','主食','その他') or coalesce(e->>'quantity_level','') not in('low','normal','high') then raise exception '食材名・カテゴリ・残量を確認してください。';end if;
  if e->>'registered_on' is not null and ((e->>'registered_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (e->>'registered_on')::date>(now() at time zone 'Asia/Tokyo')::date) then raise exception '登録日は今日以前にしてください。';end if;
  if act='update' then
   target:=nullif(e->>'target_id','')::uuid;
   if not exists(select 1 from public.ingredients where id=target and household_id=p_household and public.pantry_import_name_key(name)=public.pantry_import_name_key(item_name)) then
    conflicts:=conflicts||jsonb_build_array(jsonb_build_object('key',e->>'key','name',item_name));
   end if;
  elsif not coalesce((e->>'allow_duplicate')::boolean,false) then
   select count(*) into matches from public.ingredients where household_id=p_household and public.pantry_import_name_key(name)=public.pantry_import_name_key(item_name);
   if matches>0 or (select count(*) from jsonb_array_elements(p_entries) x where x->>'action'<>'purchase_only' and public.pantry_import_name_key(x->>'name')=public.pantry_import_name_key(item_name))>1 then
    conflicts:=conflicts||jsonb_build_array(jsonb_build_object('key',e->>'key','name',item_name));
   end if;
  end if;
 end loop;
 if jsonb_array_length(conflicts)>0 then return jsonb_build_object('status','review','conflicts',conflicts);end if;
 for e in select value from jsonb_array_elements(p_entries) loop
  act:=e->>'action';sid:=nullif(e->>'shopping_id','')::uuid;created:=null;
  if sid is not null then
   select * into s from public.shopping_items where id=sid and household_id=p_household;
   if s.pantry_registered_at is not null and act<>'purchase_only' then already:=already+1;continue;end if;
  end if;
  if act='add' then
   insert into public.ingredients(household_id,name,category,quantity_level,registered_on) values(p_household,btrim(e->>'name'),e->>'category',e->>'quantity_level',case when e ? 'registered_on' then (e->>'registered_on')::date else (now() at time zone 'Asia/Tokyo')::date end) returning id into created;added:=added+1;
  elsif act='update' then
   created:=(e->>'target_id')::uuid;
   update public.ingredients set quantity_level=e->>'quantity_level' where id=created and household_id=p_household;updated:=updated+1;
   -- Preserve the older stock's registration day and name/category.
  end if;
  if sid is not null then
   update public.shopping_items set purchased=true,pantry_registered_at=case when created is not null then now() else pantry_registered_at end,pantry_ingredient_id=case when created is not null then created else pantry_ingredient_id end where id=sid and household_id=p_household;purchased:=purchased+1;
  end if;
 end loop;
 result:=jsonb_build_object('status','saved','added',added,'updated',updated,'purchased',purchased,'already',already,'replayed',false);
 insert into public.pantry_imports(household_id,batch_id,receipt_key,result) values(p_household,p_batch,p_receipt_key,result);
 return result;
end;$$;
revoke all on function public.commit_pantry_import(uuid,uuid,jsonb,text,text) from public,anon;
grant execute on function public.commit_pantry_import(uuid,uuid,jsonb,text,text) to authenticated;
commit;
