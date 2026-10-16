-- Add uploads for category artwork, banners and branding without broadening
-- product-upload privileges or permitting replacement of referenced assets.
create policy content_image_staff_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'product-images'
  and name ~ '^(categories|banners|branding)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  and case split_part(name, '/', 1)
    when 'categories' then public.can_manage('catalog')
    when 'banners' then public.can_manage('settings')
    when 'branding' then public.can_manage('settings')
    else false
  end
);

create policy content_image_delete_scope on storage.objects
as restrictive for delete to authenticated using (
  case when bucket_id = 'product-images'
    and split_part(name, '/', 1) in ('banners', 'branding')
    then public.can_manage('settings')
    else true
  end
);
