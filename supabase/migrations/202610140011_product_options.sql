alter table public.products add column has_sizes boolean not null default false;
update public.products p set has_sizes = exists (
  select 1 from public.product_variants v where v.product_id = p.id
  and lower(btrim(v.size)) not in ('one size', 'default', '')
);
alter table public.product_images add column view text;
alter table public.product_images add column color text;
alter table public.product_images add constraint image_view_valid
  check(view is null or view in ('front','back','top','bottom'));
alter table public.product_images add constraint image_color_valid
  check(color is null or length(btrim(color)) between 1 and 40);
create unique index product_image_designated_view on public.product_images
  (product_id, view, (coalesce(lower(btrim(color)),''))) where view is not null;

create function public.validate_product_image_color() returns trigger
language plpgsql set search_path=public,pg_temp as $$ begin
  if new.color is not null and not exists(select 1 from public.product_variants where product_id=new.product_id and lower(color)=lower(btrim(new.color)))
  then raise exception 'Choose an existing product color'; end if;
  return new;
end $$;
revoke all on function public.validate_product_image_color() from public,anon,authenticated;
create trigger image_color_association before insert or update on public.product_images
for each row execute function public.validate_product_image_color();

create function public.save_product_image(p_product uuid,p_url text,p_alt text,p_position int,p_view text,p_color text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare image_id uuid;
begin
  if not public.can_manage('catalog') then raise exception 'Forbidden'; end if;
  if p_product is null or p_url is null or p_url !~ '^https://' or length(p_url)>2048
    or p_alt is null or length(btrim(p_alt)) not between 1 and 200
    or p_position is null or p_position<0 or p_view is null or p_view not in ('front','back','top','bottom')
    then raise exception 'Invalid image'; end if;
  p_color:=nullif(btrim(p_color),'');
  if p_color is not null and not exists(select 1 from public.product_variants where product_id=p_product and lower(color)=lower(p_color))
    then raise exception 'Choose an existing product color'; end if;
  insert into public.product_images(product_id,url,alt,position,view,color)
  values(p_product,p_url,btrim(p_alt),p_position,p_view,p_color)
  on conflict(product_id,view,(coalesce(lower(btrim(color)),''))) where view is not null
  do update set url=excluded.url,alt=excluded.alt,position=excluded.position,color=excluded.color
  returning id into image_id;
  return image_id;
end $$;
revoke all on function public.save_product_image(uuid,text,text,int,text,text) from public,anon,authenticated;
grant execute on function public.save_product_image(uuid,text,text,int,text,text) to authenticated;

create or replace function public.duplicate_product(p_product uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$ declare old products%rowtype; newid uuid; suffix text:=substr(gen_random_uuid()::text,1,8); v record; newvid uuid; begin
 if not can_manage('catalog') then raise exception 'Forbidden'; end if;
 select * into old from products where id=p_product for share; if not found then raise exception 'Product not found'; end if;
 insert into products(category_id,name,slug,sku,description,price,sale_price,status,tags,featured,seo_title,seo_description,has_sizes) values(old.category_id,old.name||' (copy)',old.slug||'-'||suffix,old.sku||'-'||suffix,old.description,old.price,old.sale_price,'draft',old.tags,false,old.seo_title,old.seo_description,old.has_sizes) returning id into newid;
 for v in select * from product_variants where product_id=old.id loop insert into product_variants(product_id,sku,size,color,price,active) values(newid,v.sku||'-'||suffix,v.size,v.color,v.price,v.active) returning id into newvid; insert into inventory(variant_id,on_hand) values(newvid,0); end loop;
 insert into product_images(product_id,url,alt,position,view,color) select newid,url,alt,position,view,color from product_images where product_id=old.id;
 return newid;
end $$;
