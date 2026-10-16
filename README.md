# Maison Mira commerce

Original fashion storefront and protected staff application using Next.js App Router, strict TypeScript, Tailwind 4, shadcn-style Radix button primitives, Lucide, React Hook Form, Zod, and Supabase PostgreSQL/Auth/Storage. Currency is PKR. All money in the database is integer **paisa**; product/variant forms accept rupees and convert on the server-action boundary. Generic discount and shipping management fields explicitly accept paisa.

## Run locally

The application lives in `commerce/` to preserve the pre-existing portfolio deletions in the parent Git checkout.

For designated product images, size/color options and optional guest checkout, see the [implementation and deployment guide](docs/product-options-guest-checkout.md). Apply migrations 011 and 012 in order before deploying these features.

For dependency-aware product deletion, archival, variant and orphan-image cleanup, see the [product lifecycle guide](docs/product-lifecycle.md). Apply migration 013 before deploying these admin controls.

For the complete fulfillment tracker and customer/admin feedback, see the [order progress and feedback guide](docs/order-progress-feedback.md). Apply migration 014 after the prerequisites and before deploying these pages.

```powershell
cd C:\Users\pc\Desktop\Menu\commerce
npm.cmd ci
Copy-Item .env.example .env.local
# Replace placeholders in .env.local with your own Supabase project settings.
npm.cmd run dev
```

Open http://localhost:3000. `npm.cmd` avoids PowerShell execution-policy restrictions on `npm.ps1`. Without credentials, public routes render the original design and explicit catalog/setup empty states. Authentication, customer persistence, admin, and checkout remain unavailable; no orders, payments, accounts, or sales are simulated.

## Supabase setup

1. Create a Supabase project. Copy its URL and publishable key into `.env.local`. No service-role key is used in this application.
2. Apply **all ten migrations in filename order** using the SQL editor, or run `supabase link --project-ref YOUR_PROJECT_REF` and `supabase db push` from this directory. Existing installations apply only pending migrations. CLI project configuration is in `supabase/config.toml`. Use `supabase.cmd` on PowerShell where needed. Never paste passwords or access tokens into source files.
3. In Auth URL Configuration set Site URL to your deployment origin, allow `http://localhost:3000/auth/callback` during development and `https://YOUR_DOMAIN/auth/callback` in production. Password recovery uses `?next=/reset-password`. Keep email confirmation enabled. Configure a production SMTP provider and native Auth rate limits; test confirmation and recovery delivery.
4. The storage migration creates public `product-images` with a 4 MB maximum and JPEG/PNG/WebP allowlist. Public product photos are public by design. Authenticated catalog staff can upload; customers cannot. No private assets are placed in this bucket.
5. Register and confirm the first owner through `/register`. Find the account's UUID in Auth → Users. In the **trusted SQL editor**, run:

```sql
update public.profiles set role = 'owner'
where id = 'CONFIRMED_AUTH_USER_UUID';
```

6. Sign in at `/login`, then open `/admin`. Subsequent staff promotions are owner-only on customer details pages. Signup metadata is never a trusted role source. Owners cannot demote or deactivate themselves through the application.
7. Optional: apply `supabase/seed.sql` to a **development project only**. This creates original sample products and ledgered opening stock, not real customer records. Upload your own/licensed product photography through admin. Seed data is never auto-installed in production.

## Verification

