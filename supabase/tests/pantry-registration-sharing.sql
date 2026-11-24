begin;
do $$ declare h uuid; members uuid[]; begin
 select household_id into h from public.household_members group by household_id having count(*)>=2 limit 1;
 if h is null then raise exception 'Shared household required'; end if;
 select array_agg(user_id order by user_id) into members from public.household_members where household_id=h;
 perform set_config('pantry.test_h',h::text,true);perform set_config('pantry.test_a',members[1]::text,true);perform set_config('pantry.test_b',members[2]::text,true);
 if has_function_privilege('anon','public.add_pantry_items(uuid,jsonb,boolean)','execute') then raise exception 'Anonymous RPC access';end if;
end $$;
set local role authenticated;
do $$ declare h uuid:=current_setting('pantry.test_h')::uuid; label text:='__date_test_'||gen_random_uuid()::text; first_id uuid; second_id uuid; n integer; day date:=(now() at time zone 'Asia/Tokyo')::date; begin
 perform set_config('request.jwt.claim.sub',current_setting('pantry.test_a'),true);
 perform public.add_pantry_items(h,jsonb_build_array(jsonb_build_object('name',label)),false);
 select id into first_id from public.ingredients where household_id=h and name=label;
 if not exists(select 1 from public.ingredients where id=first_id and registered_on=day) then raise exception 'JST default failed';end if;
 perform public.add_pantry_items(h,jsonb_build_array(jsonb_build_object('name',label||'_unknown','registered_on',null)),false);
 select id into second_id from public.ingredients where household_id=h and name=label||'_unknown';
 if not exists(select 1 from public.ingredients where id=second_id and registered_on is null) then raise exception 'Unknown date fabricated';end if;
 perform set_config('request.jwt.claim.sub',current_setting('pantry.test_b'),true);
 update public.ingredients set registered_on=day-3 where id=first_id;
 update public.ingredients set quantity_level='low',name=label||'_edited' where id=first_id;
 if not exists(select 1 from public.ingredients where id=first_id and registered_on=day-3) then raise exception 'Date reset on edit';end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 update public.ingredients set registered_on=day where id=first_id;get diagnostics n=row_count;if n<>0 then raise exception 'Foreign date write';end if;
 delete from public.ingredients where id in(first_id,second_id);get diagnostics n=row_count;if n<>0 then raise exception 'Foreign bulk delete';end if;
 perform set_config('request.jwt.claim.sub',current_setting('pantry.test_b'),true);
 delete from public.ingredients where household_id=h and id in(first_id,second_id);get diagnostics n=row_count;if n<>2 then raise exception 'Partner bulk delete failed';end if;
end $$;
rollback;
select 'PASS: JST dates, unknown dates, partner editing, no date reset, RLS, bulk delete, rollback' as checks;
