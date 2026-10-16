# Checkout authentication and registration diagnosis — 12 October 2026

## Confirmed causes

The configured project's public Auth settings endpoint returned HTTP 200 with `external.email=false`, `disable_signup=false`, and `mailer_autoconfirm=false`. A controlled sign-in diagnostic returned **HTTP 422 / `email_provider_disabled`**; signup returned **HTTP 400 / `email_provider_disabled`**, with neither a user nor a session. Credentials were never printed. No account was created by that rejected signup. Existing owner/confirmed/active profile status does not enable a disabled authentication provider.

The application previously converted every password sign-in error to “Email or password is incorrect.” The failure is therefore **disabled email authentication in the connected project**, not evidence that the supplied password is wrong. Registration also cannot currently succeed against this provider configuration. This audit did not alter dashboard settings, credentials, projects, profiles or email confirmation requirements.

Unauthenticated checkout correctly called `requireUser('/checkout')` and redirected to login. The broken return flow was elsewhere: the login-to-register/back links discarded `next`, signup confirmation URLs discarded it too, signup ignored its returned session, and failed callbacks discarded the destination. The server and proxy already use verified `getUser()` with cookie refresh; they were not replaced or bypassed.

## Targeted changes

| File | Change |
| --- | --- |
| `src/actions/auth.ts` | Classify Auth errors by safe code/status; keep one request-scoped client; verify current user and active profile before reporting an authenticated login or immediate-session signup; distinguish pending confirmation; carry a validated destination into the confirmation URL |
| `src/lib/security/auth-errors.ts` | Safe fixed messages for invalid credentials, confirmation, disabled provider, throttling and unavailable service; no arbitrary SDK messages, email/account disclosure or credentials |
| `src/lib/validation.ts` | Normalize auth email by trimming and lowercasing; preserve passwords byte-for-byte |
| `src/components/account/auth-form.tsx` | Preserve safe return paths between login/register; navigate only after an explicitly verified authenticated result; display callback failure guidance using existing message styling |
| `src/app/login/page.tsx` | Forward callback error marker to the existing form |
| `src/app/auth/callback/route.ts` | Retain validated destination after successful code exchange or failed exchange; external destinations still rejected |
| `src/components/storefront/shopping-provider.tsx` | Persist guest-to-account handoff before removing the guest copy; retain it on failure. Existing variant IDs, quantities, merge calculations and cart limits remain unchanged |
| `next.config.ts` | Disable Next's development Server Function invocation logs, which previously printed submitted password arguments. Other logging and production CSP remain unchanged |
| `tests/unit/actions.test.ts`, `tests/unit/auth-callback.test.ts`, `tests/unit/auth-session.test.ts`, `tests/e2e/public.spec.ts` | Regressions for messages, normalization, confirmation/session branches, callback destinations, session restoration, and guest cart/return-link persistence |

No schema migration, catalog, pricing, inventory, admin UI, styling or RLS changes are part of this fix. Order success still requires the existing authenticated atomic database checkout; arriving at checkout or confirmation is not used as proof of an order.

## Verification

- Unit tests: **88 passed**. Auth transport/session tests are explicitly mocked and cannot establish hosted email delivery or actual password verification.
- Database tests: **56 passed**, including customer-order isolation, authoritative pricing, stock limits, protected mutations and idempotency.
- TypeScript, lint and production build: passed.
- Final browser rerun: **39 passed** across desktop/tablet/mobile in 1.1 minutes. The first added checkout regression used the wrong accessibility role (button instead of the existing enabled link); its timeout was an assertion defect, not an application change. The corrected test targets the existing link and confirms cart quantities and destination survive the authentication links.
- Browser tests use a dedicated local production server with process-only placeholder Supabase configuration and explicitly mocked catalog fixtures. `.env.local` was not changed. This isolates UI regressions from the confirmed disabled hosted provider.

| Requested scenario | Evidence / remaining limit |
| --- | --- |
| New registration | Hosted attempt confirmed provider-disabled failure; successful signup branch unit-tested, real success blocked until provider enabled |
| Login before confirmation | Safe `email_not_confirmed` branch unit-tested; real unconfirmed account flow pending |
| Confirmation then login | Mocked successful exchange/session/profile verified; real email link/login pending |
| Confirmation disabled | Immediate-session signup unit-tested; no hosted confirmation setting was weakened |
| Wrong password / unregistered email | Same fixed `invalid_credentials` response tested; hosted provider currently rejects before credential checking |
| Session reload / authenticated checkout | Repeat verified-user route-guard reads tested without redirect; real cookie reload pending |
| Guest variants/quantities and checkout redirect | Production-browser cart/redirect/link regression; catalog fixture explicitly mocked |
| Login returns to checkout | Safe destination and verified-success result tested; real successful login/cart handoff pending |
| Registration from checkout | Return links and confirmation URL tested; real confirmation pending |
| Other customers' orders | Actual PostgreSQL RLS ownership tests pass |
| Stock/prices/order rules | Actual migrated database suite passes; no public checkout grant added |
| Password reset | Recovery error handling and verified-session password update tested; real SMTP/recovery link pending |
| Local and deployed environments | Local production build/browser tests and actual configured hosted Auth error probes; no deployed application origin available |

## Required dashboard steps

1. Open the **same Supabase project used by `commerce/.env.local`**, then **Authentication → Providers / Sign In & Providers → Email**. Enable the Email provider and save. Keep **Confirm email enabled**. This enables real email/password authentication; it does not assign staff roles or bypass password verification. [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords).
2. In **Auth URL Configuration**, verify Site URL `http://localhost:3000` for development. Allow the callback with its supported return parameters, including:
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3000/auth/callback?next=%2Fcheckout`
   - `http://localhost:3000/auth/callback?next=%2Faccount`
   - `http://localhost:3000/auth/callback?next=/reset-password`
   Add corresponding exact HTTPS URLs for the deployed origin; set `NEXT_PUBLIC_SITE_URL` to that origin before its build. The existing guard constrains destinations even when query parameters are supplied. The hosted allowlist and SMTP configuration are not available through the public key and could not be independently verified. [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).
3. Configure actual email delivery. Use an inbox you control rather than `admin@example.com`. Register once, open its confirmation link in the same browser, then verify login, reload and checkout with the preserved guest bag. For an existing account, use its real current password or recovery; do not create another account automatically after a failed login.
4. Restart `npm run dev` after the config change to stop development action-argument logging. Verify that `email_provider_disabled` no longer occurs. Re-test checkout with a new confirmed customer and cross-customer order denial. No additional schema change is required.

The code defects and misleading error handling are corrected locally. Successful hosted registration/login/confirmation cannot be claimed until the provider configuration is corrected and those live checks are executed. This work does not certify production authentication.
