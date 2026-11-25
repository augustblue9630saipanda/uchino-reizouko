begin;
do $$ declare h uuid; u uuid[];begin
 select household_id into h from public.household_members group by household_id having count(*)>=2 limit 1;
 if h is null then raise exception 'Shared household required';end if;
 select array_agg(user_id order by user_id) into u from public.household_members where household_id=h;
 perform set_config('imports.test_h',h::text,true);perform set_config('imports.test_a',u[1]::text,true);perform set_config('imports.test_b',u[2]::text,true);
 if has_function_privilege('anon','public.commit_pantry_import(uuid,uuid,jsonb,text,text)','execute') then raise exception 'Anonymous import allowed';end if;
end $$;
set local role authenticated;
do $$ declare h uuid:=current_setting('imports.test_h')::uuid;label text:='__import_test_'||gen_random_uuid()::text;
 shop uuid;daily uuid;second_shop uuid;food uuid;other_food uuid;batch uuid:=gen_random_uuid();r jsonb;e jsonb;n integer;day date:=(now() at time zone 'Asia/Tokyo')::date;hash text:=encode(sha256(gen_random_uuid()::text::bytea),'hex');
begin
 perform set_config('request.jwt.claim.sub',current_setting('imports.test_a'),true);
 if public.pantry_import_name_key(' ﾀﾏﾈｷﾞ ')<>public.pantry_import_name_key('玉ねぎ') or public.pantry_import_name_key('たまご')<>public.pantry_import_name_key('卵') then raise exception 'Import alias mismatch';end if;
 insert into public.shopping_items(household_id,name,purchased) values(h,label,true) returning id into shop;
 insert into public.shopping_items(household_id,name,purchased) values(h,label||'_soap',false) returning id into daily;
 e:=jsonb_build_array(jsonb_build_object('key','a','action','add','name',label,'category','野菜・果物','quantity_level','high','registered_on',day-4,'shopping_id',shop));
 r:=public.commit_pantry_import(h,batch,e,'shopping',null);
 if r->>'added'<>'1' then raise exception 'Shopping import failed';end if;
 select pantry_ingredient_id into food from public.shopping_items where id=shop and pantry_registered_at is not null;
 if not exists(select 1 from public.ingredients where id=food and quantity_level='high' and registered_on=day-4) then raise exception 'Quantity/date mismatch';end if;
 if exists(select 1 from public.shopping_items where id=daily and pantry_registered_at is not null) then raise exception 'Daily item registered';end if;
 r:=public.commit_pantry_import(h,batch,e,'shopping',null);if r->>'replayed'<>'true' then raise exception 'Retry not idempotent';end if;
 perform set_config('request.jwt.claim.sub',current_setting('imports.test_b'),true);
 r:=public.commit_pantry_import(h,gen_random_uuid(),e,'shopping',null);if r->>'already'<>'1' or r->>'added'<>'0' then raise exception 'Partner duplicate import';end if;
 select count(*) into n from public.ingredients where household_id=h and name=label;if n<>1 then raise exception 'Double registration';end if;
 insert into public.shopping_items(household_id,name) values(h,label||'_receipt') returning id into second_shop;
 e:=jsonb_build_array(
  jsonb_build_object('key','b','action','update','name',label,'category','野菜・果物','quantity_level','normal','registered_on',day,'target_id',food,'shopping_id',second_shop),
  jsonb_build_object('key','c','action','purchase_only','name','洗剤','shopping_id',daily),
  jsonb_build_object('key','d','action','add','name',label||'_new','category','その他','quantity_level','low','registered_on',day));
 r:=public.commit_pantry_import(h,gen_random_uuid(),e,'receipt',hash);
 if r->>'added'<>'1' or r->>'updated'<>'1' or r->>'purchased'<>'2' then raise exception 'Receipt mixed batch failed';end if;
 if not exists(select 1 from public.ingredients where id=food and quantity_level='normal' and registered_on=day-4) then raise exception 'Old stock date reset';end if;
 if not exists(select 1 from public.shopping_items where id=daily and purchased and pantry_registered_at is null) then raise exception 'Daily purchase-only failed';end if;
 r:=public.commit_pantry_import(h,gen_random_uuid(),e,'receipt',hash);if r->>'replayed'<>'true' then raise exception 'Same photo duplicated';end if;
 e:=jsonb_build_array(jsonb_build_object('key','x','action','add','name',label,'category','野菜・果物','quantity_level','high','registered_on',day));
 r:=public.commit_pantry_import(h,gen_random_uuid(),e,'receipt',null);if r->>'status'<>'review' then raise exception 'Missing duplicate decision accepted';end if;
 e:=jsonb_set(e,'{0,allow_duplicate}','true');r:=public.commit_pantry_import(h,gen_random_uuid(),e,'receipt',null);if r->>'added'<>'1' then raise exception 'Explicit separate addition failed';end if;
 if not exists(select 1 from public.ingredients where household_id=h and name=label and registered_on=day) then raise exception 'Separate addition lost new date';end if;
 -- A late invalid row must not partially mark a purchase or add earlier foods.
 e:=jsonb_build_array(jsonb_build_object('key','y','action','add','name',label||'_atomic','category','その他','quantity_level','normal','registered_on',day),jsonb_build_object('key','z','action','add','name','invalid','category','bad','quantity_level','normal'));
 begin perform public.commit_pantry_import(h,gen_random_uuid(),e,'receipt',null);raise exception 'Invalid batch accepted';exception when raise_exception then if sqlerrm='Invalid batch accepted' then raise;end if;end;
 if exists(select 1 from public.ingredients where household_id=h and name=label||'_atomic') then raise exception 'Partial batch write';end if;
 begin update public.shopping_items set pantry_registered_at=null where id=shop;raise exception 'Direct registration flag edit allowed';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 begin perform public.commit_pantry_import(h,gen_random_uuid(),e,'receipt',null);raise exception 'Foreign import allowed';exception when insufficient_privilege then null;end;
 select count(*) into n from public.pantry_imports where household_id=h;if n<>0 then raise exception 'Foreign ledger readable';end if;
end $$;
rollback;
select 'PASS: shopping/receipt import, amount/date, explicit duplicates, partner sharing, retry/photo/source idempotency, purchase-only, atomicity, RLS, rollback' as import_checks;
