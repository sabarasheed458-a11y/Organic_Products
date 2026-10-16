# Production readiness audit — 12 October 2026

**Local implementation verified; production launch remains unverified.** This workspace has only `.env.example`, no configured hosted Supabase connection, and no deployment credentials. Tests do not impersonate a hosted login or fabricate payment collection. No service-role key was requested, printed or added. All changes stay inside `commerce/`; pre-existing parent-repository deletions were preserved.

## Issues fixed in this audit

| Failure | Root cause | Smallest fix and evidence |
| --- | --- | --- |
| Staff schedule shifted with browser timezone | UTC-labelled `datetime-local` values were passed to `new Date(value)`, which interprets a timezone-free value in local time | Parse explicitly as UTC and reject impossible dates; editor regression tests |
| Failed dashboard queries displayed zero sales, no stock warnings or no activity | Supabase `error` was ignored while `data ?? []` supplied a misleading empty result | Check each scoped query and fail with a generic retryable error; tests inject failures into orders, inventory and audit queries |
| Failed customer histories, category lookup, saved checkout addresses or order tracking appeared empty; detail failures became 404 | Missing checks or `error || !data` conflated transport errors with absence | Check errors before deciding empty/404; owner filters remain unchanged; server-view failure tests |
| Failed order timeline suggested insufficient permissions | RPC error was ignored and empty state was inaccurately worded | Check the RPC result and show a factual empty state; timeline failure regression |
| Late COD collection after return was inaccessible in the UI | UI allowed collection only for delivered orders while the secured RPC also permits returned/unpaid orders | Match that existing state rule, distinguish collection from refund, require confirmation and reason; unit and real database reconciliation tests |
| Checkout or admin/account forms stayed busy after interrupted requests | Rejected Server Action transport promises bypassed busy-state reset | Safe transport result wrapper for account/auth/admin forms; checkout `finally`; interrupted contact/login browser tests |
| Checkout could fail before submitting or lose its confirmation navigation when browser storage threw | Session-storage writes/removal were unguarded | Persist a validated retry key before submission, fail closed if persistence fails, retain the key after transport failures, and tolerate cleanup failure after confirmed success; retry-identity tests |
| Prototype-named management routes were treated as registered modules | Scope lookup used an inherited object property | `Object.hasOwn` module allowlist; unknown/prototype module tests |
| Banner-management query errors were silently omitted | Nested banner loader did not inspect `error` | Explicit error check; no changes to scheduling/RLS |

The inquiry-search concern raised during inspection was ruled out: the actual column is `contact_inquiries.name`, so its search implementation was retained. Two expanded tests initially failed because the harness assumed automatically initialized inventory and absolute redirect URLs; the actual design initializes inventory at the first reasoned adjustment and Next.js may return a relative redirect. Those test assumptions were corrected, not application behavior.

## Coverage and its limits

| Area | Executed local coverage | Still requires staging |
| --- | --- | --- |
| Public routes | Production browser requests/rendering for home, collection, search, cart, wishlist, login/register/recovery/reset, about/contact/FAQ, all four policies, missing product/content routes, robots, sitemap and icon; security response headers | Real published product detail/gallery, populated server-rendered catalog and images from Storage |
| Customer routes | Anonymous redirects for account/profile, addresses, orders, checkout, tracking and confirmation; server-view ownership filters and failure handling; database isolation between two customers | Successful authenticated browser navigation, session refresh/recovery and checkout confirmation |
| Admin modules | All 12 module functions construct views with mocked transport and request their required scope: products, categories, inventory, orders, customers, inquiries, coupons, promotions, content, settings, reports, staff. Dashboard scope filtering/errors, detail-query failures, and anonymous denial for every module/detail route are tested | Full authenticated browser interaction for each staff role, realistic populated data and responsive management layouts |
| Product CRUD/variants | Real PostgreSQL catalog staff insert/update/publish/archive/delete of an unused product/variant; unique SKU/size-colour constraints; invalid sale prices; inactive variant/public isolation; duplicate draft/zero stock; bulk operations; immutable parent and protected historical references | Persisted UI form submissions, browser refresh and images on each state |
| Image lifecycle | Action MIME/size/signature rejection, three allowed-format header fixtures, scoped upload and metadata insertion, insertion-failure cleanup, metadata removal; real database Storage path/role/reference policies | Actual Storage HTTP uploads/downloads/byte limits, real complete JPEG/PNG/WebP files, Next image optimization and rollback/orphan cleanup under network failure. Header fixtures prove transport/signature behavior, not full raster decoding |
| Cart/wishlist | Guest browser quantities, stock limits, removal and reload persistence with explicitly mocked catalog APIs; real database atomic authenticated persistence and ownership; failed reads cannot erase remote shopping data | Guest-to-account merge with real auth, multi-device updates and gateway failures |
| Checkout/coupons/shipping | Actual migrated PostgreSQL totals, variant pricing, snapshots, stock deduction, duplicate retries/input mismatch, rejected partial orders, percentage/fixed/quantity coupons, quote without redemption, global/per-customer limits, expired/future/disabled coupons, product/category/customer restrictions and minimum subtotal, malformed eligibility, city delivery fee/restriction, COD disable/max total | Real browser checkout and native gateway/JWT verification; coupon and last-unit contention across independent connections |
| Orders/payment/inventory | All allowed fulfillment edges, cancellation from pending/confirmed/processing, illegal/repeated transitions, once-only restock, COD collection/refund including late collection after return, payment identity; set/add/subtract adjustments and reserved-stock constraints | Real courier tracking and collection/refund reconciliation. No online payment provider or signed webhook exists |
| Content/settings | Real database edits to pages/policies, announcement/name/support details, navigation/footer, homepage order, live/future banners, promotions; draft/schedule public filtering, customer write denial, invalid configuration constraints | Saved edits reflected in actual hosted pages, category/banner/logo media references, staff schedule boundaries |
| Permissions/security | Actual database roles for anonymous, two customers, owner, manager, catalog manager and order manager; active-account checks, forbidden cross-owner access/direct finance writes, role escalation denial, storage restrictions and private RPC grants | Hosted REST/RPC role/JWT tests, native Auth confirmation/recovery/SMTP and production default-grant drift |

