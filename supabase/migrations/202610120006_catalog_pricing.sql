alter table products add column effective_price bigint generated always as (coalesce(sale_price,price)) stored;
create index products_effective_price_idx on products(status,effective_price);
-- An account disabled by an owner cannot continue using customer write policies.
alter policy address_owner on addresses using(user_id=auth.uid() and staff_role() is not null) with check(user_id=auth.uid() and staff_role() is not null);
alter policy cart_item_owner on cart_items using(staff_role() is not null and exists(select 1 from carts where carts.id=cart_id and user_id=auth.uid())) with check(staff_role() is not null and exists(select 1 from carts where carts.id=cart_id and user_id=auth.uid()));
alter policy wishlist_item_owner on wishlist_items using(staff_role() is not null and exists(select 1 from wishlists where wishlists.id=wishlist_id and user_id=auth.uid())) with check(staff_role() is not null and exists(select 1 from wishlists where wishlists.id=wishlist_id and user_id=auth.uid()));
