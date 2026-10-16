# Verification and remaining launch checks

The local application is implemented; a live production deployment is not certified. Credentials are intentionally absent. Never treat a passing embedded-database suite as evidence of hosted authentication or Storage delivery.

## Recorded local result — 12 October 2026

- TypeScript strict check: passed.
- ESLint: passed, no warnings.
- Next.js production build: passed.
- Unit tests: 65 passed (including storefront, validation, authentication, Server Action transports, all management module construction, query failures, UTC scheduling and checkout retries).
- Embedded PostgreSQL migration/security/commerce tests: 55 passed, covering anonymous, two customers, owner, manager, catalog manager and order manager access; product CRUD, coupons, all supported fulfillment edges and inventory adjustments.
- Production-browser tests: 36 passed across desktop, tablet and mobile, with additional 320 px checks, every admin module's anonymous denial and interrupted contact/login requests. Six of these use explicitly mocked catalog responses for guest shopping persistence and unavailable-item/price presentation.
- Production dependency audit: 0 reported vulnerabilities at the time of the check; this is not a security certification.
- Eight migrations prepared and executed in the embedded harness; not applied to hosted Supabase. See [security audit and rollout](SECURITY-AUDIT.md) before applying the two new additive migrations.
- No `.env.local`, hosted credentials, live authentication-email verification, independent-connection contention test, or deployment was available.

Source changes are confined to `commerce/`. The parent checkout's 54 pre-existing portfolio-file deletions were preserved; no Git commit or remote push was made.

See [production readiness](PRODUCTION-READINESS.md) for root causes, exact coverage boundaries, current command results and deployment instructions. Authenticated module construction and upload Action tests use explicitly mocked transport and do not establish hosted browser CRUD or Storage HTTP success.

## Automated local coverage

- Unit: checkout/address validation, invalid/duplicate quantities, input stripping, sale-price rules, safe redirects, CSV formula escaping, staff scope mapping, transitions, image magic bytes, money formatting.
- Embedded PostgreSQL: migration creation and constraints; signup role protection; published-only public catalog; private-record access denial; role-column grants; direct stock/order-write rejection; reasoned ledger adjustments; atomic totals and idempotent retry; immutable price snapshots; customer isolation; overselling rejection; competing last-unit calls; cancellation/restoration once; coupon quote/redemption limits; scoped staff restrictions; atomic cart/wishlist persistence; CMS synchronization; COD delivery/collection/return/refund; timeline isolation; draft duplication/zero stock; bulk scope checks; public image reads and denied customer uploads; inactive-account restrictions.
- Browser: home/collection navigation, desktop/tablet/mobile overflow, empty search/wishlist/cart states, protected redirects, authentication/content/policy routes, required-field validation, missing-product 404, denied exports, malformed identifier handling. Screenshots are captured for desktop/tablet/mobile. Guest cart quantity/stock limits and wishlist persistence are additionally checked with explicitly mocked catalog API responses; those tests are not evidence of hosted catalog access.

## Required live acceptance (use staging first)

1. Register two distinct customers. Confirm both emails and check that user-supplied `role` metadata never grants staff access. Sign in/out; request password recovery; follow the PKCE email link; reset and verify the new password. Confirm expired/invalid links fail.
2. Promote an owner through trusted SQL. Create a category and a draft product with multiple sizes/colours. Upload JPEG/PNG/WebP, reject disguised content/SVG/oversized files, update image order/alt text. Publish and verify product/category metadata and images on the storefront.
3. Change the saved price and sale price; refresh the public catalog. Test category/search/price filtering, all sorts and page boundaries against a catalog with more than 12 products. Verify unpublished variants cannot be purchased through a handcrafted request.
4. Sign in as customer A, persist a wishlist and cart, refresh and check another device/session. Change quantities and remove lines. Ensure customer B cannot read or alter A's cart, wishlist, addresses or orders through the direct Supabase REST API.
5. Apply valid, expired, restricted and exhausted coupons. Confirm bundle qualification counts eligible items. With a limited coupon, submit simultaneous requests from separate users and verify redemption limits hold.
6. Checkout with COD; send duplicate submissions with the same key. Verify exactly one order and payment record, immutable variant/item snapshots and matching variant stock in admin. Reuse the key with changed input; verify rejection.
7. Put one unit in stock. Submit checkout simultaneously through **two independent hosted connections**, preferably distinct authenticated users. Exactly one order must succeed. Re-fetch stock and ledger afterward. The PGlite suite cannot verify independent server-connection locking.
8. Cancel pending/confirmed/processing orders and verify exactly one restoration. Try invalid and repeated transitions. Ship with courier/tracking; deliver and record real collected COD. Return and record real refund. Reconcile payment and fulfillment statuses separately.
9. Use customer, catalog manager and order manager sessions; test page routes, Server Actions, REST table writes and RPC calls. Verify customers cannot access admin; order managers cannot change catalog; catalog managers cannot access customer orders; disabled users cannot place orders; only owners can manage roles. Check anonymous financial-table access is denied.
10. Edit banners, announcement, homepage order, navigation, footer, store name/logo and policy text. Refresh storefront and check schedule boundaries. Validate rich markup is shown as inert text, not executed.
11. Verify shipping zones, unsupported cities, free-shipping thresholds, COD disablement and maximum totals. Test mobile menu, keyboard focus, image enlargement, checkout errors, slow network and refresh during submission.
12. Deploy to Vercel staging, run the production build and live smoke checks, inspect canonical URLs/sitemap/robots, ensure secrets are absent from browser assets, verify SMTP/ingress throttling, and restore a database plus Storage backup before production launch.

No online payment provider or courier API is enabled. If introduced, add real signed webhook/replay tests and actual provider/courier staging verification before claiming integration support.
