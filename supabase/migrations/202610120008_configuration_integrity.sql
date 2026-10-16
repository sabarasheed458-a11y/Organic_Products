-- Pure configuration validation; no existing row is rewritten or deleted.
create function public.valid_store_configuration(p_zones jsonb,p_nav jsonb,p_footer jsonb,p_sections jsonb)
returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare entry jsonb; links jsonb; seen text[]:='{}'; city text;
begin
 if jsonb_typeof(p_zones) is distinct from 'array' or jsonb_typeof(p_nav) is distinct from 'array' or jsonb_typeof(p_footer) is distinct from 'array' or jsonb_typeof(p_sections) is distinct from 'array' then return false; end if;
 if jsonb_array_length(p_zones)>100 or jsonb_array_length(p_nav)>12 or jsonb_array_length(p_footer)>12 or jsonb_array_length(p_sections)>3 then return false; end if;
 for entry in select value from jsonb_array_elements(p_zones) loop
  if jsonb_typeof(entry) is distinct from 'object' or jsonb_typeof(entry->'city') is distinct from 'string' or length(trim(entry->>'city')) not between 2 and 120 or jsonb_typeof(entry->'fee') is distinct from 'number' or (entry->>'fee') !~ '^(0|[1-9][0-9]*)$' then return false; end if;
  if (entry->>'fee')::numeric>9007199254740991 then return false; end if;
  city:=lower(trim(entry->>'city'));if city=any(seen) then return false; end if;seen:=array_append(seen,city);
 end loop;
 foreach links in array array[p_nav,p_footer] loop for entry in select value from jsonb_array_elements(links) loop
  if jsonb_typeof(entry) is distinct from 'object' or jsonb_typeof(entry->'label') is distinct from 'string' or length(entry->>'label') not between 1 and 40 or jsonb_typeof(entry->'href') is distinct from 'string' or (entry->>'href') !~ '^/(?!/)[a-zA-Z0-9/?=&_-]*$' then return false; end if;
 end loop;end loop;
 if exists(select 1 from jsonb_array_elements(p_sections) x where jsonb_typeof(x.value) is distinct from 'string' or x.value#>>'{}' not in ('featured','categories','story')) then return false; end if;
 if (select count(distinct value) from jsonb_array_elements(p_sections))<>jsonb_array_length(p_sections) then return false; end if;
 return true;
end $$;
revoke all on function public.valid_store_configuration(jsonb,jsonb,jsonb,jsonb) from public;
grant execute on function public.valid_store_configuration(jsonb,jsonb,jsonb,jsonb) to anon,authenticated;
alter table public.store_settings add constraint store_configuration_valid check(public.valid_store_configuration(shipping_zones,navigation,footer_links,homepage_sections)) not valid;
alter table public.banners drop constraint banners_link_check;
alter table public.banners add constraint banner_link_internal check(link ~ '^/(?!/)[a-zA-Z0-9/?=&_-]*$') not valid;
create function public.prevent_category_cycle() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('commerce:category_parents',0));
 if exists(with recursive ancestors as (
  select id,parent_id from public.categories where id=new.parent_id
  union select c.id,c.parent_id from public.categories c join ancestors a on a.parent_id=c.id
 ) select 1 from ancestors where id=new.id) then raise exception 'Category hierarchy cannot contain a cycle'; end if;
 return new;
end $$;
revoke all on function public.prevent_category_cycle() from public,anon,authenticated;
create trigger category_parent_no_cycles before insert or update of parent_id on public.categories for each row execute function public.prevent_category_cycle();
-- Support ownership/deletion joins on the remaining frequently used FK columns.
create index addresses_user_idx on public.addresses(user_id);
create index categories_parent_idx on public.categories(parent_id);
create index inventory_movements_actor_idx on public.inventory_movements(actor_id) where actor_id is not null;
create index audit_actor_idx on public.admin_audit_logs(actor_id) where actor_id is not null;
