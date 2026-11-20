-- Run as the dashboard administrator. All test rows are rolled back.
begin;
do $$ declare h uuid; users uuid[]; begin
 select household_id into h from public.household_members group by household_id having count(*)>=2 limit 1;
 if h is null then raise exception 'A shared household with two members is required'; end if;
 select array_agg(user_id order by user_id) into users from public.household_members where household_id=h;
 perform set_config('feedback.test_household',h::text,true);
 perform set_config('feedback.test_author',users[1]::text,true);
 perform set_config('feedback.test_partner',users[2]::text,true);
 if (select public from storage.buckets where id='feedback-images') is distinct from false then raise exception 'Bucket must be private'; end if;
end $$;
set local role authenticated;
do $$ declare h uuid:=current_setting('feedback.test_household')::uuid; nid uuid:=gen_random_uuid(); author uuid:=current_setting('feedback.test_author')::uuid; partner uuid:=current_setting('feedback.test_partner')::uuid; outsider uuid:=gen_random_uuid(); image text; n integer; begin
 perform set_config('request.jwt.claim.sub',author::text,true);
 image:=h::text||'/'||nid::text||'/attachment.jpg';
 insert into public.feedback_notes(id,household_id,body,source_page,image_path) values(nid,h,'RLS verification - rolled back','home',image);
 if not exists(select 1 from public.feedback_notes where id=nid and author_id=author and status='未対応' and length(author_label)>0) then raise exception 'Author metadata missing'; end if;
 insert into storage.objects(bucket_id,name) values('feedback-images',image);
 perform set_config('request.jwt.claim.sub',partner::text,true);
 if not exists(select 1 from public.feedback_notes where id=nid) then raise exception 'Partner cannot read note'; end if;
 if not exists(select 1 from storage.objects where bucket_id='feedback-images' and name=image) then raise exception 'Partner cannot read image'; end if;
 update public.feedback_notes set status='検討中' where id=nid;
 get diagnostics n=row_count; if n<>1 then raise exception 'Partner cannot update status'; end if;
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 if exists(select 1 from public.feedback_notes where id=nid) then raise exception 'Other household can read note'; end if;
 if exists(select 1 from storage.objects where bucket_id='feedback-images' and name=image) then raise exception 'Other household can read image'; end if;
 update public.feedback_notes set status='対応済み' where id=nid;
 get diagnostics n=row_count; if n<>0 then raise exception 'Other household can edit'; end if;
 begin
  insert into public.feedback_notes(household_id,body,source_page) values(h,'Forbidden','home');
  raise exception 'Other household can post';
 exception when insufficient_privilege then null; end;
 begin
  insert into storage.objects(bucket_id,name) values('feedback-images',h::text||'/'||gen_random_uuid()::text||'/attachment.jpg');
  raise exception 'Other household can upload';
 exception when insufficient_privilege then null; end;
 if public.feedback_image_household('not-a-uuid') is not null then raise exception 'Malformed image path accepted'; end if;
 perform set_config('request.jwt.claim.sub',author::text,true);
 begin
  update public.feedback_notes set author_id=partner where id=nid;
  raise exception 'Author can be forged';
 exception when insufficient_privilege then null; end;
 update public.feedback_notes set image_path=null where id=nid;
 delete from public.feedback_notes where id=nid;
 get diagnostics n=row_count; if n<>1 then raise exception 'Member cannot delete note'; end if;
end $$;
rollback;
select 'PASS: private bucket, couple sharing, author integrity, other-household isolation, note update/delete, rollback' as feedback_rls;
