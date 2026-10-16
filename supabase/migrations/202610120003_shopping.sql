create function public.save_shopping(p_items jsonb,p_wishlist jsonb) returns void language plpgsql security definer set search_path=public as $$ declare uid uuid:=auth.uid(); cid uuid; wid uuid; begin
 if uid is null or not exists(select 1 from profiles where id=uid and active) then raise exception 'Authentication required'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>50 or jsonb_typeof(p_wishlist) is distinct from 'array' or jsonb_array_length(p_wishlist)>100 then raise exception 'Invalid shopping data'; end if;
 perform pg_advisory_xact_lock(hashtextextended('shopping:'||uid::text,0));
 select id into cid from carts where user_id=uid; select id into wid from wishlists where user_id=uid;
 delete from cart_items where cart_id=cid;
 insert into cart_items(cart_id,variant_id,quantity) select cid,(x->>'variant_id')::uuid,(x->>'quantity')::int from jsonb_array_elements(p_items) x;
 delete from wishlist_items where wishlist_id=wid;
 insert into wishlist_items(wishlist_id,product_id) select wid,value::uuid from jsonb_array_elements_text(p_wishlist);
end $$;
revoke all on function public.save_shopping(jsonb,jsonb) from public,anon;
grant execute on function public.save_shopping(jsonb,jsonb) to authenticated;
create function public.order_timeline(p_order uuid) returns table(action text,details jsonb,created_at timestamptz) language sql stable security definer set search_path=public as $$ select l.action,l.details,l.created_at from admin_audit_logs l join orders o on o.id::text=l.entity_id where o.id=p_order and (can_manage('orders') or o.user_id=auth.uid()) order by l.created_at $$;
revoke all on function public.order_timeline(uuid) from public,anon;
grant execute on function public.order_timeline(uuid) to authenticated;
