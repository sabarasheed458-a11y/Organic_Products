# Admin/customer authentication audit — 12 October 2026

## Evidence and confirmed cause

The reported symptom was clarified as **login still says credentials are incorrect**, rather than a customer gaining admin access. An isolated direct Supabase password sign-in against the configured project for the supplied login email returned **HTTP 400 / `invalid_credentials`**, without an authenticated session. Input was provided through non-echoing stdin, never printed, saved in a file, or placed in a process command line. The temporary nonsecret diagnostic script was removed. No password reset, account creation, role update or business-record mutation was performed by this check.

The connected project is `iagltkeieojznnqeorky`; its Email provider is now enabled, signup is allowed, and email confirmation remains enabled. Public-key validation succeeded. The site's server-side clients and refresh proxy all use that same pair of existing environment settings.

**The current login rejection occurs before profile/role authorization.** It does not demonstrate an admin/customer architecture conflict. Supabase deliberately does not distinguish an absent account from an incorrect password in this response. The user reports that the email is confirmed, but the requested trusted SQL diagnostic result was not supplied, so password presence, email identity and the account's profile in this exact project cannot be independently established. No speculative promotion, demotion, replacement account or auth-system rewrite was made.

One separate defect was reproduced by a failing regression: `signOut()` ignored a returned Supabase error and redirected to `/` anyway. This could make an unsuccessful sign-out look successful while the prior session remained available. The fix checks that result and throws a fixed safe failure message instead of redirecting. Successful sign-out still uses the same existing SDK operation and homepage redirect.

## Existing architecture retained

- There is one Supabase Auth project and one cookie-based browser identity. The existing admin entry is `/login?next=/admin`; customer login is `/login` or `/login?next=/checkout`. These use the same form/action. There is no separate `/admin/login` implementation to replace.
- `src/lib/supabase/server.ts` creates request-scoped SSR clients. `src/proxy.ts` refreshes Auth cookies in the request and response. Multiple request-scoped instances are intentional, not independent sessions. There are no competing browser auth clients, role caches or `onAuthStateChange` listeners in this app.
- Password sign-in verifies with Supabase first, then checks the current verified user's active profile. Admin route helpers read that user's trusted database role; a URL, browser metadata or local storage cannot grant administrative permission.
- Supported roles remain `customer`, `owner`, `manager`, `catalog_manager`, and `order_manager`. Public signup sends only a name; the database trigger creates a customer profile and shopping containers. Login and logout do not write roles. Existing owner accounts are not demoted by visiting customer pages.
- Customer `/admin` access redirects to `/account`. Staff modules/actions check their scope; the export handler checks settings permission. RLS limits customer addresses/orders/shopping data to ownership and prevents self-promotion and direct financial/inventory writes.
- Existing active staff may use their own storefront cart/account/checkout under the existing business rules. Logging in as another account switches the shared browser identity; it does not change the original account's database role. Use a separate browser profile/private window when testing admin and customer simultaneously.

## Before and after

Before: a failed SDK sign-out returned to the homepage without checking whether it succeeded. After: returned errors produce a safe explicit failure and no success redirect; actual success retains the existing redirect. Login, signup, callback, session refresh, customer ownership, cart merge and order creation behavior were preserved in this audit.

`invalid_credentials` remains an appropriate rejection when Supabase rejects the supplied login combination. This fix does not pretend that role changes can repair a password or create a session without verification.

## Files changed

| File | Purpose |
| --- | --- |
| `src/actions/auth.ts` | Check the logout result; emit only whitelisted Auth code/status through the existing safe diagnostic helper and fail explicitly before redirecting |
| `tests/unit/logout.test.ts` | Reproduce the original silent logout failure and verify the success/failure branches |
| `tests/unit/auth-authorization.test.ts` | Verify all staff scopes, customer denial, metadata-role spoof denial, actual export-handler gates, unchanged roles and protected guards after admin/customer mock logout |
| `scripts/auth-account-preflight.sql` | Read-only account flags/role check for the trusted SQL editor; no password/hash output |
| `docs/ADMIN-CUSTOMER-AUTH-AUDIT.md` | Evidence, scope, verification and remaining account recovery steps |

