-- Allow direct forward fulfillment updates while preserving cancellation, returns, and audit rules.
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
 allowed:=case o.status when 'pending' then p_status in ('confirmed','processing','packed','shipped','out_for_delivery','delivered','cancelled') when 'confirmed' then p_status in ('processing','packed','shipped','out_for_delivery','delivered','cancelled') when 'processing' then p_status in ('packed','shipped','out_for_delivery','delivered','cancelled') when 'packed' then p_status in ('shipped','out_for_delivery','delivered','cancelled') when 'shipped' then p_status in ('out_for_delivery','delivered') when 'out_for_delivery' then p_status in ('delivered') when 'delivered' then p_status in ('returned') else false end;
 if allowed is not true then raise exception 'Invalid order transition';
 end if;
 if p_status in ('shipped','out_for_delivery','delivered') and (p_tracking !~ '[^[:space:]]' or p_courier !~ '[^[:space:]]') then raise exception 'Courier and tracking required';
 end if;
 if p_status in ('cancelled','returned') then for item in select variant_id,quantity from order_items where order_id=o.id order by variant_id loop update inventory set on_hand=on_hand+item.quantity,updated_at=now() where variant_id=item.variant_id;
 insert into inventory_movements(variant_id,delta,reason,actor_id,order_id) values(item.variant_id,item.quantity,p_reason,auth.uid(),o.id);
 end loop;
 end if;
 update orders set status=p_status,tracking_number=case when p_status in ('shipped','out_for_delivery','delivered') then p_tracking else tracking_number end,courier=case when p_status in ('shipped','out_for_delivery','delivered') then p_courier else courier end,updated_at=now() where id=o.id;
 insert into admin_audit_logs(actor_id,action,entity,entity_id,details) values(auth.uid(),'ORDER_TRANSITION','orders',o.id::text,jsonb_build_object('from',o.status,'to',p_status,'reason',p_reason));
end $$;

