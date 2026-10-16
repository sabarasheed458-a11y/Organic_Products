insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy product_image_public on storage.objects for select using(bucket_id='product-images');
create policy product_image_staff_insert on storage.objects for insert to authenticated with check(bucket_id='product-images' and public.can_manage('catalog'));
create policy product_image_staff_update on storage.objects for update to authenticated using(bucket_id='product-images' and public.can_manage('catalog')) with check(bucket_id='product-images' and public.can_manage('catalog'));
create policy product_image_staff_delete on storage.objects for delete to authenticated using(bucket_id='product-images' and public.can_manage('catalog'));
