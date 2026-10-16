-- DEVELOPMENT ONLY. Apply after migrations in a disposable project.
-- Original sample catalog, no copied photographs or real customer data.
insert into categories(name,slug,description,position) values
 ('Loungewear','loungewear','Comfort, considered.',0),
 ('Sleepwear','sleepwear','For slower evenings.',1),
 ('Everyday essentials','everyday-essentials','Your softest foundations.',2)
on conflict(slug) do nothing;
insert into products(name,slug,sku,description,price,sale_price,status,featured,category_id,tags)
select 'The Sunday Lounge Set','sunday-lounge-set','MM-SUNDAY','A relaxed two-piece silhouette for unhurried mornings. Soft cotton fabric, a comfortable waistband, and an easy fit.',650000,550000,'published',true,id,array['lounge','cotton'] from categories where slug='loungewear'
union all select 'The Evening Robe','evening-robe','MM-EVENING','An effortless wrap shape with an adjustable tie. A simple layer for your evening ritual.',480000,null,'published',true,id,array['robe'] from categories where slug='sleepwear'
union all select 'The Soft Rib Tank','soft-rib-tank','MM-RIB','A soft ribbed essential with a timeless neckline. Layer it, lounge in it, make it yours.',220000,null,'published',true,id,array['essential','rib'] from categories where slug='everyday-essentials'
union all select 'The Cloud Sleep Set','cloud-sleep-set','MM-CLOUD','An easy sleepwear set with a relaxed shirt and comfortable trousers. A little luxury for the end of your day.',590000,490000,'published',true,id,array['sleep'] from categories where slug='sleepwear'
on conflict(slug) do nothing;
insert into product_variants(product_id,sku,size,color) select p.id,p.sku||'-'||s.size||'-IV',s.size,'Ivory' from products p cross join (values('S'),('M'),('L')) s(size) on conflict(sku) do nothing;
-- Initial development inventory is also ledgered.
insert into inventory(variant_id,on_hand) select id,20 from product_variants on conflict do nothing;
insert into inventory_movements(variant_id,delta,reason) select i.variant_id,20,'Development seed opening stock' from inventory i where not exists(select 1 from inventory_movements m where m.variant_id=i.variant_id);
insert into banners(title,subtitle,link) select 'Made for your every day.','Soft textures. Effortless silhouettes. Thoughtful pieces for all your moments.','/collections/all' where not exists(select 1 from banners);
insert into pages(slug,title,content) values('about-us','The everyday, elevated.','Maison Mira brings together considered essentials, soft textures, and effortless shapes. Pieces to feel at home in, wherever life takes you.') on conflict(slug) do nothing;
-- Publish your actual policies and upload licensed or original product photographs
-- in admin before launch. Development seed intentionally invents no legal promises.
