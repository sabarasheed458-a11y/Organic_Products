-- Add only absent shopping containers for existing profiles. Preserve all items.
insert into public.carts(user_id)
select id from public.profiles
on conflict(user_id) do nothing;

insert into public.wishlists(user_id)
select id from public.profiles
on conflict(user_id) do nothing;

-- Recovery is restricted to the active caller, without a client-selected owner.
create function public.ensure_shopping_containers() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  perform 1 from public.profiles where id = uid and active for share;
  if not found then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('shopping:' || uid::text, 0));
  insert into public.carts(user_id) values(uid) on conflict(user_id) do nothing;
  insert into public.wishlists(user_id) values(uid) on conflict(user_id) do nothing;
end $$;

revoke all on function public.ensure_shopping_containers() from public, anon, authenticated;
grant execute on function public.ensure_shopping_containers() to authenticated;
