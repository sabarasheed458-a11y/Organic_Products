-- READ ONLY. Run in the SQL Editor of the project connected in .env.local.
-- Replace YOUR_LOGIN_EMAIL with the address you submit on the login form.
-- This deliberately exposes neither the password nor its stored hash.
select
  u.email_confirmed_at is not null as email_confirmed,
  coalesce(length(u.encrypted_password), 0) > 0 as password_set,
  p.role,
  p.active,
  exists(select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email') as email_identity
from auth.users u
left join public.profiles p on p.id = u.id
where lower(u.email) = lower(trim('YOUR_LOGIN_EMAIL'));
