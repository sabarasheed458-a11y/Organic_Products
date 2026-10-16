-- All monetary values are integer paisa (PKR minor units).
create extension if not exists pgcrypto;
create table public.profiles (id uuid primary key references auth.users on delete cascade, full_name text not null default '', phone text not null default '', role text not null default 'customer' check(role in ('customer','owner','manager','catalog_manager','order_manager')), active boolean not null default true, created_at timestamptz not null default now());
create table public.addresses (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles on delete cascade, full_name text not null, phone text not null, line1 text not null, city text not null, postal_code text not null default '', created_at timestamptz not null default now());
create table public.categories (id uuid primary key default gen_random_uuid(), parent_id uuid references categories, name text not null, slug text unique not null check(slug ~ '^[a-z0-9-]+$'), description text not null default '', image_url text, position int not null default 0, visible boolean not null default true, seo_title text, seo_description text, created_at timestamptz not null default now());
create table public.products (id uuid primary key default gen_random_uuid(), category_id uuid references categories, name text not null, slug text not null unique check(slug ~ '^[a-z0-9-]+$'), sku text not null unique, description text not null default '', price bigint not null check(price >= 0), sale_price bigint check(sale_price >= 0 and sale_price <= price), status text not null default 'draft' check(status in ('draft','published','archived')), tags text[] not null default '{}', featured boolean not null default false, seo_title text, seo_description text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.product_variants (id uuid primary key default gen_random_uuid(), product_id uuid not null references products on delete cascade, sku text not null unique, size text not null default 'One size', color text not null default 'Natural', price bigint check(price >= 0), active boolean not null default true, unique(product_id,size,color));
create table public.product_images (id uuid primary key default gen_random_uuid(), product_id uuid not null references products on delete cascade, url text not null, alt text not null, position int not null default 0);
create table public.inventory (variant_id uuid primary key references product_variants on delete cascade, on_hand int not null default 0 check(on_hand>=0), reserved int not null default 0 check(reserved>=0 and reserved<=on_hand), updated_at timestamptz not null default now());
create table public.inventory_movements (id uuid primary key default gen_random_uuid(), variant_id uuid not null references product_variants, delta int not null, reason text not null check(length(reason)>=3), actor_id uuid references profiles, order_id uuid, created_at timestamptz not null default now());
create table public.carts (id uuid primary key default gen_random_uuid(), user_id uuid not null unique references profiles on delete cascade, created_at timestamptz not null default now());
create table public.cart_items (id uuid primary key default gen_random_uuid(), cart_id uuid not null references carts on delete cascade, variant_id uuid not null references product_variants on delete cascade, quantity int not null check(quantity between 1 and 99), unique(cart_id,variant_id));
create table public.wishlists (id uuid primary key default gen_random_uuid(), user_id uuid not null unique references profiles on delete cascade);
create table public.wishlist_items (id uuid primary key default gen_random_uuid(), wishlist_id uuid not null references wishlists on delete cascade, product_id uuid not null references products on delete cascade, unique(wishlist_id,product_id));
create table public.coupons (id uuid primary key default gen_random_uuid(), code text not null unique check(code=upper(code)), kind text not null check(kind in ('percentage','fixed','quantity')), value int not null check(value>0), minimum bigint not null default 0 check(minimum>=0), min_quantity int not null default 1 check(min_quantity>0), starts_at timestamptz not null default now(), ends_at timestamptz, usage_limit int check(usage_limit>0), per_customer_limit int not null default 1 check(per_customer_limit>0), product_ids uuid[] not null default '{}', category_ids uuid[] not null default '{}', customer_ids uuid[] not null default '{}', active boolean not null default true, check(kind='fixed' or value<=100), check(ends_at is null or ends_at>starts_at));
create table public.promotions (id uuid primary key default gen_random_uuid(), name text not null, coupon_id uuid references coupons, description text not null default '', active boolean not null default true);
create table public.store_settings (id text primary key default 'store' check(id='store'), name text not null default 'Maison Mira', currency text not null default 'PKR' check(currency='PKR'), contact_email text not null default '', contact_phone text not null default '', announcement text not null default 'Thoughtfully made. Beautifully worn.', shipping_fee bigint not null default 25000 check(shipping_fee>=0), free_shipping_threshold bigint not null default 800000 check(free_shipping_threshold>=0), cod_enabled boolean not null default true, max_cod_total bigint not null default 5000000 check(max_cod_total>0), shipping_zones jsonb not null default '[]', navigation jsonb not null default '[]', homepage_sections jsonb not null default '["featured","categories","story"]');
insert into public.store_settings(id) values('store');
create table public.orders (id uuid primary key default gen_random_uuid(), reference text not null unique default ('MM-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))), user_id uuid not null references profiles, idempotency_key uuid not null, request_hash text not null, status text not null default 'pending' check(status in ('pending','confirmed','processing','shipped','delivered','cancelled','returned')), payment_status text not null default 'unpaid' check(payment_status in ('unpaid','paid','refunded')), subtotal bigint not null check(subtotal>=0), discount bigint not null default 0 check(discount>=0 and discount<=subtotal), shipping bigint not null check(shipping>=0), total bigint not null check(total=subtotal-discount+shipping), address jsonb not null, notes text not null default '', tracking_number text not null default '', courier text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,idempotency_key));
alter table inventory_movements add constraint movement_order_fk foreign key(order_id) references orders;
create table public.order_items (id uuid primary key default gen_random_uuid(), order_id uuid not null references orders, variant_id uuid not null references product_variants, product_name text not null, sku text not null, size text not null, color text not null, unit_price bigint not null check(unit_price>=0), quantity int not null check(quantity>0), line_total bigint not null check(line_total=unit_price*quantity));
create table public.payments (id uuid primary key default gen_random_uuid(), order_id uuid not null references orders, provider text not null default 'cod' check(provider='cod'), status text not null default 'unpaid' check(status in ('unpaid','paid','refunded')), amount bigint not null check(amount>=0), provider_reference text unique, created_at timestamptz not null default now());
create table public.coupon_redemptions (id uuid primary key default gen_random_uuid(), coupon_id uuid not null references coupons, user_id uuid not null references profiles, order_id uuid not null unique references orders, created_at timestamptz not null default now());
create table public.banners (id uuid primary key default gen_random_uuid(), title text not null, subtitle text not null default '', image_url text, link text not null default '/collections/all' check(link ~ '^/[^/]'), position int not null default 0, active boolean not null default true, starts_at timestamptz not null default now(), ends_at timestamptz);
create table public.pages (id uuid primary key default gen_random_uuid(), slug text not null unique check(slug ~ '^[a-z0-9-]+$'), title text not null, content text not null, published boolean not null default true, updated_at timestamptz not null default now());
create table public.reviews (id uuid primary key default gen_random_uuid(), product_id uuid not null references products, user_id uuid not null references profiles, rating int not null check(rating between 1 and 5), content text not null, approved boolean not null default false, created_at timestamptz not null default now(), unique(product_id,user_id));
create table public.admin_audit_logs (id uuid primary key default gen_random_uuid(), actor_id uuid references profiles, action text not null, entity text not null, entity_id text, details jsonb not null default '{}', created_at timestamptz not null default now());
create table public.contact_inquiries (id uuid primary key default gen_random_uuid(), name text not null, email text not null, message text not null, status text not null default 'open' check(status in ('open','resolved')), created_at timestamptz not null default now());
create table public.rate_limits (key text primary key, window_start timestamptz not null default now(), hits int not null default 1);
create index products_category_idx on products(category_id,status);
create index products_created_idx on products(created_at desc);
create index variants_product_idx on product_variants(product_id);
create index orders_customer_idx on orders(user_id,created_at desc);
create index orders_status_idx on orders(status,created_at desc);
create index order_items_order_idx on order_items(order_id);
create index images_product_idx on product_images(product_id,position);
create index movements_variant_idx on inventory_movements(variant_id,created_at desc);
create index redemptions_coupon_idx on coupon_redemptions(coupon_id,user_id);
create index audits_date_idx on admin_audit_logs(created_at desc);

create function public.staff_role() returns text language sql stable security definer set search_path=public as $$ select role from profiles where id=auth.uid() and active $$;
create function public.can_manage(scope text) returns boolean language sql stable security definer set search_path=public as $$ select coalesce(public.staff_role() in ('owner','manager') or (scope='catalog' and public.staff_role()='catalog_manager') or (scope='orders' and public.staff_role()='order_manager'),false) $$;
create function public.new_profile() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into profiles(id,full_name) values(new.id,left(coalesce(new.raw_user_meta_data->>'full_name',''),120)); insert into carts(user_id) values(new.id); insert into wishlists(user_id) values(new.id); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function new_profile();

-- Audits use identifiers and changed field names, not private customer contents.
create function public.audit_change() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into admin_audit_logs(actor_id,action,entity,entity_id,details) values(auth.uid(),tg_op,tg_table_name,coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id',to_jsonb(new)->>'variant_id'),jsonb_build_object('operation',tg_op)); if tg_op='DELETE' then return old; end if; return new; end $$;
create function public.immutable_snapshot() returns trigger language plpgsql as $$ begin raise exception 'Order snapshots are immutable'; end $$;
create trigger protect_snapshots before update or delete on order_items for each row execute function immutable_snapshot();
create function public.touch_product() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create trigger product_updated before update on products for each row execute function touch_product();
do $$ declare t text; begin foreach t in array array['profiles','categories','products','product_variants','product_images','inventory','orders','coupons','promotions','banners','pages','store_settings'] loop execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_change()',t,t); end loop; end $$;

do $$ declare t text; begin foreach t in array array['profiles','addresses','categories','products','product_variants','product_images','inventory','inventory_movements','carts','cart_items','wishlists','wishlist_items','orders','order_items','payments','coupons','coupon_redemptions','promotions','banners','pages','store_settings','reviews','admin_audit_logs','contact_inquiries','rate_limits'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;
create policy catalog_read on products for select using(status='published' or can_manage('catalog'));
create policy catalog_write on products for all to authenticated using(can_manage('catalog')) with check(can_manage('catalog'));
create policy categories_read on categories for select using(visible or can_manage('catalog'));
create policy categories_write on categories for all to authenticated using(can_manage('catalog')) with check(can_manage('catalog'));
create policy variants_read on product_variants for select using(exists(select 1 from products p where p.id=product_id and p.status='published' and active) or can_manage('catalog'));
create policy variants_write on product_variants for all to authenticated using(can_manage('catalog')) with check(can_manage('catalog'));
create policy images_read on product_images for select using(exists(select 1 from products p where p.id=product_id and p.status='published') or can_manage('catalog'));
create policy images_write on product_images for all to authenticated using(can_manage('catalog')) with check(can_manage('catalog'));
create policy inventory_read on inventory for select using(exists(select 1 from product_variants v join products p on p.id=v.product_id where v.id=variant_id and p.status='published' and v.active) or can_manage('catalog'));
create policy movement_read on inventory_movements for select to authenticated using(can_manage('catalog') or can_manage('orders'));
create policy profile_read on profiles for select to authenticated using(id=auth.uid() or can_manage('orders'));
create policy profile_update on profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
-- Column grants below prevent clients changing role or active.
create policy address_owner on addresses for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy cart_owner on carts for select to authenticated using(user_id=auth.uid());
create policy cart_item_owner on cart_items for all to authenticated using(exists(select 1 from carts where carts.id=cart_id and user_id=auth.uid())) with check(exists(select 1 from carts where carts.id=cart_id and user_id=auth.uid()));
create policy wishlist_owner on wishlists for select to authenticated using(user_id=auth.uid());
create policy wishlist_item_owner on wishlist_items for all to authenticated using(exists(select 1 from wishlists where wishlists.id=wishlist_id and user_id=auth.uid())) with check(exists(select 1 from wishlists where wishlists.id=wishlist_id and user_id=auth.uid()));
create policy order_read on orders for select to authenticated using(user_id=auth.uid() or can_manage('orders'));
create policy order_item_read on order_items for select to authenticated using(exists(select 1 from orders where orders.id=order_id and (user_id=auth.uid() or can_manage('orders'))));
create policy payment_read on payments for select to authenticated using(exists(select 1 from orders where orders.id=order_id and (user_id=auth.uid() or can_manage('orders'))));
create policy redemption_read on coupon_redemptions for select to authenticated using(user_id=auth.uid() or can_manage('settings'));
create policy audit_read on admin_audit_logs for select to authenticated using(can_manage('settings'));
create policy inquiries_staff on contact_inquiries for select to authenticated using(can_manage('orders'));
create policy inquiries_update on contact_inquiries for update to authenticated using(can_manage('orders')) with check(can_manage('orders'));
create policy banners_public on banners for select using((active and starts_at<=now() and (ends_at is null or ends_at>now())) or can_manage('settings'));
create policy pages_public on pages for select using(published or can_manage('settings'));
create policy settings_public on store_settings for select using(true);
create policy reviews_public on reviews for select using(approved or user_id=auth.uid() or can_manage('catalog'));
do $$ declare t text; begin foreach t in array array['coupons','promotions','banners','pages','store_settings'] loop execute format('create policy manage_%I on public.%I for all to authenticated using(public.can_manage(''settings'')) with check(public.can_manage(''settings''))',t,t); end loop; end $$;

-- Explicit grants: no direct client writes to financial, inventory or audit tables.
revoke all on all tables in schema public from anon,authenticated;
grant usage on schema public to anon,authenticated;
grant select on products,product_variants,product_images,categories,inventory,banners,pages,store_settings,reviews to anon,authenticated;
grant select on profiles,addresses,carts,cart_items,wishlists,wishlist_items,orders,order_items,payments,inventory_movements,coupons,coupon_redemptions,promotions,admin_audit_logs,contact_inquiries to authenticated;
grant insert,update,delete on products,product_variants,product_images,categories,addresses,cart_items,wishlist_items,coupons,promotions,banners,pages to authenticated;
grant update on store_settings to authenticated;
grant update(full_name,phone) on profiles to authenticated;
grant update(status) on contact_inquiries to authenticated;

create function public.consume_rate_limit(p_key text,p_limit int,p_seconds int) returns boolean language plpgsql security definer set search_path=public as $$ declare n int; begin if p_limit<1 or p_limit>100 or p_seconds<1 or p_seconds>86400 or length(p_key)>200 then raise exception 'Invalid rate limit'; end if; insert into rate_limits(key) values(p_key) on conflict(key) do update set hits=case when rate_limits.window_start<now()-make_interval(secs=>p_seconds) then 1 else rate_limits.hits+1 end,window_start=case when rate_limits.window_start<now()-make_interval(secs=>p_seconds) then now() else rate_limits.window_start end returning hits into n; return n<=p_limit; end $$;
-- Only fixed limits are exposed; arbitrary keys/limits remain private.
create function public.request_gate(p_action text) returns boolean language plpgsql security definer set search_path=public as $$ declare ident text; begin if p_action not in ('contact','checkout','coupon','auth') then raise exception 'Invalid action'; end if; ident:=coalesce(auth.uid()::text,nullif(current_setting('request.headers',true),'')::jsonb->>'x-real-ip','anonymous'); return consume_rate_limit(p_action||':'||left(ident,100),case when p_action='contact' then 5 else 20 end,600); end $$;
create function public.submit_inquiry(p_name text,p_email text,p_message text) returns void language plpgsql security definer set search_path=public as $$ begin if not request_gate('contact') then raise exception 'Please try again later'; end if; if length(p_name) not between 2 and 120 or length(p_message) not between 10 and 3000 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_email)>254 then raise exception 'Invalid inquiry'; end if; insert into contact_inquiries(name,email,message) values(p_name,p_email,p_message); end $$;

create function public.adjust_inventory(p_variant uuid,p_quantity int,p_mode text,p_reason text) returns int language plpgsql security definer set search_path=public as $$ declare old_qty int; new_qty int; begin if not can_manage('catalog') then raise exception 'Forbidden'; end if; if length(trim(p_reason)) not between 3 and 500 or p_mode is null or p_mode not in ('set','add','subtract') or p_quantity<0 or p_quantity>1000000 then raise exception 'Invalid adjustment'; end if; insert into inventory(variant_id) values(p_variant) on conflict do nothing; select on_hand into old_qty from inventory where variant_id=p_variant for update; new_qty:=case p_mode when 'set' then p_quantity when 'add' then old_qty+p_quantity else old_qty-p_quantity end; update inventory set on_hand=new_qty,updated_at=now() where variant_id=p_variant; insert into inventory_movements(variant_id,delta,reason,actor_id) values(p_variant,new_qty-old_qty,p_reason,auth.uid()); return new_qty; end $$;

create function public.checkout(p_items jsonb,p_address jsonb,p_coupon text,p_notes text,p_key uuid,p_quote boolean default false) returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); s store_settings%rowtype; c coupons%rowtype; existing orders%rowtype; row_item record; v record; item_count int; subtotal bigint:=0; eligible bigint:=0; discount bigint:=0; shipping bigint; total bigint; qty_total int:=0; eligible_qty int:=0; oid uuid; ref text; fingerprint text; snapshots jsonb:='[]';
begin
 if uid is null or not exists(select 1 from profiles where id=uid and active) then raise exception 'Authentication required'; end if;
 if not request_gate(case when p_quote then 'coupon' else 'checkout' end) then raise exception 'Please try again later'; end if;
 if p_quote is null then raise exception 'Invalid checkout mode'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 or p_key is null then raise exception 'Invalid cart'; end if;
 if length(coalesce(p_notes,''))>1000 then raise exception 'Notes too long'; end if;
 if not p_quote and (jsonb_typeof(p_address) is distinct from 'object' or length(coalesce(p_address->>'full_name','')) not between 2 and 120 or length(coalesce(p_address->>'phone','')) not between 7 and 25 or length(coalesce(p_address->>'line1','')) not between 5 and 300 or length(coalesce(p_address->>'city','')) not between 2 and 120 or length(coalesce(p_address->>'postal_code',''))>20) then raise exception 'Invalid delivery address'; end if;
 if not p_quote then p_address:=jsonb_build_object('full_name',p_address->>'full_name','phone',p_address->>'phone','line1',p_address->>'line1','city',p_address->>'city','postal_code',coalesce(p_address->>'postal_code','')); end if;
 select count(distinct x->>'variant_id') into item_count from jsonb_array_elements(p_items) x;
 if item_count<>jsonb_array_length(p_items) then raise exception 'Duplicate variants'; end if;
 fingerprint:=md5(p_items::text||p_address::text||coalesce(p_coupon,'')||coalesce(p_notes,''));
 perform pg_advisory_xact_lock(hashtextextended(uid::text||p_key::text,0));
 select * into existing from orders where user_id=uid and idempotency_key=p_key;
 if found and not p_quote then if existing.request_hash<>fingerprint then raise exception 'Checkout key already used'; end if; return jsonb_build_object('id',existing.id,'reference',existing.reference,'total',existing.total); end if;
 select * into s from store_settings where id='store';
 if not s.cod_enabled then raise exception 'Cash on delivery is unavailable'; end if;
 if nullif(trim(p_coupon),'') is not null then
  select * into c from coupons where code=upper(trim(p_coupon)) for update;
  if not found or not c.active or c.starts_at>now() or (c.ends_at is not null and c.ends_at<=now()) or (cardinality(c.customer_ids)>0 and not uid=any(c.customer_ids)) then raise exception 'Coupon is unavailable'; end if;
  if (c.usage_limit is not null and (select count(*) from coupon_redemptions where coupon_id=c.id)>=c.usage_limit) or (select count(*) from coupon_redemptions where coupon_id=c.id and user_id=uid)>=c.per_customer_limit then raise exception 'Coupon usage limit reached'; end if;
 end if;
 for row_item in select (x->>'variant_id')::uuid vid,(x->>'quantity')::int qty from jsonb_array_elements(p_items) x order by (x->>'variant_id')::uuid loop
  if row_item.qty is null or row_item.qty not between 1 and 99 then raise exception 'Invalid quantity'; end if;
  -- Lock catalog rows as well as stock so concurrent edits cannot alter a snapshot mid-order.
  select pv.id,pv.sku,pv.size,pv.color,p.id pid,p.category_id,p.name,coalesce(pv.price,p.sale_price,p.price) unit_price,i.on_hand-i.reserved available into v from product_variants pv join products p on p.id=pv.product_id join inventory i on i.variant_id=pv.id where pv.id=row_item.vid and pv.active and p.status='published' for update of i,pv,p;
  if not found or v.available<row_item.qty then raise exception 'An item is unavailable or has insufficient stock'; end if;
  subtotal:=subtotal+v.unit_price*row_item.qty; qty_total:=qty_total+row_item.qty;
  if c.id is not null and (cardinality(c.product_ids)=0 or v.pid=any(c.product_ids)) and (cardinality(c.category_ids)=0 or v.category_id=any(c.category_ids)) then eligible:=eligible+v.unit_price*row_item.qty; eligible_qty:=eligible_qty+row_item.qty; end if;
  snapshots:=snapshots||jsonb_build_array(jsonb_build_object('variant_id',v.id,'product_name',v.name,'sku',v.sku,'size',v.size,'color',v.color,'unit_price',v.unit_price,'quantity',row_item.qty,'line_total',v.unit_price*row_item.qty));
 end loop;
 if c.id is not null then if subtotal<c.minimum or eligible_qty<c.min_quantity or eligible=0 then raise exception 'Coupon conditions are not met'; end if; discount:=case when c.kind='fixed' then least(eligible,c.value) else eligible*c.value/100 end; end if;
 shipping:=case when subtotal-discount>=s.free_shipping_threshold then 0 else s.shipping_fee end;
 if jsonb_array_length(s.shipping_zones)>0 then select (z->>'fee')::bigint into shipping from jsonb_array_elements(s.shipping_zones) z where lower(z->>'city')=lower(p_address->>'city') limit 1; if shipping is null then raise exception 'Delivery is unavailable in this city'; end if; if subtotal-discount>=s.free_shipping_threshold then shipping:=0; end if; end if;
 total:=subtotal-discount+shipping; if total>s.max_cod_total then raise exception 'Order exceeds cash on delivery limit'; end if;
 if p_quote then return jsonb_build_object('subtotal',subtotal,'discount',discount,'shipping',shipping,'total',total); end if;
 insert into orders(user_id,idempotency_key,request_hash,subtotal,discount,shipping,total,address,notes) values(uid,p_key,fingerprint,subtotal,discount,shipping,total,p_address,coalesce(p_notes,'')) returning id,reference into oid,ref;
 insert into order_items(order_id,variant_id,product_name,sku,size,color,unit_price,quantity,line_total) select oid,x.variant_id,x.product_name,x.sku,x.size,x.color,x.unit_price,x.quantity,x.line_total from jsonb_to_recordset(snapshots) as x(variant_id uuid,product_name text,sku text,size text,color text,unit_price bigint,quantity int,line_total bigint);
 for row_item in select variant_id,quantity from order_items where order_id=oid order by variant_id loop update inventory set on_hand=on_hand-row_item.quantity,updated_at=now() where variant_id=row_item.variant_id; insert into inventory_movements(variant_id,delta,reason,actor_id,order_id) values(row_item.variant_id,-row_item.quantity,'Order placed',uid,oid); end loop;
 insert into payments(order_id,amount) values(oid,total);
 if c.id is not null then insert into coupon_redemptions(coupon_id,user_id,order_id) values(c.id,uid,oid); end if;
 delete from cart_items where cart_id in(select id from carts where user_id=uid);
 return jsonb_build_object('id',oid,'reference',ref,'subtotal',subtotal,'discount',discount,'shipping',shipping,'total',total);
end $$;

create function public.transition_order(p_order uuid,p_status text,p_tracking text default '',p_courier text default '',p_reason text default '') returns void language plpgsql security definer set search_path=public as $$ declare o orders%rowtype; item record; allowed boolean; begin
 if not can_manage('orders') then raise exception 'Forbidden'; end if;
 if length(p_tracking)>120 or length(p_courier)>120 or length(p_reason) not between 3 and 500 then raise exception 'Provide a valid reason'; end if;
 select * into o from orders where id=p_order for update; if not found then raise exception 'Order not found'; end if;
 allowed:=case o.status when 'pending' then p_status in ('confirmed','cancelled') when 'confirmed' then p_status in ('processing','cancelled') when 'processing' then p_status in ('shipped','cancelled') when 'shipped' then p_status='delivered' when 'delivered' then p_status='returned' else false end;
 if not allowed then raise exception 'Invalid order transition'; end if;
 if p_status='shipped' and (length(p_tracking)=0 or length(p_courier)=0) then raise exception 'Courier and tracking required'; end if;
 if p_status in ('cancelled','returned') then for item in select variant_id,quantity from order_items where order_id=o.id order by variant_id loop update inventory set on_hand=on_hand+item.quantity,updated_at=now() where variant_id=item.variant_id; insert into inventory_movements(variant_id,delta,reason,actor_id,order_id) values(item.variant_id,item.quantity,p_reason,auth.uid(),o.id); end loop; end if;
 update orders set status=p_status,tracking_number=case when p_status='shipped' then p_tracking else tracking_number end,courier=case when p_status='shipped' then p_courier else courier end,updated_at=now() where id=o.id;
 insert into admin_audit_logs(actor_id,action,entity,entity_id,details) values(auth.uid(),'ORDER_TRANSITION','orders',o.id::text,jsonb_build_object('from',o.status,'to',p_status,'reason',p_reason));
end $$;
create function public.record_cod_payment(p_order uuid,p_status text,p_reason text) returns void language plpgsql security definer set search_path=public as $$ declare o orders%rowtype; begin if not can_manage('orders') then raise exception 'Forbidden'; end if; select * into o from orders where id=p_order for update; if not found or length(p_reason) not between 3 and 500 or not ((p_status='paid' and o.status='delivered' and o.payment_status='unpaid') or (p_status='refunded' and o.status='returned' and o.payment_status='paid')) then raise exception 'Invalid payment transition'; end if; update orders set payment_status=p_status where id=p_order; update payments set status=p_status where order_id=p_order; insert into admin_audit_logs(actor_id,action,entity,entity_id,details) values(auth.uid(),'COD_RECONCILIATION','orders',p_order::text,jsonb_build_object('status',p_status,'reason',p_reason)); end $$;
create function public.set_staff(p_user uuid,p_role text,p_active boolean) returns void language plpgsql security definer set search_path=public as $$ begin if staff_role() is distinct from 'owner' or p_user=auth.uid() then raise exception 'Owner permission required; own role cannot be changed'; end if; if p_role not in ('customer','owner','manager','catalog_manager','order_manager') then raise exception 'Invalid role'; end if; update profiles set role=p_role,active=p_active where id=p_user; if not found then raise exception 'User not found'; end if; end $$;
-- Revoke default PUBLIC execution on ALL application functions, then expose a whitelist.
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function staff_role(),can_manage(text) to anon,authenticated;
grant execute on function request_gate(text),submit_inquiry(text,text,text) to anon,authenticated;
grant execute on function checkout(jsonb,jsonb,text,text,uuid,boolean),adjust_inventory(uuid,int,text,text),transition_order(uuid,text,text,text,text),record_cod_payment(uuid,text,text),set_staff(uuid,text,boolean) to authenticated;
