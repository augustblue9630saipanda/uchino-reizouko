begin;
-- Existing Supabase table-level grants would include newly added columns.
-- Keep normal shopping edits, but make registration flags server-managed.
revoke update,insert on public.shopping_items from authenticated;
grant update(name,quantity,unit,purchased) on public.shopping_items to authenticated;
grant insert(id,household_id,name,quantity,unit,purchased) on public.shopping_items to authenticated;
commit;