See the [production readiness audit](docs/PRODUCTION-READINESS.md) for the current command results, tested workflow matrix, remaining hosted checks and exact deployment sequence.

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:db
npm.cmd run build
npm.cmd run test:e2e
```

`test:db` executes the actual migrations and RLS/transaction functions against embedded PGlite PostgreSQL, with minimal Supabase Auth/Storage schema shims. PGlite provides `gen_random_uuid`; only the pgcrypto extension-loading statement is omitted in that harness. The harness includes all storage bucket policies, but does not run Supabase's Storage HTTP service. Its queued competing-purchase test validates one successful last-unit purchase, **not independent-connection lock contention**. See [live acceptance checks](docs/ACCEPTANCE.md) for required hosted checks, true concurrent requests, email recovery, and authenticated browser flows.

Browser tests run on a dedicated production server at port 3100 and use the installed Windows Edge executable by default. On other systems set `PLAYWRIGHT_EXECUTABLE_PATH` to an installed Chromium-family browser. These local empty-catalog tests require no Supabase credentials. Screenshots go into ignored `artifacts/`; Playwright logs into ignored `test-results/`.

## Staff operations

Category artwork (`/admin/categories`), homepage banner photos (`/admin/content`) and the store logo (`/admin/settings`) now support direct file uploads, previews and removal from the section. Apply `202610120009_content_image_uploads.sql` before using these new uploads; do not rerun older migrations. Choose a JPEG/PNG/WebP up to 4 MB, wait for upload, then click **Save changes** to attach it to the record. Existing store image URLs remain supported. New assets use unique names; replacing/removing a section image preserves old object bytes and other references. Unattached uploads can remain after abandoned edits, so review them before any Storage cleanup. Product galleries retain their existing uploader.

- **Catalog:** create categories, then a draft product, variants and opening stock with reasons. Upload original photographs, provide alt text and ordering, then publish. Unique slugs/SKUs and database constraints apply. Bulk status changes affect only selected records. Duplicating a piece copies descriptions, images and variants into a new draft with **zero stock**. Archive historical products; deleting any product referenced by order/ledger records is rejected by foreign keys.
- **Inventory:** available = on hand − reserved. This implementation immediately deducts COD stock on order creation, so reserved normally stays zero. Every adjustment requires a reason and adds a ledger entry. Saved inventory is re-fetched; negative stock is rejected by PostgreSQL.
- **Orders:** pending → confirmed → processing → shipped → delivered → returned. Pending, confirmed and processing can instead be cancelled. Dispatch requires courier and tracking. Cancellation/return restores stock once; terminal states cannot be re-applied. Inspected returns enter `returned` when items are approved for restocking; damaged goods need a separate reasoned stock subtraction.
- **Payments:** fulfillment and money are separate. COD orders begin unpaid. Record collected payment only after delivery; record a confirmed refund only after return of a paid order. This is manual reconciliation of real collection/refunds, not an online payment simulation. No online provider is configured. [Payment interface](src/services/payments.ts) is the extension point; a future provider requires verified signed webhooks and replay protection before enabling it.
- **Coupons:** percentage, fixed-paisa and quantity/bundle percentage coupons support time windows, minimum subtotal, eligible product/category/customer UUIDs, quantity and redemption limits. A single coupon can apply per order; discounts do not stack. Eligible quantities determine quantity-promotion qualification. Cancelled/returned orders retain redemptions to prevent reuse abuse.
- **Content:** edit announcement, banners, homepage section order, store name/logo, navigation/footer links, pages and policy text. CMS is intentionally plain text, rendered safely by React. Banner scheduling uses UTC inputs. Images/branding URLs must refer to this store's public upload bucket.
- **Shipping:** configure the nationwide fee, free-shipping threshold, maximum COD total and COD availability. An empty city-zone list means the nationwide rate. A nonempty list restricts delivery to listed cities, using their fees. Shipping is calculated after coupon discount. Courier updates are manual; no courier integration is claimed.
- **Reports:** collected COD revenue excludes returns; order snapshots preserve original purchase prices. Date ranges use Asia/Karachi boundaries. Dashboard is capped at 1,000 orders and reports/CSV at 5,000; bounds are displayed. CSV has no addresses/phones and escapes spreadsheet formula injection. See launch limits below before high-volume use.
- **Roles:** owner and manager can manage operational settings; catalog managers can manage catalog/stock; order managers can view customers and manage orders/inquiries. Only owners manage staff roles/account status. Staff never see passwords, payment secrets or service-role keys.

## Vercel deployment

See the [database and server-boundary security audit](docs/SECURITY-AUDIT.md) for findings, role coverage, remaining risks and the required application-before-migration rollout order. Run the read-only [security preflight](scripts/security-preflight.sql) before applying migrations 007 and 008 to an existing database.

1. Review the parent repository's pre-existing deletions. Stage only `commerce/` changes when creating your commit; this task does not commit unrelated deletions.
2. Import your Git repository in Vercel. Set Root Directory to `commerce`, framework to Next.js, install command `npm ci`, and build command `npm run build`.
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_SITE_URL` in Vercel environments. Use distinct staging and production Supabase projects. `NEXT_PUBLIC_SITE_URL` must be your canonical HTTPS domain in production.
4. Deploy, then add your custom domain through Vercel Domains and follow its DNS records. Update Supabase's allowed auth redirects to this exact origin. Verify callback, recovery email and canonical metadata on the deployed origin.
5. Enable appropriate Vercel WAF/rate-limit rules for authentication/contact traffic and confirm Supabase's native Auth throttling. Database gates provide persistent bounded counters for checkout/coupons/contact; unauthenticated requests have a conservative shared fallback because caller-provided visitor headers are not trusted. Configure trustworthy visitor-aware ingress limits before public launch.

No deployment has been performed by the local implementation workflow. Supabase and Vercel account configuration/credentials remain necessary.

## Recovery and launch

Use scheduled Supabase database backups and PITR where your plan supports it. Back up Storage objects separately; database backups do not contain image bytes. Test restores to a staging project. Prefer forward corrective migrations over dropping commerce tables. Before applying a breaking migration, pause checkout, take a backup, apply and verify on staging, then on production. Never edit immutable historical items or inventory movements to “repair” totals; document corrective operations. Apply migrations once using the migration history, rather than rerunning raw SQL blindly.

Before public launch, publish actual policies/contact details, upload actual product images, configure production SMTP and ingress rate limits, test all live acceptance cases, inspect RLS using separate users, and verify backup restoration. Current reporting bounds and city-name-based shipping configuration suit a small catalog/store; reporting beyond those bounds needs paged aggregation. Reviews have a database schema but no customer review/moderation interface (optional in the brief). There is no online payment provider, courier API, tax engine, automatic order expiration, or fulfillment-email provider; COD/manual shipment behavior is explicit. Customer order-history pages are paginated. See [acceptance status](docs/ACCEPTANCE.md) for what is and is not verified.
