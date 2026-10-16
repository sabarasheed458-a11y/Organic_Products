-- Preserve all historical order statuses and snapshots; add fulfillment stages.
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check check(status in ('pending','confirmed','processing','packed','shipped','out_for_delivery','delivered','cancelled','returned'));
create or replace function public.transition_order(p_order uuid,p_status text,p_tracking text default '',p_courier text default '',p_reason text default '') returns void language plpgsql security definer set search_path=public,pg_temp as $$ declare o orders%rowtype;
 item record;
 allowed boolean;
 begin
 if not can_manage('orders') then raise exception 'Forbidden';
 end if;
 if p_order is null or p_status is null or p_tracking is null or p_courier is null or p_reason is null or length(p_tracking)>120 or length(p_courier)>120 or p_reason !~ '[^[:space:]]' or length(trim(p_reason)) not between 3 and 500 then raise exception 'Provide a valid reason';
 end if;
 select * into o from orders where id=p_order for update;
 if not found then raise exception 'Order not found';
 end if;
 allowed:=case o.status when 'pending' then p_status in ('confirmed','cancelled') when 'confirmed' then p_status in ('processing','cancelled') when 'processing' then p_status in ('packed','cancelled') when 'packed' then p_status in ('shipped','cancelled') when 'shipped' then p_status='out_for_delivery' when 'out_for_delivery' then p_status='delivered' when 'delivered' then p_status='returned' else false end;
 if allowed is not true then raise exception 'Invalid order transition';
 end if;
 if p_status='shipped' and (p_tracking !~ '[^[:space:]]' or p_courier !~ '[^[:space:]]') then raise exception 'Courier and tracking required';
 end if;
 if p_status in ('cancelled','returned') then for item in select variant_id,quantity from order_items where order_id=o.id order by variant_id loop update inventory set on_hand=on_hand+item.quantity,updated_at=now() where variant_id=item.variant_id;
 insert into inventory_movements(variant_id,delta,reason,actor_id,order_id) values(item.variant_id,item.quantity,p_reason,auth.uid(),o.id);
 end loop;
 end if;
 update orders set status=p_status,tracking_number=case when p_status='shipped' then p_tracking else tracking_number end,courier=case when p_status='shipped' then p_courier else courier end,updated_at=now() where id=o.id;
 insert into admin_audit_logs(actor_id,action,entity,entity_id,details) values(auth.uid(),'ORDER_TRANSITION','orders',o.id::text,jsonb_build_object('from',o.status,'to',p_status,'reason',p_reason));
end $$;

-- Extend the existing review model for delivered guest orders. Legacy reviews
-- retain their user ownership and approval; no Auth users are created.
alter table public.reviews alter column user_id drop not null;
alter table public.reviews add column order_id uuid references public.orders;
alter table public.reviews add column admin_reply text not null default '' check(length(admin_reply)<=2000);
alter table public.reviews add constraint review_owner_kind check(user_id is not null or order_id is not null);
create unique index review_order_product on public.reviews(order_id,product_id) where order_id is not null;
create trigger audit_reviews after insert or update or delete on public.reviews for each row execute function public.audit_change();
-- Do not expose new private order linkage through public table access.
revoke select on public.reviews from anon,authenticated;
grant select(id,product_id,user_id,rating,content,approved,created_at,admin_reply) on public.reviews to anon,authenticated;

create function public.order_progress(p_order uuid,p_token text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders%rowtype; admin boolean:=can_manage('orders');
begin
 select * into o from orders where id=p_order;
 if not found or not coalesce((admin or (o.user_id=auth.uid() and staff_role() is not null) or
 (o.user_id is null and p_token ~ '^[0-9a-f]{64}$' and o.guest_access_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex'))),false)
 then return null; end if;
 return jsonb_build_object('status',o.status,'history',(select coalesce(jsonb_agg(jsonb_build_object('status',l.details->>'to','created_at',l.created_at)||case when admin then jsonb_build_object('actor_id',l.actor_id,'from',l.details->>'from','reason',l.details->>'reason') else '{}'::jsonb end order by l.created_at,l.id),'[]'::jsonb) from admin_audit_logs l where l.entity='orders' and l.entity_id=o.id::text and l.action='ORDER_TRANSITION'),
 'products',(select coalesce(jsonb_agg(row_to_json(p)),'[]'::jsonb) from (select distinct v.product_id,i.product_name from order_items i join product_variants v on v.id=i.variant_id where i.order_id=o.id) p),
 'feedback',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'product_id',r.product_id,'rating',r.rating,'content',r.content,'approved',r.approved,'admin_reply',r.admin_reply,'created_at',r.created_at)),'[]'::jsonb) from reviews r where r.order_id=o.id or (o.user_id is not null and r.user_id=o.user_id and r.product_id in(select v.product_id from order_items i join product_variants v on v.id=i.variant_id where i.order_id=o.id))));
