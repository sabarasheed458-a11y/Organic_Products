# Product options and guest checkout — 14 October 2026

The existing product route, normalized variants, cart identity, inventory ledger, order snapshots, COD payments, fulfillment RPCs and permissions are retained. The changes extend those components rather than adding a second ordering system.

## Changes

- `src/components/product/detail.tsx`, `product-image.tsx` and `src/lib/product-options.ts`: explicit size choice for sized products, availability by size/color, optional color selector, designated view order, matching color photos, thumbnails, existing lightbox, Buy now and image fallback. Existing additional photos remain available. Scoped gallery/options styles are in `src/app/globals.css`.
- `src/components/admin/product-editor.tsx`, `bulk-status.tsx`, `src/actions/commerce.ts`: sizing switch, S/M/L variant editing, existing SKU/availability/inventory controls, view/color uploads and metadata editing. Uploading an existing view/color replaces its database image record while preserving other photos. Upload validation and existing storage permissions remain in effect.
- `src/app/checkout/page.tsx`, `src/components/checkout/form.tsx`: guest checkout is the default when signed out; login/register are optional. Saved addresses still load for members. Email is optional; no password or fake Auth user is created.
- `src/lib/security/guest-checkout.ts`, `src/app/order-confirmation/[orderId]/page.tsx`, `src/components/account/order-view.tsx`: private browser access to guest confirmation, guest/member label, contact and existing variant/order information.
- `src/types/index.ts`, `src/lib/validation.ts`: compatible product/image/order fields and validated optional checkout email.

## Database and security

`202610140011_product_options.sql` adds `has_sizes`, image `view` and `color`, unique designated view/color combinations, validated color associations and a catalog-authorized image replacement RPC. It preserves existing image positions and infers sizing from existing variants. Duplication copies variants before color-linked images and retains zero inventory for copies.

`202610140012_guest_checkout.sql` allows guest ownership on existing orders/redemptions with explicit owner-kind checks. Registered checkout keeps its existing RPC contract. Both wrappers use the same private engine with authoritative prices, coupon rules, lock ordering, stock deductions, financial snapshots and payments. Guests receive no direct order-table access. The anonymous RPC validates contact/cart data and has persistent global and per-capability request limits.

The 256-bit guest capability is stored in an HttpOnly, SameSite=Lax cookie, Secure in production, with a 30-day lifetime. Only its SHA-256 hash is stored in the database. Confirmation URLs contain the order ID only. A token cannot read registered orders; a different guest or customer without the matching token cannot read the guest order. No service-role credentials are introduced. RLS and storage policies remain enabled.

## Deployment

1. Back up the connected database and test on a staging project. Confirm migrations 001–010 are already applied.
2. Apply `supabase/migrations/202610140011_product_options.sql`, then `202610140012_guest_checkout.sql`, through the project's normal migration process (`supabase db push` for a correctly linked project), or execute each complete file in order in Supabase SQL Editor. Do not reset the database or rerun old migrations.
3. Deploy this application after both migrations succeed. Run `npm.cmd ci`, `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run test:db`, and `npm.cmd run build`; start with `npm.cmd start` or the existing hosting deployment process. Keep the existing publishable key and HTTPS production site URL. Restart a running development server after updating the app.
4. In admin product editing, review each sizing switch; save it, then configure active size/color variants and inventory. Upload front/back/top/bottom photos and choose an existing color or All colors. Existing images have no designated view until assigned. When renaming a color, update its image associations too; deactivate referenced variants instead of deleting order history.
5. In staging, place one guest and one registered COD order, reload confirmation, try a separate browser, verify inventory once per order, and process fulfillment/payment from admin. Verify native Supabase Storage uploads and Auth email flows against the hosted services.

## Verification boundaries and operational limits

Confirmed automated results: TypeScript passed; lint passed with no warnings; 111 unit tests passed; 63 database tests passed; 39 public regression browser tests passed across desktop/tablet/mobile; 2 purchase-flow browser tests passed across desktop/mobile. The purchase suite includes collection-to-detail navigation, responsive fit, designated thumbnails, lightbox, unavailable sizing, color-specific image switching, two distinct variant cart lines, guest COD ordering, confirmation reload and access denial from another browser.

The final `npm.cmd run build` also passed with exit code 0 after removing the temporary test process environment overrides. The restored build uses the existing `.env.local`; that file was not modified. An initial browser run failed when its build directory was replaced during testing; the stable rerun passed. The existing multi-navigation bag test exceeded its 30-second total timeout under load; its allowance is now 60 seconds, with assertions unchanged.

Automated database tests execute all actual migrations in PGlite with Auth/Storage schema shims. Feature browser tests use the actual Next.js production pages and migrated guest RPCs through a test REST gateway. This validates the application purchase flow and SQL permissions, but does not replace native Supabase/PostgREST/Storage/SMTP or independent-connection concurrency testing. Hosted migrations have not been applied by this task. Existing external Auth credential and email-rate-limit issues require project/account configuration; these changes do not claim to fix them.

Guest confirmation depends on the original browser cookie; clearing it or waiting 30 days removes self-service access. There is no emailed recovery link. Per-guest coupon limits identify the capability, not a verified person; a new browser can receive a new capability. Member-restricted coupons reject guests. Global anonymous throttles (orders 20, quotes 60 per 10 minutes) also cap legitimate traffic and can be exhausted by abusive callers; tune for production volume and add ingress bot protection as appropriate. Retained replaced storage objects require a separate conservative cleanup policy; this task does not delete old assets. The existing store supports English and COD; no new language or online payment integration is introduced.

## Reproducing browser tests

Next.js embeds public environment values at build time. Run builds and browser suites sequentially; never replace `.next` while a server is using it.

For the isolated purchase suite in PowerShell:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:4401'
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture_only_not_a_real_key'
npm.cmd run build
npm.cmd run test:features
```

For the public regression suite, build with `NEXT_PUBLIC_SUPABASE_URL='https://YOUR_PROJECT.supabase.co'` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='YOUR_PUBLISHABLE_KEY'`, then run `npm.cmd run test:e2e`. Both suites use test fixtures rather than live customer orders. Afterwards remove those process-level overrides and rebuild using the real `.env.local`. Neither suite changes that file.

Tests added/updated: `tests/unit/product-options.test.ts`, `product-image.test.ts`, `guest-cookie.test.ts`, `actions.test.ts`, `admin-readiness.test.ts`; `tests/integration/product-guest.test.ts`, `database.test.ts`; `tests/features/product-guest.spec.ts`, `tests/fixtures/supabase-server.mjs`, `playwright.features.config.ts`; existing guest navigation assertions in `tests/e2e/public.spec.ts`. `package.json` adds `test:features`.
