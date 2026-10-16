-- Guest orders remain private. Registered ownership and financial snapshots are preserved.
alter table public.orders alter column user_id drop not null;
alter table public.orders add column guest_access_hash text;
alter table public.orders add constraint order_owner_kind check (
 (user_id is not null and guest_access_hash is null) or
 (user_id is null and guest_access_hash is not null and guest_access_hash ~ '^[0-9a-f]{64}$'));
create unique index guest_order_retry on public.orders(guest_access_hash,idempotency_key) where user_id is null;
alter table public.coupon_redemptions alter column user_id drop not null;
alter table public.coupon_redemptions add column guest_access_hash text;
alter table public.coupon_redemptions add constraint redemption_owner_kind check (
 (user_id is not null and guest_access_hash is null) or
 (user_id is null and guest_access_hash is not null and guest_access_hash ~ '^[0-9a-f]{64}$'));
create or replace function public.checkout_engine(p_items jsonb,p_address jsonb,p_coupon text,p_notes text,p_key uuid,p_quote boolean,p_guest_hash text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
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
 if (uid is null and (p_guest_hash is null or p_guest_hash !~ '^[0-9a-f]{64}$')) or (uid is not null and (p_guest_hash is not null or not exists(select 1 from profiles where id=uid and active))) then raise exception 'Authentication required';
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
 if uid is null and (p_address ? 'email') and (jsonb_typeof(p_address->'email') is distinct from 'string' or length(p_address->>'email')>254 or (nullif(p_address->>'email','') is not null and (p_address->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')) then raise exception 'Invalid email'; end if;
 p_address:=jsonb_build_object('full_name',p_address->>'full_name','phone',p_address->>'phone','line1',p_address->>'line1','city',p_address->>'city','postal_code',coalesce(p_address->>'postal_code','')) || case when uid is null and nullif(p_address->>'email','') is not null then jsonb_build_object('email',lower(p_address->>'email')) else '{}'::jsonb end;
 if exists(select 1 from jsonb_array_elements(p_items) x where jsonb_typeof(x) is distinct from 'object' or jsonb_typeof(x->'quantity') is distinct from 'number' or (x->>'quantity') !~ '^[1-9][0-9]?$' or jsonb_typeof(x->'variant_id') is distinct from 'string') then raise exception 'Invalid cart';
 end if;

 select count(distinct (x->>'variant_id')::uuid) into item_count from jsonb_array_elements(p_items) x;
 if item_count<>jsonb_array_length(p_items) then raise exception 'Duplicate variants';
 end if;
 legacy_fingerprint:=md5(p_items::text||p_address::text||coalesce(p_coupon,'')||coalesce(p_notes,''));
 fingerprint:='v2:'||encode(sha256(convert_to(jsonb_build_object('items',p_items,'address',p_address,'coupon',coalesce(p_coupon,''),'notes',coalesce(p_notes,''))::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(coalesce(uid::text,p_guest_hash)||p_key::text,0));
 select * into existing from orders where idempotency_key=p_key and ((uid is not null and user_id=uid) or (uid is null and user_id is null and guest_access_hash=p_guest_hash));
 if found and not p_quote then if existing.request_hash<>fingerprint and not (length(existing.request_hash)=32 and existing.request_hash=legacy_fingerprint and existing.address=p_address and existing.notes=coalesce(p_notes,'')) then raise exception 'Checkout key already used';
 end if;
 return jsonb_build_object('id',existing.id,'reference',existing.reference,'total',existing.total);
 end if;
 if not p_quote and uid is not null then perform pg_advisory_xact_lock(hashtextextended('shopping:'||uid::text,0));
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
  if (c.usage_limit is not null and (select count(*) from coupon_redemptions where coupon_id=c.id)>=c.usage_limit) or (select count(*) from coupon_redemptions where coupon_id=c.id and ((uid is not null and user_id=uid) or (uid is null and guest_access_hash=p_guest_hash)))>=c.per_customer_limit then raise exception 'Coupon usage limit reached';
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
 insert into orders(user_id,guest_access_hash,idempotency_key,request_hash,subtotal,discount,shipping,total,address,notes) values(uid,p_guest_hash,p_key,fingerprint,subtotal,discount,shipping,total,p_address,coalesce(p_notes,'')) returning id,reference into oid,ref;
 insert into order_items(order_id,variant_id,product_name,sku,size,color,unit_price,quantity,line_total) select oid,x.variant_id,x.product_name,x.sku,x.size,x.color,x.unit_price,x.quantity,x.line_total from jsonb_to_recordset(snapshots) as x(variant_id uuid,product_name text,sku text,size text,color text,unit_price bigint,quantity int,line_total bigint);
 for row_item in select variant_id,quantity from order_items where order_id=oid order by variant_id loop update inventory set on_hand=on_hand-row_item.quantity,updated_at=now() where variant_id=row_item.variant_id;
 insert into inventory_movements(variant_id,delta,reason,actor_id,order_id) values(row_item.variant_id,-row_item.quantity,'Order placed',uid,oid);
 end loop;
 insert into payments(order_id,amount) values(oid,total);
 if c.id is not null then insert into coupon_redemptions(coupon_id,user_id,guest_access_hash,order_id) values(c.id,uid,p_guest_hash,oid);
 end if;
 delete from cart_items where cart_id in(select id from carts where user_id=uid);
 return jsonb_build_object('id',oid,'reference',ref,'subtotal',subtotal,'discount',discount,'shipping',shipping,'total',total);
end $$;

revoke all on function public.checkout_engine(jsonb,jsonb,text,text,uuid,boolean,text) from public,anon,authenticated;
create or replace function public.checkout_internal(p_items jsonb,p_address jsonb,p_coupon text,p_notes text,p_key uuid,p_quote boolean default false)
returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select public.checkout_engine(p_items,p_address,p_coupon,p_notes,p_key,p_quote,null)
$$;
revoke all on function public.checkout_internal(jsonb,jsonb,text,text,uuid,boolean) from public,anon,authenticated;

create function public.guest_checkout(p_items jsonb,p_address jsonb,p_coupon text,p_notes text,p_key uuid,p_token text,p_quote boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare token_hash text;
begin
 if auth.uid() is not null then raise exception 'Use registered checkout'; end if;
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('error','Invalid guest checkout'); end if;
 token_hash:=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 -- Both counters are outside the order subtransaction: rejected orders retain throttle hits.
 if not public.consume_rate_limit(case when p_quote then 'guest_quote_global' else 'guest_order_global' end,case when p_quote then 60 else 20 end,600)
 or not public.consume_rate_limit((case when p_quote then 'guest_quote:' else 'guest_order:' end)||token_hash,case when p_quote then 20 else 5 end,600)
 then return jsonb_build_object('error','Please try again later'); end if;
 begin return public.checkout_engine(p_items,p_address,p_coupon,p_notes,p_key,p_quote,token_hash);
 exception when raise_exception then return jsonb_build_object('error',sqlerrm);
 when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation or foreign_key_violation then return jsonb_build_object('error','Invalid checkout input');
 when deadlock_detected or serialization_failure then return jsonb_build_object('error','Stock changed during checkout. Please retry.');
 when others then return jsonb_build_object('error','Checkout could not be completed. Please try again.');
 end;
end $$;
revoke all on function public.guest_checkout(jsonb,jsonb,text,text,uuid,text,boolean) from public;
grant execute on function public.guest_checkout(jsonb,jsonb,text,text,uuid,text,boolean) to anon,authenticated;

create function public.guest_order(p_order uuid,p_token text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.orders%rowtype;
begin
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
 select * into o from public.orders where id=p_order and user_id is null
 and guest_access_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if not found then return null; end if;
 return jsonb_build_object('id',o.id,'reference',o.reference,'user_id',null,'status',o.status,'payment_status',o.payment_status,
 'subtotal',o.subtotal,'discount',o.discount,'shipping',o.shipping,'total',o.total,'address',o.address,'notes',o.notes,
 'tracking_number',o.tracking_number,'courier',o.courier,'created_at',o.created_at,
 'order_items',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'product_name',i.product_name,'sku',i.sku,'size',i.size,'color',i.color,'quantity',i.quantity,'unit_price',i.unit_price,'line_total',i.line_total)),'[]'::jsonb) from public.order_items i where i.order_id=o.id));
end $$;
revoke all on function public.guest_order(uuid,text) from public;
grant execute on function public.guest_order(uuid,text) to anon,authenticated;