The PGlite harness executes all eight migration files with small Auth/Storage schema shims and excludes only the unsupported pgcrypto extension-loading statement. Migration 002 is applied after the harness Storage schema exists. The queued last-unit calls use one embedded connection; they do not establish cross-connection locking behavior. Server-view and Action transport tests are labelled as mocked. Public-browser tests run a production Next server without credentials; empty/setup states are valid local behavior, not a functioning hosted store.

## Actual verification commands

Environment: Windows PowerShell, Node **24.20.0**, npm **11.19.0**, installed Edge via the existing Playwright configuration. Test results below are updated only after command completion.

| Command (from `commerce/`) | Final result |
| --- | --- |
| `npm.cmd run typecheck` | Passed: exit 0, no diagnostics |
| `npm.cmd run lint` | Passed: exit 0, no warnings/errors |
| `npm.cmd test` | Passed: 65 tests, 7 files |
| `npm.cmd run test:db` | Passed: 55 tests, 2 files (34 commerce + 21 security) |
| `npm.cmd run build` | Passed: production compilation, TypeScript, prerendering and route generation |
| `npm.cmd run test:e2e` | Passed: 36 tests across desktop/tablet/mobile, including interrupted requests and every admin anonymous redirect |
| `npm.cmd audit --omit=dev` | Passed: 0 reported vulnerabilities |

The earlier 33-test browser run had 30 passes and three failures caused by relative-URL handling in the new assertion. The final revised 36-test suite passed in 1.3 minutes. The package audit is a point-in-time dependency check, not a security certification. No final command failed; earlier failures and their corrections are documented above.

## Remaining production risks

- **Hosted setup and live acceptance are outstanding.** No authenticated browser CRUD, actual Storage HTTP, SMTP delivery, production backup restore, Vercel invocation/body limits or independent-connection checkout race was executed. Follow [live acceptance](ACCEPTANCE.md) before opening checkout publicly.
- Migrations 007/008 from the [security audit](SECURITY-AUDIT.md) remain unapplied to a hosted database. Review legacy duplicate payments, nullable coupon targets and malformed settings with [security-preflight.sql](../scripts/security-preflight.sql). NOT VALID constraints protect future changes but do not certify every historical row.
- Draft photo URLs in the public bucket are publicly retrievable. Referenced media is protected from staff overwrite/removal; metadata removal does not delete the object bytes. A separate private-draft publishing workflow and reviewed orphan cleanup remain separate work.
- Anonymous contact has a shared database quota; an attacker can exhaust it for other visitors. Native SSR Auth requests also share server-IP rate buckets. Configure trustworthy visitor-aware ingress limits/CAPTCHA without trusting caller RPC headers or introducing service-role credentials.
- Reports are bounded at 5,000 orders, dashboard at 1,000, customer detail at 100 (now disclosed). Current-category reports reflect the current product category; immutable item snapshots preserve price/name/quantity. Promotions are administrative records linked to coupons, not a separate discount engine. Reviews have schema/access policies but no customer submission/moderation UI.
- COD and courier operations are manual. Returns restock inspected whole orders, not partial/damaged returns. There is no tax engine, automatic order expiry, online provider, courier API or fulfillment-email integration. Publish actual policies, contact details and licensed photography before launch.
- Existing CSP permits inline scripts/styles for Next rendering; nonce-based tightening would require a separate tested implementation. The current headers deny framing and constrain images/connections to Supabase. Self-hosted/custom Supabase domains need explicit reviewed CSP/image allowlist changes.

