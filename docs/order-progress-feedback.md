# Order progress, S/M/L verification and feedback — 14 October 2026

The existing size/color variant, checkout, inventory, payment and review models are retained. S/M/L already had a product sizing switch, distinct variant IDs/SKUs/prices/stock, explicit customer selection and immutable order snapshots. This update verifies those flows and extends the existing order status and reviews features.

## Customer and admin behavior

Orders advance through Pending → Confirmed → Processing → Packed → Shipped / dispatched → Out for delivery → Delivered. Cancellation remains available before dispatch, including Packed. Delivered orders retain the existing Returned workflow. COD collection/refunds remain separate and retain their existing conditions. Moving an order forward never deducts inventory again; cancellation/return restores the ordered variant once. Reasons are required for status changes. Invalid, repeated, backward and terminal-state transitions are rejected by the existing locked RPC.

The customer history, confirmation, tracking and admin order details show a progress tracker using authoritative order data and recorded transition timestamps. Private staff reasons and actor IDs appear only in the authorized admin timeline. Legacy statuses and orders are not rewritten; missing timestamps are labelled as unavailable rather than fabricated. Customers see status updates when they revisit or refresh the page; no realtime subscription is introduced. Guests can track their reference from the same browser using the existing HttpOnly capability cookie. An order ID/reference alone grants no access.

Customers and guests can submit a 1–5 rating and text for products in a delivered order. Feedback is available from the delivered confirmation/history/tracking panel. The existing reviews table is reused: registered customers retain one review per product, while guests have one per product/order. Editing feedback resets approval and clears the previous reply so changed content is moderated again. The submission gate permits 10 successful submissions/updates per customer or guest capability per hour.

Authorized catalog admins have **Admin → Feedback** (`/admin/feedback`), with pending/published filters, approval/hiding and a reply field. Approved feedback and replies appear in the existing product details route. A customer can see their own pending feedback and replies; other customers cannot see pending feedback. User content is rendered as escaped text. No customer name, contact information, capability token or new private order linkage is published by the feedback UI. Public review column grants exclude `order_id`; admin listing uses a catalog-authorized RPC. There is no arbitrary feedback deletion or account/order deletion control.

## Migration and deployment

`supabase/migrations/202610140014_order_progress_feedback.sql` adds the two statuses to the existing constraint, replaces the transition RPC with the extended sequence, adds private progress/reference lookup RPCs, and adds nullable review order linkage plus admin replies and moderation/submission RPCs. Existing review ownership/approval and all existing orders remain intact. Private helpers and role checks remain enforced. No service-role credentials are introduced. The migration has not been applied to hosted Supabase by this task.

1. Back up the database and Storage. Confirm migrations 001–013 have been applied; apply any pending prerequisite migrations in order.
2. Apply the complete migration 014 on staging through the normal migration process (`supabase db push` for a correctly linked project), or execute the complete new SQL file once in Supabase SQL Editor. Do not reset the database, edit historical migrations or reapply already recorded migration files.
3. Temporarily pause admin status changes for rollout. Apply 014 before deploying this app: the new pages need the added RPCs/columns, while the old admin client does not know the mandatory Packed/Out for Delivery stages. External fulfillment integrations must use the new sequence too.
4. Deploy with the existing publishable-key and HTTPS configuration. Run `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run test:db`, and `npm.cmd run build`; restart development or use the existing production hosting workflow. No `.env.local` contents or credentials need to change.
5. In native Supabase staging, create S/M/L variants with independent stock. Place a registered M order and a guest S order. Verify snapshots, cart lines, confirmation, history and admin details. Advance one order through every stage; cancel another at Packed and verify that only its size's stock is restored once. Verify Delivered remains unpaid until COD collection is recorded, and existing return/refund rules still work.
6. Submit feedback for delivered registered/guest orders. Check that pending feedback is private; approve/reply through Admin → Feedback; check the public product page. Attempt another user's order, a guest reference without its cookie, inactive-user access and unauthorized moderation. Verify guest tracking after reload and access denial from another browser.

Native Supabase Auth/PostgREST/Storage and independent-connection concurrency checks remain staging work. Browser tests use the existing local REST/Auth gateway backed by real migrated PGlite SQL; their JWTs and users are fixtures, not production authentication tests. Lost/expired guest cookies still remove self-service access after the existing 30-day lifetime. Existing external Auth credential/SMTP limitations are not changed. There are no new emails, recovery links, payment providers or languages.

## Exact files changed

Confirmed verification: `npm.cmd run typecheck` and `npm.cmd run lint` passed; `npm.cmd test` passed 119 tests; `npm.cmd run test:db` passed 78 tests; `npm.cmd run test:features` passed 10 tests across desktop/mobile; `npm.cmd run test:e2e` passed 39 tests across desktop/tablet/mobile. The final production build passed with exit code 0 after removing test-only process overrides and restoring the existing `.env.local` configuration. That file was not modified.

Application:

- `src/lib/utils.ts` — transition map, canonical stages and readable labels.
- `src/types/index.ts` — progress and feedback types.
- `src/actions/commerce.ts` — new status validation, feedback submission and moderation actions.
- `src/repositories/order-progress.ts`, `catalog.ts` — private progress and approved product feedback loading.
- `src/components/account/order-progress.tsx`, `feedback.tsx`, `order-view.tsx` — tracker and customer/admin feedback forms.
- `src/components/product/feedback.tsx` — public approved feedback.
- `src/components/admin/order-actions.tsx` — new stages, existing tracking values and repeat-submission guards.
- `src/app/account/orders/page.tsx`, `src/app/order-confirmation/[orderId]/page.tsx`, `src/app/track-order/page.tsx` — customer and guest progress/feedback.
- `src/app/products/[slug]/page.tsx` — approved reviews section.
- `src/app/admin/layout.tsx`, `page.tsx`, `[section]/page.tsx`, `orders/[id]/page.tsx` — feedback module/navigation, updated filters/dashboard, private admin history and tracking.
- `src/app/globals.css` — scoped tracker/feedback styles.

Tests and documentation:

- `tests/unit/order-feedback.test.ts`, `actions.test.ts` — stage labels, timestamps, escaped content, validation and moderation authorization.
- `tests/integration/order-feedback.test.ts` — size-specific guest/registered orders, all transitions, cancellation/stock, legacy shipped orders, private capabilities and feedback permissions.
- `tests/integration/database.test.ts`, `product-guest.test.ts`, `security-audit.test.ts` — migration 014 coverage, complete new stage sequence and safe public review column selection.
- `tests/features/order-feedback.spec.ts`, `tests/fixtures/supabase-server.mjs` — production-page customer/admin journey through every stage, private submission, approval/reply, guest tracking and registered history.
- `tests/e2e/public.spec.ts` — includes anonymous rejection for the new admin feedback module.
- `docs/order-progress-feedback.md`, `README.md` — rollout, validation and limitations.
