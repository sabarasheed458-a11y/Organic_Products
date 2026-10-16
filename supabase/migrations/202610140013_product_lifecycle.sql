-- Forward-only lifecycle protection. No existing records or files are removed.
create function public.product_dependencies(p_product uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not can_manage('catalog') then raise exception 'Forbidden'; end if;
 return jsonb_build_object(
 'orders',(select count(*) from order_items where variant_id in(select id from product_variants where product_id=p_product)),
 'movements',(select count(*) from inventory_movements where variant_id in(select id from product_variants where product_id=p_product)),
 'carts',(select count(*) from cart_items where variant_id in(select id from product_variants where product_id=p_product)),
 'stock',(select coalesce(sum(on_hand),0) from inventory where variant_id in(select id from product_variants where product_id=p_product)),
 'reviews',(select count(*) from reviews where product_id=p_product),
 'wishlists',(select count(*) from wishlist_items where product_id=p_product),
 'coupons',(select count(*) from coupons where p_product=any(product_ids)));
end $$;
revoke all on function public.product_dependencies(uuid) from public,anon;
grant execute on function public.product_dependencies(uuid) to authenticated;

create function public.product_removal(p_product uuid,p_apply boolean default false,p_archive boolean default false) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p products%rowtype; deps jsonb; protected boolean; outcome text;
begin
 if not can_manage('catalog') then raise exception 'Forbidden'; end if;
 if p_apply is null or p_archive is null then raise exception 'Invalid removal mode'; end if;
 select * into p from products where id=p_product for update;
 if not found then raise exception 'Product not found'; end if;
 -- Same product -> variant -> inventory lock order used by checkout.
 perform id from product_variants where product_id=p.id order by id for update;
 perform variant_id from inventory where variant_id in(select id from product_variants where product_id=p.id) order by variant_id for update;
 deps:=product_dependencies(p.id);
 select exists(select 1 from jsonb_each_text(deps) where value::bigint>0) into protected;
 outcome:=case when p_archive or p.status='published' or protected then 'archived' else 'deleted' end;
 if p_apply then
  if outcome='archived' then update products set status='archived' where id=p.id;
  else delete from products where id=p.id; end if;
  if not found then raise exception 'Product operation was not confirmed'; end if;
  insert into admin_audit_logs(actor_id,action,entity,entity_id,details) values(auth.uid(),'PRODUCT_REMOVAL','products',p.id::text,jsonb_build_object('name',p.name,'outcome',outcome,'dependencies',deps));
 end if;
 return jsonb_build_object('id',p.id,'name',p.name,'outcome',outcome,'dependencies',deps,'applied',p_apply);
end $$;
revoke all on function public.product_removal(uuid,boolean,boolean) from public,anon;
grant execute on function public.product_removal(uuid,boolean,boolean) to authenticated;

create function public.guard_product_delete() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare deps jsonb;
begin
 if not can_manage('catalog') then raise exception 'Forbidden'; end if;
 if old.status='published' then raise exception 'Archive the product before deleting it'; end if;
 perform id from product_variants where product_id=old.id order by id for update;
 perform variant_id from inventory where variant_id in(select id from product_variants where product_id=old.id) order by variant_id for update;
 deps:=product_dependencies(old.id);
 if exists(select 1 from jsonb_each_text(deps) where value::bigint>0) then raise exception 'Product has protected dependencies. Archive it instead'; end if;
 return old;
end $$;
revoke all on function public.guard_product_delete() from public,anon,authenticated;
create trigger product_delete_dependencies before delete on products for each row execute function public.guard_product_delete();

create function public.variant_removal(p_variant uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v product_variants%rowtype; pid uuid; protected boolean; outcome text;
begin
 if not can_manage('catalog') then raise exception 'Forbidden'; end if;
 select product_id into pid from product_variants where id=p_variant;
 if not found then raise exception 'Variant not found'; end if;
 perform id from products where id=pid for update;
 select * into v from product_variants where id=p_variant for update;
 if not found then raise exception 'Variant not found'; end if;
 perform variant_id from inventory where variant_id=v.id for update;
 protected:=exists(select 1 from order_items where variant_id=v.id)
 or exists(select 1 from inventory_movements where variant_id=v.id)
 or exists(select 1 from cart_items where variant_id=v.id)
 or exists(select 1 from inventory where variant_id=v.id and (on_hand>0 or reserved>0))
 or (exists(select 1 from product_images where product_id=pid and lower(color)=lower(v.color)) and not exists(select 1 from product_variants where product_id=pid and id<>v.id and lower(color)=lower(v.color)));
 outcome:=case when protected then 'deactivated' else 'deleted' end;
 if protected then update product_variants set active=false where id=v.id;
 else delete from product_variants where id=v.id; end if;
 if not found then raise exception 'Variant operation was not confirmed'; end if;
 insert into admin_audit_logs(actor_id,action,entity,entity_id,details) values(auth.uid(),'VARIANT_REMOVAL','product_variants',v.id::text,jsonb_build_object('sku',v.sku,'outcome',outcome));
 return jsonb_build_object('id',v.id,'outcome',outcome);
end $$;
revoke all on function public.variant_removal(uuid) from public,anon;
grant execute on function public.variant_removal(uuid) to authenticated;

create function public.guard_variant_delete() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if not can_manage('catalog') then raise exception 'Forbidden'; end if;
 perform variant_id from inventory where variant_id=old.id for update;
 if exists(select 1 from order_items where variant_id=old.id) or exists(select 1 from inventory_movements where variant_id=old.id)
 or exists(select 1 from cart_items where variant_id=old.id) or exists(select 1 from inventory where variant_id=old.id and (on_hand>0 or reserved>0))
 or (exists(select 1 from products where id=old.product_id) and exists(select 1 from product_images where product_id=old.product_id and lower(color)=lower(old.color)) and not exists(select 1 from product_variants where product_id=old.product_id and id<>old.id and lower(color)=lower(old.color)))
 then raise exception 'Variant is referenced. Deactivate it instead'; end if;
 return old;
end $$;
revoke all on function public.guard_variant_delete() from public,anon,authenticated;
create trigger variant_delete_dependencies before delete on product_variants for each row execute function public.guard_variant_delete();

-- Coupon arrays have no FK: lock and validate new targets explicitly so they
-- cannot be attached after a removal has checked dependencies.
create function public.guard_coupon_product_targets() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare pid uuid;
begin
 for pid in select distinct unnest(new.product_ids) order by 1 loop
  perform id from products where id=pid for key share;
  if not found then raise exception 'Coupon product target no longer exists'; end if;
 end loop;
 return new;
end $$;
revoke all on function public.guard_coupon_product_targets() from public,anon,authenticated;
create trigger coupon_product_target_guard before insert or update of product_ids on coupons for each row execute function public.guard_coupon_product_targets();

-- Literal matching also protects reused photos in page content and settings JSON.
create function public.product_asset_referenced(p_name text) returns boolean
language sql volatile security definer set search_path=public,pg_temp as $$
 select exists(select 1 from product_images where position('/storage/v1/object/public/product-images/'||p_name in url)>0)
 or exists(select 1 from categories where position('/storage/v1/object/public/product-images/'||p_name in image_url)>0)
 or exists(select 1 from banners where position('/storage/v1/object/public/product-images/'||p_name in image_url)>0)
 or exists(select 1 from store_settings where position('/storage/v1/object/public/product-images/'||p_name in to_jsonb(store_settings)::text)>0)
 or exists(select 1 from pages where position('/storage/v1/object/public/product-images/'||p_name in content)>0)
$$;
revoke all on function public.product_asset_referenced(text) from public,anon,authenticated;
create or replace function public.asset_in_use(p_name text) returns boolean
language plpgsql volatile security definer set search_path=public,pg_temp as $$ begin
 if not can_manage('catalog') then return true; end if;
 return product_asset_referenced(p_name);
end $$;

create function public.inspect_product_asset(p_name text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if not can_manage('catalog') then raise exception 'Forbidden'; end if;
 if p_name is null or p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$' then raise exception 'Choose an uploaded product file path'; end if;
 return jsonb_build_object('path',p_name,'exists',exists(select 1 from storage.objects where bucket_id='product-images' and name=p_name),'referenced',product_asset_referenced(p_name));
end $$;
revoke all on function public.inspect_product_asset(text) from public,anon;
grant execute on function public.inspect_product_asset(text) to authenticated;

-- Serialize new references with storage removal; audit records retain tombstones
-- so a reference cannot be inserted just after a checked removal commits.
create index product_asset_delete_audit_path on public.admin_audit_logs((details->>'path')) where action='PRODUCT_ASSET_DELETE';
create function public.lock_product_asset_reference() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare path text; matches text[];
begin
 if tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old) then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('product-asset-references',0));
 for matches in select regexp_matches(to_jsonb(new)::text,'/storage/v1/object/public/product-images/([0-9a-f-]{36}/[0-9a-f-]{36}\.(?:jpg|png|webp))','g') loop
  path:=matches[1];
  if exists(select 1 from admin_audit_logs where action='PRODUCT_ASSET_DELETE' and details->>'path'=path)
  and not exists(select 1 from storage.objects where bucket_id='product-images' and name=path)
  then raise exception 'This image file was removed. Upload a replacement'; end if;
 end loop;
 return new;
end $$;
revoke all on function public.lock_product_asset_reference() from public,anon,authenticated;
do $$ declare t text; begin foreach t in array array['product_images','categories','banners','store_settings','pages'] loop
 execute format('create trigger protect_asset_reference before insert or update on public.%I for each row execute function public.lock_product_asset_reference()',t);
end loop; end $$;

create function public.guard_product_asset_delete() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if old.bucket_id='product-images' then
  perform pg_advisory_xact_lock(hashtextextended('product-asset-references',0));
  if product_asset_referenced(old.name) then raise exception 'Image file is still referenced'; end if;
  insert into admin_audit_logs(actor_id,action,entity,entity_id,details) values(auth.uid(),'PRODUCT_ASSET_DELETE','storage.objects',old.id::text,jsonb_build_object('path',old.name));
 end if;
 return old;
end $$;
revoke all on function public.guard_product_asset_delete() from public,anon,authenticated;
create trigger product_asset_delete_guard before delete on storage.objects for each row execute function public.guard_product_asset_delete();