end $$;
revoke all on function public.order_progress(uuid,text) from public;
grant execute on function public.order_progress(uuid,text) to anon,authenticated;

create function public.guest_order_by_reference(p_reference text,p_token text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare oid uuid;
begin
 if p_reference is null or length(p_reference)>40 or p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
 select id into oid from orders where reference=upper(btrim(p_reference)) and user_id is null and guest_access_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if not found then return null; end if;
 return guest_order(oid,p_token);
end $$;
revoke all on function public.guest_order_by_reference(text,text) from public;
grant execute on function public.guest_order_by_reference(text,text) to anon,authenticated;

create function public.submit_feedback(p_order uuid,p_product uuid,p_rating int,p_content text,p_token text default null) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders%rowtype; rid uuid;
begin
 select * into o from orders where id=p_order for share;
 if not found or not coalesce((o.user_id=auth.uid() and staff_role() is not null) or
 (o.user_id is null and p_token ~ '^[0-9a-f]{64}$' and o.guest_access_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')),false)
 then raise exception 'Order access required'; end if;
 if o.status<>'delivered' then raise exception 'Feedback is available after delivery'; end if;
 if p_rating is null or p_rating not between 1 and 5 or p_content is null or length(btrim(p_content)) not between 3 and 3000 then raise exception 'Provide a rating and feedback between 3 and 3000 characters'; end if;
 if not exists(select 1 from order_items i join product_variants v on v.id=i.variant_id where i.order_id=o.id and v.product_id=p_product) then raise exception 'This product does not belong to the order'; end if;
 if not consume_rate_limit('feedback:'||coalesce(o.user_id::text,o.guest_access_hash),10,3600) then raise exception 'Please try again later'; end if;
 if o.user_id is not null then
 insert into reviews(product_id,user_id,order_id,rating,content) values(p_product,o.user_id,o.id,p_rating,btrim(p_content))
 on conflict(product_id,user_id) do update set order_id=excluded.order_id,rating=excluded.rating,content=excluded.content,approved=false,admin_reply='' returning id into rid;
 else
 insert into reviews(product_id,user_id,order_id,rating,content) values(p_product,null,o.id,p_rating,btrim(p_content))
 on conflict(order_id,product_id) where order_id is not null do update set rating=excluded.rating,content=excluded.content,approved=false,admin_reply='' returning id into rid;
 end if;
 return rid;
end $$;
revoke all on function public.submit_feedback(uuid,uuid,int,text,text) from public;
grant execute on function public.submit_feedback(uuid,uuid,int,text,text) to anon,authenticated;

create function public.moderate_feedback(p_review uuid,p_approved boolean,p_reply text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare rid uuid;
begin
 if not can_manage('catalog') then raise exception 'Forbidden'; end if;
 if p_approved is null or p_reply is null or length(p_reply)>2000 then raise exception 'Invalid moderation input'; end if;
 update reviews set approved=p_approved,admin_reply=btrim(p_reply) where id=p_review returning id into rid;
 if not found then raise exception 'Feedback not found'; end if;
 insert into admin_audit_logs(actor_id,action,entity,entity_id,details) values(auth.uid(),'FEEDBACK_MODERATION','reviews',rid::text,jsonb_build_object('approved',p_approved));
 return rid;
end $$;
revoke all on function public.moderate_feedback(uuid,boolean,text) from public,anon;
grant execute on function public.moderate_feedback(uuid,boolean,text) to authenticated;

create function public.feedback_admin(p_page int default 1,p_approved boolean default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if not can_manage('catalog') then raise exception 'Forbidden'; end if;
 if p_page is null or p_page not between 1 and 10000 then raise exception 'Invalid page'; end if;
 return (select coalesce(jsonb_agg(row_to_json(r)),'[]'::jsonb) from (select v.id,v.product_id,p.name product_name,v.order_id,v.rating,v.content,v.approved,v.admin_reply,v.created_at from reviews v join products p on p.id=v.product_id where p_approved is null or v.approved=p_approved order by v.created_at desc,v.id limit 20 offset (p_page-1)*20) r);
end $$;
revoke all on function public.feedback_admin(int,boolean) from public,anon;
grant execute on function public.feedback_admin(int,boolean) to authenticated;

create or replace function public.order_timeline(p_order uuid) returns table(action text,details jsonb,created_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
 select l.action,case when can_manage('orders') then l.details||jsonb_build_object('actor_id',l.actor_id) else jsonb_strip_nulls(jsonb_build_object('to',l.details->'to','status',l.details->'status')) end,l.created_at
 from admin_audit_logs l join orders o on o.id::text=l.entity_id where o.id=p_order and (can_manage('orders') or (o.user_id=auth.uid() and staff_role() is not null)) order by l.created_at,l.id
$$;
