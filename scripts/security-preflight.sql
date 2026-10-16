-- Run in the trusted Supabase SQL editor. Read-only: no keys, tokens, row contents or PII.
-- Run before migration 007. Nonzero findings require explicit data review; never reset tables.
select count(*) as duplicate_cod_order_groups from (select order_id from public.payments group by order_id having count(*)>1) duplicate_orders;
select count(*) as null_coupon_targets from public.coupons where array_position(product_ids,null) is not null or array_position(category_ids,null) is not null or array_position(customer_ids,null) is not null;
select count(*) as invalid_banner_windows from public.banners where ends_at is not null and ends_at<=starts_at;
select count(*) as payment_total_mismatches from public.payments p join public.orders o on o.id=p.order_id where p.amount<>o.total;
select count(*) as snapshot_subtotal_mismatches from public.orders o where o.subtotal<>(select coalesce(sum(i.line_total),0) from public.order_items i where i.order_id=o.id);
select count(*) as stock_ledger_mismatches from public.inventory i where i.on_hand<>(select coalesce(sum(m.delta),0) from public.inventory_movements m where m.variant_id=i.variant_id);
select count(*) as nonpublic_product_photos_in_public_bucket from public.product_images i join public.products p on p.id=i.product_id where p.status<>'published' and i.url like '%/storage/v1/object/public/product-images/%';
with recursive parents(root,id,parent_id,path,cycle) as (
 select id,id,parent_id,array[id],false from public.categories
 union all select p.root,c.id,c.parent_id,p.path||c.id,c.id=any(p.path) from parents p join public.categories c on c.id=p.parent_id where not p.cycle
) select count(distinct root) as cyclic_category_roots from parents where cycle;
-- Schema/ACL metadata for the live project; review unexpected objects before first applying 001.
select tablename,rowsecurity from pg_tables where schemaname='public' order by tablename;
select c.conrelid::regclass as source_table,c.conname,pg_get_constraintdef(c.oid) as definition from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public' and c.contype='f' order by c.conrelid::regclass::text,c.conname;
select p.oid::regprocedure as routine,p.prosecdef,p.proconfig,
 has_function_privilege('anon',p.oid,'execute') as anon_execute,
 has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by p.oid::regprocedure::text;
-- AFTER applying 008, check the NOT VALID settings constraint before validation:
-- select count(*) from public.store_settings where not public.valid_store_configuration(shipping_zones,navigation,footer_links,homepage_sections);
-- Validate each NOT VALID constraint only after the reviewed legacy rows are corrected.