No schema migration or dashboard configuration change is required by the code fix. Existing users, roles, products, orders, prices, inventory, cart items and RLS were not changed.

## Verification

| Command | Actual result |
| --- | --- |
| `npm.cmd test` | **104 passed**, 11 files |
| `npm.cmd run test:db` | **57 passed**, 2 files, actual ten migrations/RLS/transactions in PGlite |
| `npm.cmd run typecheck` | Passed |
| `npm.cmd run lint` | Passed |
| `npm.cmd run build` | Passed: production compilation, TypeScript, route generation |
| `npm.cmd run test:e2e` | **39 passed**, desktop/tablet/mobile, 1.9 minutes; isolated local production server with process-only placeholder Supabase settings and explicitly mocked catalog fixtures |

The logout failure test first failed with `REDIRECT:/` where a safe rejection was expected; it passes after the targeted fix. Auth/authorization transport tests use mocked verified-user/profile/SDK responses, not an actual successful hosted login. The database tests exercise real database roles and customer isolation, protected product/stock operations, shopping persistence, checkout pricing, stock and order transactions. The queued PGlite competing-purchase tests are not independent hosted connections.

| Requested regression | Evidence / boundary |
| --- | --- |
| Admin login/dashboard permissions | Verified-user/profile staff tests for all four staff roles; hosted supplied login is currently rejected, so successful hosted admin login is not claimed |
| Customer login and intended checkout | Existing Auth success/return tests and production-browser guest return flow; real successful customer login still needs an available valid account |
| Customer direct admin/API denial | Real server guard and export handler unit tests, database permission tests and anonymous production-browser route denial |
| Admin role survives storefront/customer pages | Tests read trusted profile role without UPDATE, despite conflicting user metadata; no role-writing login code exists |
| Admin/customer logout | SDK success/failure branches and subsequent protected guards tested with a mock session; hosted cookie logout still needs staging verification |
| Invalid credentials / confirmation | Fixed error-code branches tested; actual rejected sign-in observed; confirmation/session branches mocked |
| Session refresh | Repeat verified-user route reads and existing SSR proxy/cookie implementation reviewed; hosted cookie refresh not newly verified |
| Signup cannot create admins | Actual database signup-metadata regression and column/RPC permission tests |
| Cross-customer order access | Actual RLS isolation tests |
| Product management / inventory / checkout / cart | Actual migrated PostgreSQL regression suite passes; business behavior unchanged |
| Password reset | Existing recovery failure and verified password-update tests pass; actual inbox recovery remains manual |
| Local and deployed origins | Local production build/browser suite and configured hosted Auth error probe; no deployed application origin was provided |

## Required next steps for the login rejection

1. In the **SQL Editor of project `iagltkeieojznnqeorky`**, run [auth-account-preflight.sql](../scripts/auth-account-preflight.sql), replacing `YOUR_LOGIN_EMAIL` with the email being submitted. Share only the resulting booleans/role/active fields. No row indicates that the account is not present in this project; `password_set=false` indicates that password login is not currently configured for that account. These require account recovery/configuration, not a role overwrite.
2. For an existing confirmed account with a password, use `/forgot-password` and the inbox controlled by the account owner to set a new known password. If email sending is rate-limited, wait for the quota or configure production SMTP; do not disable confirmation or authentication. Do not paste passwords into chat, SQL scripts or logs. [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords).
3. Retry the existing admin login URL after recovery. Confirm the trusted role is one of the authorized staff roles; if it is `customer`, review intended access through the existing owner-controlled staff tools instead of automatically promoting it. Repeat refresh/logout and a separate customer's checkout/ownership tests in staging.
4. Deploy the code normally after the checks. The existing environment names, project, URL allowlist and RLS remain in place. No database reset or new Supabase project is needed.

Successful native sign-out clears the SDK session, but an already copied JWT can remain valid until its expiration; this audit does not claim immediate revocation of every previously issued access token. [Supabase sign-out behavior](https://supabase.com/docs/guides/auth/signout).
