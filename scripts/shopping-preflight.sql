-- Read-only; run in the trusted Supabase SQL Editor.
-- Aggregate counts only: no account IDs, email addresses or cart contents.
select
  count(*) as profile_count,
  count(*) filter (where not exists (
    select 1 from public.carts c where c.user_id = p.id
  )) as profiles_missing_cart,
  count(*) filter (where not exists (
    select 1 from public.wishlists w where w.user_id = p.id
  )) as profiles_missing_wishlist
from public.profiles p;
