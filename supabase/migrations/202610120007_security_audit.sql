-- Additive security audit corrections. Existing records and the six prior migrations are retained.
-- Deploy error-envelope-aware Server Actions first; then apply this migration once.
alter function public.checkout(jsonb,jsonb,text,text,uuid,boolean) rename to checkout_internal;
revoke all on function public.checkout_internal(jsonb,jsonb,text,text,uuid,boolean) from public,anon,authenticated;

-- Private ownership tables require an active profile even with a still-valid Auth JWT.
do $$ declare t text;
 begin foreach t in array array['profiles','addresses','carts','cart_items','wishlists','wishlist_items','orders','order_items','payments','coupon_redemptions'] loop execute format('create policy active_account on public.%I as restrictive for all to authenticated using(public.staff_role() is not null) with check(public.staff_role() is not null)',t);
 end loop;
 end $$;
alter policy reviews_public on public.reviews using(
 (approved and exists(select 1 from public.products p where p.id=product_id and p.status='published'))
 or (user_id=auth.uid() and public.staff_role() is not null) or public.can_manage('catalog'));
revoke insert,update,delete on public.cart_items,public.wishlist_items from anon,authenticated;
create policy protect_published_delete on public.products as restrictive for delete to authenticated using(status<>'published');

-- Audit/ledger attribution must not prevent deleting a user who has no financial history.
alter table public.inventory_movements drop constraint inventory_movements_actor_id_fkey;
alter table public.inventory_movements add constraint inventory_movements_actor_id_fkey foreign key(actor_id) references public.profiles(id) on delete set null;
alter table public.admin_audit_logs drop constraint admin_audit_logs_actor_id_fkey;
alter table public.admin_audit_logs add constraint admin_audit_logs_actor_id_fkey foreign key(actor_id) references public.profiles(id) on delete set null;
create or replace function public.audit_change() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.admin_audit_logs(actor_id,action,entity,entity_id,details)
 values((select id from public.profiles where id=auth.uid()),tg_op,tg_table_name,coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id',to_jsonb(new)->>'variant_id'),jsonb_build_object('operation',tg_op));
 if tg_op='DELETE' then return old;
 end if;
 return new;
end $$;
create function public.prevent_variant_reparent() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin if new.product_id is distinct from old.product_id then raise exception 'Variant product cannot be changed';
 end if;
 return new;
 end $$;
create trigger variant_parent_immutable before update on public.product_variants for each row execute function public.prevent_variant_reparent();

-- NOT VALID preserves existing data while enforcing valid new/updated rows.
alter table public.coupons add constraint coupon_targets_not_null check(array_position(product_ids,null) is null and array_position(category_ids,null) is null and array_position(customer_ids,null) is null) not valid;
alter table public.banners add constraint banner_dates_valid check(ends_at is null or ends_at>starts_at) not valid;
alter table public.payments add constraint cod_payment_one_per_order unique(order_id);
create function public.preserve_payment_identity() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin if row(new.order_id,new.provider,new.amount,new.provider_reference) is distinct from row(old.order_id,old.provider,old.amount,old.provider_reference) then raise exception 'Payment identity and amount are immutable';
 end if;
 return new;
 end $$;
create trigger payment_identity_immutable before update on public.payments for each row execute function public.preserve_payment_identity();

-- PostgREST owns the transaction. Error envelopes let rate hits commit while the
-- inner subtransaction rolls back any failed order/inventory writes.
create or replace function public.request_gate(p_action text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if p_action is null or p_action not in ('contact','checkout','coupon','auth') then raise exception 'Invalid action';
 end if;
 -- Caller-supplied headers are not a trusted visitor identity. Anonymous contact
 -- retains a bounded shared fallback; use trusted ingress limits/CAPTCHA for public traffic.
 return public.consume_rate_limit(p_action||':'||coalesce(auth.uid()::text,'anonymous'),case when p_action='contact' then 5 else 20 end,600);
end $$;
revoke all on function public.request_gate(text) from public,anon,authenticated;

create or replace function public.checkout_internal(p_items jsonb,p_address jsonb,p_coupon text,p_notes text,p_key uuid,p_quote boolean default false) returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid();
 s store_settings%rowtype;
 c coupons%rowtype;
 existing orders%rowtype;
 row_item record;
 v record;
 item_count int;
 subtotal bigint:=0;
 eligible bigint:=0;
 discount bigint:=0;
 shipping bigint;
 total bigint;
 qty_total int:=0;
 eligible_qty int:=0;
 oid uuid;
 ref text;
 fingerprint text;
 legacy_fingerprint text;
 snapshots jsonb:='[]';
begin
 if uid is null or not exists(select 1 from profiles where id=uid and active) then raise exception 'Authentication required';
 end if;

 if p_coupon is not null and length(p_coupon)>40 then raise exception 'Invalid coupon';
 end if;
 if p_quote is null then raise exception 'Invalid checkout mode';
 end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 or p_key is null then raise exception 'Invalid cart';
 end if;
 if length(coalesce(p_notes,''))>1000 then raise exception 'Notes too long';
 end if;
 if (jsonb_typeof(p_address) is distinct from 'object' or length(coalesce(p_address->>'full_name','')) not between 2 and 120 or length(coalesce(p_address->>'phone','')) not between 7 and 25 or length(coalesce(p_address->>'line1','')) not between 5 and 300 or length(coalesce(p_address->>'city','')) not between 2 and 120 or length(coalesce(p_address->>'postal_code',''))>20) then raise exception 'Invalid delivery address';
 end if;
 if jsonb_typeof(p_address->'full_name') is distinct from 'string' or jsonb_typeof(p_address->'phone') is distinct from 'string' or jsonb_typeof(p_address->'line1') is distinct from 'string' or jsonb_typeof(p_address->'city') is distinct from 'string' or (p_address->>'phone') !~ '^[+0-9 ()-]{7,25}$' then raise exception 'Invalid delivery address';
 end if;
 p_address:=jsonb_build_object('full_name',p_address->>'full_name','phone',p_address->>'phone','line1',p_address->>'line1','city',p_address->>'city','postal_code',coalesce(p_address->>'postal_code',''));
 if exists(select 1 from jsonb_array_elements(p_items) x where jsonb_typeof(x) is distinct from 'object' or jsonb_typeof(x->'quantity') is distinct from 'number' or (x->>'quantity') !~ '^[1-9][0-9]?$' or jsonb_typeof(x->'variant_id') is distinct from 'string') then raise exception 'Invalid cart';
 end if;

 select count(distinct (x->>'variant_id')::uuid) into item_count from jsonb_array_elements(p_items) x;
 if item_count<>jsonb_array_length(p_items) then raise exception 'Duplicate variants';
 end if;
 legacy_fingerprint:=md5(p_items::text||p_address::text||coalesce(p_coupon,'')||coalesce(p_notes,''));
 fingerprint:='v2:'||encode(sha256(convert_to(jsonb_build_object('items',p_items,'address',p_address,'coupon',coalesce(p_coupon,''),'notes',coalesce(p_notes,''))::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(uid::text||p_key::text,0));
 select * into existing from orders where user_id=uid and idempotency_key=p_key;
 if found and not p_quote then if existing.request_hash<>fingerprint and not (length(existing.request_hash)=32 and existing.request_hash=legacy_fingerprint and existing.address=p_address and existing.notes=coalesce(p_notes,'')) then raise exception 'Checkout key already used';
 end if;
 return jsonb_build_object('id',existing.id,'reference',existing.reference,'total',existing.total);
 end if;
 if not p_quote then perform pg_advisory_xact_lock(hashtextextended('shopping:'||uid::text,0));
 end if;
 select * into s from store_settings where id='store' for share;
 -- Stable global lock order: products, then variants, then inventory.
 perform p.id from products p where p.id in(select pv.product_id from product_variants pv where pv.id in(select (x->>'variant_id')::uuid from jsonb_array_elements(p_items) x)) order by p.id for update;
 perform pv.id from product_variants pv where pv.id in(select (x->>'variant_id')::uuid from jsonb_array_elements(p_items) x) order by pv.id for update;
 perform i.variant_id from inventory i where i.variant_id in(select (x->>'variant_id')::uuid from jsonb_array_elements(p_items) x) order by i.variant_id for update;
 if not s.cod_enabled then raise exception 'Cash on delivery is unavailable';
 end if;
 if nullif(trim(p_coupon),'') is not null then
  select * into c from coupons where code=upper(trim(p_coupon)) for update;
  if not found or not c.active or c.starts_at>now() or (c.ends_at is not null and c.ends_at<=now()) or (cardinality(c.customer_ids)>0 and not coalesce(uid=any(c.customer_ids),false)) then raise exception 'Coupon is unavailable';
 end if;
  if (c.usage_limit is not null and (select count(*) from coupon_redemptions where coupon_id=c.id)>=c.usage_limit) or (select count(*) from coupon_redemptions where coupon_id=c.id and user_id=uid)>=c.per_customer_limit then raise exception 'Coupon usage limit reached';
 end if;
 end if;
 for row_item in select (x->>'variant_id')::uuid vid,(x->>'quantity')::int qty from jsonb_array_elements(p_items) x order by (x->>'variant_id')::uuid loop
  if row_item.qty is null or row_item.qty not between 1 and 99 then raise exception 'Invalid quantity';
 end if;
  -- Lock catalog rows as well as stock so concurrent edits cannot alter a snapshot mid-order.
  select pv.id,pv.sku,pv.size,pv.color,p.id pid,p.category_id,p.name,coalesce(pv.price,p.sale_price,p.price) unit_price,i.on_hand-i.reserved available into v from product_variants pv join products p on p.id=pv.product_id join inventory i on i.variant_id=pv.id where pv.id=row_item.vid and pv.active and p.status='published' for update of i,pv,p;
  if not found or v.available<row_item.qty then raise exception 'An item is unavailable or has insufficient stock';
 end if;
  subtotal:=subtotal+v.unit_price*row_item.qty;
 qty_total:=qty_total+row_item.qty;
  if c.id is not null and (cardinality(c.product_ids)=0 or v.pid=any(c.product_ids)) and (cardinality(c.category_ids)=0 or v.category_id=any(c.category_ids)) then eligible:=eligible+v.unit_price*row_item.qty;
 eligible_qty:=eligible_qty+row_item.qty;
 end if;
  snapshots:=snapshots||jsonb_build_array(jsonb_build_object('variant_id',v.id,'product_name',v.name,'sku',v.sku,'size',v.size,'color',v.color,'unit_price',v.unit_price,'quantity',row_item.qty,'line_total',v.unit_price*row_item.qty));
 end loop;
 if c.id is not null then if subtotal<c.minimum or eligible_qty<c.min_quantity or eligible=0 then raise exception 'Coupon conditions are not met';
 end if;
 discount:=case when c.kind='fixed' then least(eligible,c.value) else eligible*c.value/100 end;
 end if;
 shipping:=case when subtotal-discount>=s.free_shipping_threshold then 0 else s.shipping_fee end;
 if jsonb_array_length(s.shipping_zones)>0 then select (z->>'fee')::bigint into shipping from jsonb_array_elements(s.shipping_zones) z where lower(z->>'city')=lower(p_address->>'city') limit 1;
 if shipping is null then raise exception 'Delivery is unavailable in this city';
 end if;
 if subtotal-discount>=s.free_shipping_threshold then shipping:=0;
 end if;
 end if;
 total:=subtotal-discount+shipping;
 if total>s.max_cod_total then raise exception 'Order exceeds cash on delivery limit';
 end if;
 if p_quote then return jsonb_build_object('subtotal',subtotal,'discount',discount,'shipping',shipping,'total',total);
 end if;
 insert into orders(user_id,idempotency_key,request_hash,subtotal,discount,shipping,total,address,notes) values(uid,p_key,fingerprint,subtotal,discount,shipping,total,p_address,coalesce(p_notes,'')) returning id,reference into oid,ref;
 insert into order_items(order_id,variant_id,product_name,sku,size,color,unit_price,quantity,line_total) select oid,x.variant_id,x.product_name,x.sku,x.size,x.color,x.unit_price,x.quantity,x.line_total from jsonb_to_recordset(snapshots) as x(variant_id uuid,product_name text,sku text,size text,color text,unit_price bigint,quantity int,line_total bigint);
 for row_item in select variant_id,quantity from order_items where order_id=oid order by variant_id loop update inventory set on_hand=on_hand-row_item.quantity,updated_at=now() where variant_id=row_item.variant_id;
 insert into inventory_movements(variant_id,delta,reason,actor_id,order_id) values(row_item.variant_id,-row_item.quantity,'Order placed',uid,oid);
 end loop;
 insert into payments(order_id,amount) values(oid,total);
 if c.id is not null then insert into coupon_redemptions(coupon_id,user_id,order_id) values(c.id,uid,oid);
 end if;
 delete from cart_items where cart_id in(select id from carts where user_id=uid);
 return jsonb_build_object('id',oid,'reference',ref,'subtotal',subtotal,'discount',discount,'shipping',shipping,'total',total);
end $$;

create function public.checkout(p_items jsonb,p_address jsonb,p_coupon text,p_notes text,p_key uuid,p_quote boolean default false) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or public.staff_role() is null then raise exception 'Authentication required';
 end if;
 if not public.request_gate(case when p_quote is true then 'coupon' else 'checkout' end) then return jsonb_build_object('error','Please try again later');
 end if;
 begin return public.checkout_internal(p_items,p_address,p_coupon,p_notes,p_key,p_quote);
 exception when raise_exception then return jsonb_build_object('error',sqlerrm);
 when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation or foreign_key_violation then return jsonb_build_object('error','Invalid checkout input');
 when deadlock_detected or serialization_failure then return jsonb_build_object('error','Stock changed during checkout. Please retry.');
 when others then return jsonb_build_object('error','Checkout could not be completed. Please try again.');
 end;
end $$;
revoke all on function public.checkout(jsonb,jsonb,text,text,uuid,boolean) from public,anon;
grant execute on function public.checkout(jsonb,jsonb,text,text,uuid,boolean) to authenticated;

alter function public.submit_inquiry(text,text,text) rename to submit_inquiry_internal;
revoke all on function public.submit_inquiry_internal(text,text,text) from public,anon,authenticated;
create or replace function public.submit_inquiry_internal(p_name text,p_email text,p_message text) returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if p_name is null or p_email is null or p_message is null or length(trim(p_name)) not between 2 and 120 or length(trim(p_message)) not between 10 and 3000 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_email)>254 then raise exception 'Invalid inquiry';
 end if;
 insert into public.contact_inquiries(name,email,message) values(trim(p_name),p_email,trim(p_message));
 end $$;
create function public.submit_inquiry(p_name text,p_email text,p_message text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if not public.request_gate('contact') then return jsonb_build_object('error','Please try again later');
 end if;
 begin perform public.submit_inquiry_internal(p_name,p_email,p_message);
return jsonb_build_object('ok',true);
 exception when raise_exception then return jsonb_build_object('error',sqlerrm);
 when others then return jsonb_build_object('error','Inquiry could not be submitted. Please try again.');
end;
end $$;
revoke all on function public.submit_inquiry(text,text,text) from public;
grant execute on function public.submit_inquiry(text,text,text) to anon,authenticated;

create or replace function public.order_timeline(p_order uuid) returns table(action text,details jsonb,created_at timestamptz) language sql stable security definer set search_path=public,pg_temp as $$
 select l.action,case when public.can_manage('orders') then l.details else jsonb_strip_nulls(jsonb_build_object('to',l.details->'to','status',l.details->'status')) end,l.created_at
 from public.admin_audit_logs l join public.orders o on o.id::text=l.entity_id
 where o.id=p_order and (public.can_manage('orders') or (o.user_id=auth.uid() and public.staff_role() is not null)) order by l.created_at $$;

create or replace function public.adjust_inventory(p_variant uuid,p_quantity int,p_mode text,p_reason text) returns int language plpgsql security definer set search_path=public as $$ declare old_qty int;
 new_qty int;
 begin if not can_manage('catalog') then raise exception 'Forbidden';
 end if;
 if p_variant is null or p_quantity is null or p_reason is null or p_reason !~ '[^[:space:]]' or length(trim(p_reason)) not between 3 and 500 or p_mode is null or p_mode not in ('set','add','subtract') or p_quantity<0 or p_quantity>1000000 then raise exception 'Invalid adjustment';
 end if;
 insert into inventory(variant_id) values(p_variant) on conflict do nothing;
 select on_hand into old_qty from inventory where variant_id=p_variant for update;
 new_qty:=case p_mode when 'set' then p_quantity when 'add' then old_qty+p_quantity else old_qty-p_quantity end;
 update inventory set on_hand=new_qty,updated_at=now() where variant_id=p_variant;
 insert into inventory_movements(variant_id,delta,reason,actor_id) values(p_variant,new_qty-old_qty,p_reason,auth.uid());
 return new_qty;
 end $$;
create or replace function public.transition_order(p_order uuid,p_status text,p_tracking text default '',p_courier text default '',p_reason text default '') returns void language plpgsql security definer set search_path=public as $$ declare o orders%rowtype;
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
 allowed:=case o.status when 'pending' then p_status in ('confirmed','cancelled') when 'confirmed' then p_status in ('processing','cancelled') when 'processing' then p_status in ('shipped','cancelled') when 'shipped' then p_status='delivered' when 'delivered' then p_status='returned' else false end;
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
create or replace function public.record_cod_payment(p_order uuid,p_status text,p_reason text) returns void language plpgsql security definer set search_path=public as $$ declare o orders%rowtype;
 begin if not can_manage('orders') then raise exception 'Forbidden';
 end if;
 if p_order is null or p_status is null or p_reason is null then raise exception 'Invalid payment transition';
 end if;
 select * into o from orders where id=p_order for update;
 if not found or p_reason !~ '[^[:space:]]' or length(trim(p_reason)) not between 3 and 500 or not ((p_status='paid' and o.status in ('delivered','returned') and o.payment_status='unpaid') or (p_status='refunded' and o.status='returned' and o.payment_status='paid')) then raise exception 'Invalid payment transition';
 end if;
 update orders set payment_status=p_status where id=p_order;
 update payments set status=p_status where order_id=p_order;
 insert into admin_audit_logs(actor_id,action,entity,entity_id,details) values(auth.uid(),'COD_RECONCILIATION','orders',p_order::text,jsonb_build_object('status',p_status,'reason',p_reason));
 end $$;
create or replace function public.set_staff(p_user uuid,p_role text,p_active boolean) returns void language plpgsql security definer set search_path=public as $$ declare previous_role text;
previous_active boolean;
 begin perform pg_advisory_xact_lock(hashtextextended('commerce:staff_roles',0));
 if p_user is null or p_role is null or p_active is null then raise exception 'Invalid staff input';
 end if;
 if staff_role() is distinct from 'owner' or p_user=auth.uid() then raise exception 'Owner permission required; own role cannot be changed';
 end if;
 if p_role not in ('customer','owner','manager','catalog_manager','order_manager') then raise exception 'Invalid role';
 end if;
 select role,active into previous_role,previous_active from public.profiles where id=p_user for update;
 update profiles set role=p_role,active=p_active where id=p_user;
 if not found then raise exception 'User not found';
 end if;
 insert into public.admin_audit_logs(actor_id,action,entity,entity_id,details) values(auth.uid(),'ROLE_CHANGE','profiles',p_user::text,jsonb_build_object('from_role',previous_role,'to_role',p_role,'from_active',previous_active,'to_active',p_active));
 end $$;
create or replace function public.bulk_product_status(p_ids uuid[],p_status text) returns int language plpgsql security definer set search_path=public as $$ declare n int;
 begin if not can_manage('catalog') then raise exception 'Forbidden';
 end if;
 if p_ids is null or p_status is null or array_position(p_ids,null) is not null or cardinality(p_ids) not between 1 and 100 or p_status not in ('draft','published','archived') then raise exception 'Invalid bulk update';
 end if;
 update products set status=p_status where id=any(p_ids);
 get diagnostics n=row_count;
 return n;
 end $$;
create or replace function public.save_shopping(p_items jsonb,p_wishlist jsonb) returns void language plpgsql security definer set search_path=public as $$ declare uid uuid:=auth.uid();
 cid uuid;
 wid uuid;
 begin
 if uid is null or not exists(select 1 from profiles where id=uid and active) then raise exception 'Authentication required';
 end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>50 or jsonb_typeof(p_wishlist) is distinct from 'array' or jsonb_array_length(p_wishlist)>100 then raise exception 'Invalid shopping data';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('shopping:'||uid::text,0));
 select id into cid from carts where user_id=uid;
 select id into wid from wishlists where user_id=uid;
 if cid is null or wid is null then raise exception 'Shopping account is unavailable';
 end if;
 if exists(select 1 from jsonb_array_elements(p_items) x where jsonb_typeof(x) is distinct from 'object' or jsonb_typeof(x->'quantity') is distinct from 'number' or (x->>'quantity') !~ '^[1-9][0-9]?$' or jsonb_typeof(x->'variant_id') is distinct from 'string') then raise exception 'Invalid shopping data';
 end if;
 if exists(select 1 from jsonb_array_elements(p_items) x where not exists(select 1 from public.product_variants v join public.products p on p.id=v.product_id where v.id=(x->>'variant_id')::uuid and v.active and p.status='published') and not exists(select 1 from public.cart_items ci where ci.cart_id=cid and ci.variant_id=(x->>'variant_id')::uuid)) then raise exception 'An item is unavailable';
 end if;
 if exists(select 1 from jsonb_array_elements_text(p_wishlist) x where not exists(select 1 from public.products p where p.id=x.value::uuid and p.status='published') and not exists(select 1 from public.wishlist_items wi where wi.wishlist_id=wid and wi.product_id=x.value::uuid)) then raise exception 'A wishlist item is unavailable';
 end if;
 delete from cart_items where cart_id=cid;
 insert into cart_items(cart_id,variant_id,quantity) select cid,(x->>'variant_id')::uuid,(x->>'quantity')::int from jsonb_array_elements(p_items) x;
 delete from wishlist_items where wishlist_id=wid;
 insert into wishlist_items(wishlist_id,product_id) select wid,value::uuid from jsonb_array_elements_text(p_wishlist);
end $$;


-- Retain the existing public-media model. Strengthen existing bucket settings, too.
update storage.buckets set file_size_limit=4194304,allowed_mime_types=array['image/jpeg','image/png','image/webp'] where id='product-images';
create function public.asset_in_use(p_name text) returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$ begin
 if not public.can_manage('catalog') then return true;
 end if;
 return exists(select 1 from public.product_images where url like '%/storage/v1/object/public/product-images/'||p_name)
 or exists(select 1 from public.categories where image_url like '%/storage/v1/object/public/product-images/'||p_name)
 or exists(select 1 from public.banners where image_url like '%/storage/v1/object/public/product-images/'||p_name)
 or exists(select 1 from public.store_settings where logo_url like '%/storage/v1/object/public/product-images/'||p_name);
end $$;
revoke all on function public.asset_in_use(text) from public,anon;
grant execute on function public.asset_in_use(text) to authenticated;
alter policy product_image_staff_insert on storage.objects with check(bucket_id='product-images' and public.can_manage('catalog') and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$' and exists(select 1 from public.products p where p.id=case when storage.objects.name ~ '^[0-9a-f-]{36}/' then split_part(storage.objects.name,'/',1)::uuid end));
alter policy product_image_staff_update on storage.objects using(bucket_id='product-images' and public.can_manage('catalog') and not public.asset_in_use(name)) with check(bucket_id='product-images' and public.can_manage('catalog') and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$');
alter policy product_image_staff_delete on storage.objects using(bucket_id='product-images' and public.can_manage('catalog') and not public.asset_in_use(name));

-- Public and temporary schema shadowing cannot supply a definer's relations.
revoke create on schema public from public,anon,authenticated;
do $$ declare signature text;
 begin foreach signature in array array[
 'public.staff_role()','public.can_manage(text)','public.new_profile()','public.audit_change()',
 'public.consume_rate_limit(text,integer,integer)','public.request_gate(text)',
 'public.adjust_inventory(uuid,integer,text,text)','public.checkout_internal(jsonb,jsonb,text,text,uuid,boolean)',
 'public.checkout(jsonb,jsonb,text,text,uuid,boolean)','public.submit_inquiry_internal(text,text,text)',
 'public.submit_inquiry(text,text,text)','public.transition_order(uuid,text,text,text,text)',
 'public.record_cod_payment(uuid,text,text)','public.set_staff(uuid,text,boolean)',
 'public.save_shopping(jsonb,jsonb)','public.order_timeline(uuid)','public.duplicate_product(uuid)',
 'public.bulk_product_status(uuid[],text)','public.asset_in_use(text)'] loop
 execute 'alter function '||signature||' set search_path = public, pg_temp';
end loop;
end $$;
revoke all on function public.prevent_variant_reparent(),public.preserve_payment_identity(),public.consume_rate_limit(text,integer,integer),public.checkout_internal(jsonb,jsonb,text,text,uuid,boolean),public.submit_inquiry_internal(text,text,text),public.request_gate(text) from public,anon,authenticated;
