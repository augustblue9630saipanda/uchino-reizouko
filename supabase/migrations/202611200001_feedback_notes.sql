begin;
create table public.feedback_notes (
 id uuid primary key default gen_random_uuid(),
 household_id uuid not null references public.households(id) on delete cascade,
 author_id uuid not null default auth.uid() references auth.users(id),
 author_label text not null default '',
 body text not null check (char_length(btrim(body)) between 1 and 5000),
 source_page text not null check (source_page in ('home','fridge','dinner','shopping','feedback')),
 status text not null default '未対応' check (status in ('未対応','検討中','対応済み')),
 image_path text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint feedback_image_path check (image_path is null or image_path=household_id::text||'/'||id::text||'/attachment.jpg')
);
create index feedback_notes_household_created_idx on public.feedback_notes(household_id,created_at desc,id);
alter table public.feedback_notes enable row level security;
revoke all on public.feedback_notes from anon, authenticated;
grant select,delete on public.feedback_notes to authenticated;
grant insert(id,household_id,body,source_page,image_path) on public.feedback_notes to authenticated;
grant update(status,image_path) on public.feedback_notes to authenticated;
create policy "Members read feedback" on public.feedback_notes for select to authenticated
 using (public.is_household_member(household_id));
create policy "Members post own feedback" on public.feedback_notes for insert to authenticated
 with check (public.is_household_member(household_id) and author_id=auth.uid());
create policy "Members update feedback" on public.feedback_notes for update to authenticated
 using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "Members delete feedback" on public.feedback_notes for delete to authenticated
 using (public.is_household_member(household_id));

create function public.feedback_note_metadata() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' then
  new.author_id=auth.uid();
  select left(coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'),''),nullif(btrim(u.raw_user_meta_data->>'name'),''),split_part(u.email,'@',1),'家族'),80)
   into new.author_label from auth.users u where u.id=auth.uid();
  new.created_at=now(); new.status='未対応';
 end if;
 new.updated_at=now(); return new;
end;
$$;
revoke all on function public.feedback_note_metadata() from public;
create trigger feedback_note_metadata before insert or update on public.feedback_notes
 for each row execute function public.feedback_note_metadata();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values ('feedback-images','feedback-images',false,5242880,array['image/jpeg']);

-- Validate the complete key before casting. Malformed paths never reach a UUID cast.
create function public.feedback_image_household(object_name text) returns uuid
 language sql immutable set search_path='' as $$
 select case when object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/attachment[.]jpg$'
 then split_part(object_name,'/',1)::uuid else null end;
$$;
revoke all on function public.feedback_image_household(text) from public;
grant execute on function public.feedback_image_household(text) to authenticated;
create policy "Members read feedback images" on storage.objects for select to authenticated
 using (bucket_id='feedback-images' and public.is_household_member(public.feedback_image_household(name)));
create policy "Members upload feedback images" on storage.objects for insert to authenticated
 with check (bucket_id='feedback-images' and public.is_household_member(public.feedback_image_household(name)));
create policy "Members delete feedback images" on storage.objects for delete to authenticated
 using (bucket_id='feedback-images' and public.is_household_member(public.feedback_image_household(name)));
commit;