## Exact deployment sequence

1. Use a separate **dedicated staging Supabase project** first. Existing migration 001 revokes schema-wide privileges, so do not install it into an unrelated shared project without reviewing existing ACLs. Back up the database and Storage objects and test restoration. Storage bytes are not included in database backups. [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups).
2. From this directory, reproduce the checks on the deployment machine using the committed lockfile:

   ```powershell
   cd C:\Users\pc\Desktop\Menu\commerce
   npm.cmd ci
   npm.cmd run typecheck
   npm.cmd run lint
   npm.cmd test
   npm.cmd run test:db
   npm.cmd run build
   npm.cmd run test:e2e
   npm.cmd audit --omit=dev
   ```

   Stop on a nonzero exit code. The audit used the already-installed dependencies; a clean CI installation on the hosting platform remains an additional deployment check. Match Node 24.x to the audited runtime, and set `PLAYWRIGHT_EXECUTABLE_PATH` if Edge is not installed at the configured Windows location.
3. Configure Vercel **Root Directory = `commerce`**, Next.js framework, install command **`npm ci`**, build command **`npm run build`**, and Node **24.x**, which is a [supported Vercel runtime](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions). Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (publishable or legacy anon only), and `NEXT_PUBLIC_SITE_URL=https://YOUR_STAGING_DOMAIN`. These values must be set before the build; never add a service-role/secret API key. Create a staging deployment with the updated envelope-aware application code before migrating an existing six-migration database.
4. In Supabase Auth, set Site URL to that exact HTTPS origin and allow `https://YOUR_STAGING_DOMAIN/auth/callback` plus `https://YOUR_STAGING_DOMAIN/auth/callback?next=/reset-password`. Keep email confirmation enabled; configure production SMTP, disable email-provider link rewriting if it damages callbacks, set appropriate endpoint limits and verify confirmation/recovery links. [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod).
5. Run the preflight in the **trusted staging SQL editor**. Review aggregate inconsistencies, correct them through audited operations, and then inspect the linked migration history using the installed Supabase CLI:

   ```powershell
   supabase login
   supabase link --project-ref YOUR_STAGING_PROJECT_REF
   supabase migration list
   supabase db push --dry-run
   supabase db push
   supabase migration list
   ```

   `supabase` denotes the installed CLI; use `supabase.cmd` if your Windows installation exposes that executable. For a new dedicated project, apply all eight in order. For an existing project with 001–006 recorded, the dry run must show only 007/008. If historical migrations were applied manually without history, reconcile the recorded history deliberately; do not rerun 001 or use a schema reset. Do not run `db push` until the dry run/history identify the intended project and pending migrations. [Supabase CLI workflow](https://supabase.com/docs/guides/local-development/cli-workflows).
6. Register and confirm the initial owner, then promote its verified Auth UUID using the trusted SQL editor:

   ```sql
   update public.profiles set role = 'owner'
   where id = 'CONFIRMED_AUTH_USER_UUID';
   ```

   Use owner-only application tools for later staff permissions. Do not seed production; `supabase/seed.sql` is development-only.
7. In staging, perform all [live acceptance checks](ACCEPTANCE.md): two customers and each staff role; real product CRUD/variants/photography; populated cart/checkout/coupon/confirmation; all order/payment states; settings/content publication; Auth email/recovery; direct REST/RPC ownership checks; two independent competing purchases. Capture resulting order/payment/stock ledger records and HTTP statuses. Validate reviewed legacy NOT VALID constraints afterward as described in the security audit.
8. Repeat the reviewed configuration and migration sequence for the **production** project. Re-link explicitly to its project reference and inspect history/dry-run again. For an existing store, use a checkout maintenance window, take a fresh backup, deploy application code first, then pending migrations. Set the production canonical HTTPS domain and callbacks; rebuild/redeploy after changing public environment variables.
9. Configure trusted ingress throttling, production SMTP, alerting/log review, database backups/PITR as appropriate and independent Storage backups. Publish legal/support content and real products. Verify canonical links, sitemap, robots, authenticated routes, responsive checkout and real image optimization on the deployed origin. Open public checkout only after successful hosted acceptance; record release and backup identifiers. No remote deployment or database mutation was performed by this audit.
