alter table categories add constraint category_not_own_parent check(parent_id is null or parent_id<>id);
create function public.duplicate_product(p_product uuid) returns uuid language plpgsql security definer set search_path=public as $$ declare old products%rowtype; newid uuid; suffix text:=substr(gen_random_uuid()::text,1,8); v record; newvid uuid; begin
 if not can_manage('catalog') then raise exception 'Forbidden'; end if;
 select * into old from products where id=p_product for share; if not found then raise exception 'Product not found'; end if;
 insert into products(category_id,name,slug,sku,description,price,sale_price,status,tags,featured,seo_title,seo_description) values(old.category_id,old.name||' (copy)',old.slug||'-'||suffix,old.sku||'-'||suffix,old.description,old.price,old.sale_price,'draft',old.tags,false,old.seo_title,old.seo_description) returning id into newid;
 insert into product_images(product_id,url,alt,position) select newid,url,alt,position from product_images where product_id=old.id;
 for v in select * from product_variants where product_id=old.id loop insert into product_variants(product_id,sku,size,color,price,active) values(newid,v.sku||'-'||suffix,v.size,v.color,v.price,v.active) returning id into newvid; insert into inventory(variant_id,on_hand) values(newvid,0); end loop;
 return newid;
end $$;
revoke all on function public.duplicate_product(uuid) from public,anon;
grant execute on function public.duplicate_product(uuid) to authenticated;
create function public.bulk_product_status(p_ids uuid[],p_status text) returns int language plpgsql security definer set search_path=public as $$ declare n int; begin if not can_manage('catalog') then raise exception 'Forbidden'; end if; if cardinality(p_ids) not between 1 and 100 or p_status not in ('draft','published','archived') then raise exception 'Invalid bulk update'; end if; update products set status=p_status where id=any(p_ids); get diagnostics n=row_count; return n; end $$;
revoke all on function public.bulk_product_status(uuid[],text) from public,anon;
grant execute on function public.bulk_product_status(uuid[],text) to authenticated;
