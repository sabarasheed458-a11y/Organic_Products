# Admin product lifecycle — 14 October 2026

The existing product form already updates the original product ID, prepopulates current values, validates prices and fields, and writes text/price fields independently of image references. Those paths are retained. This change adds verified lifecycle operations and explicit cleanup to the existing product details screen.

## Behavior

- **Archive product** always retains the product and dependencies while removing it from the public catalog and new purchases.
- **Delete product** first loads a database plan and shows the saved product name, dependency counts, and whether the operation will archive or permanently delete. Cancel performs no mutation. Confirmation rechecks everything inside the transaction.
- Published products are archived first. Order items, inventory movements, nonzero stock/reservations, saved carts, wishlists, reviews and coupon product targets prevent permanent deletion. If dependencies appear after inspection, confirmation archives the product instead.
- Only eligible drafts/archived products are permanently removed. Their unreferenced variants, empty inventory rows and image references may cascade under the existing schema. Orders, payment rows, customers, inventory history and audit logs are retained. Image files are always retained by product deletion.
- **Remove variant** permanently removes only unused, zero-stock variants. Order/cart/history dependencies, stock, and the last color used by an image cause deactivation instead. Existing variants and historical order snapshots remain intact.
- **Remove image reference** removes only that product's image record. It does not remove uploaded bytes or other products' copies of the same photo.
- **Clean up orphaned product image files** requires an explicitly supplied `product-id/file-id.jpg`, `.png` or `.webp` Storage path. Inspect first, then explicitly confirm deletion. Shared images, category/banner/branding/settings references and page content references prevent removal. The action uses the existing Supabase Storage API with the caller's session, verifies its acknowledgement and checks database absence before reporting success. No service-role key is used.
- Busy guards prevent repeat submissions in the product, variant, inventory and image-edit forms. Product lifecycle and file cleanup have independent guarded requests. Product form layout now fits narrow screens without overflowing long SKU fields.

## Database enforcement

New migration `supabase/migrations/202610140013_product_lifecycle.sql` adds catalog-authorized inspection/removal RPCs and deletion guards. Product/variant/inventory locks follow the existing checkout order in the supported removal RPCs. Direct catalog DELETE operations also face dependency guards, rather than relying only on UI controls or cascading foreign keys. Coupon product arrays have no foreign key, so new/changed targets are validated and locked explicitly. Existing malformed targets are not rewritten during migration; they must be corrected if edited.

Existing audit triggers continue recording edits. Removal RPCs additionally record product name/SKU, outcome and dependencies. Storage removal records the removed path in the existing audit table. Reference writes and Storage deletion share a transaction-level advisory lock; retained deletion audit records prevent attaching a just-deleted product file after removal commits. Those audit records must remain retained.

No RLS policy is disabled, no existing grant is broadened, and no migration deletes existing records. New RPCs grant execute only to authenticated callers and enforce `can_manage('catalog')` internally. Private helpers/trigger functions have no public/anonymous/authenticated execute grant.

## Deployment

1. Back up the database and Storage; verify migrations 001–012 are applied. If the previous product-options/guest-checkout migrations are pending, apply 011 and 012 first.
2. Apply the complete `202610140013_product_lifecycle.sql` on staging using the existing migration workflow. On a correctly linked project, use `supabase db push`; alternatively execute the entire new file once in Supabase SQL Editor. Do not reset the schema or rerun historical migrations.
3. Verify native Supabase Storage API removal on staging: protect a photo shared by two products, remove only one reference, confirm the file still exists; remove all references, explicitly remove the file, verify the object and bytes are gone, and verify an audit record exists. Check that the project migration role can create the Storage guard trigger.
4. Deploy the app after the migration succeeds. Run `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run test:db`, then `npm.cmd run build`; restart the current development server or use the existing production deployment process.
5. Smoke-test one product edit, cancelled deletion, protected product archival, eligible duplicate-draft deletion and obsolete variant deactivation. Verify the public catalog and existing order details afterwards.

## Changed files and test boundaries

Confirmed results: TypeScript passed, lint passed without warnings, 114 unit tests passed, 71 database tests passed, 6 feature browser tests passed across desktop/mobile, and 39 public regression browser tests passed across desktop/tablet/mobile. The existing admin navigation's minimum grid width caused horizontal overflow and unreachable touch targets; setting its minimum width to zero and constraining the product form grid corrected the defect. The browser test now checks document width against the configured mobile viewport, rather than `innerWidth`, which can expand when a mobile page overflows.

The final production build passed with exit code 0 after clearing test-only process environment overrides and restoring the existing `.env.local` configuration. That file was not modified.

Application files: `src/actions/commerce.ts`, `src/components/admin/product-editor.tsx`, `product-lifecycle.tsx`, `bulk-status.tsx`, and scoped rules in `src/app/globals.css`.

Tests: `tests/integration/product-lifecycle.test.ts` and the existing database harness now execute migration 013. `tests/unit/actions.test.ts` covers authorization, missing/failed mutation responses, protected file refusal and verified Storage removal. The fixture gateway and `tests/features/product-lifecycle.spec.ts` test the actual production editor, prepopulation, original ID retention, image preservation, reload persistence, named confirmation/cancellation, transport failure and deletion/archival on desktop/mobile. Existing guest-purchase tests still execute the migrated ordering RPCs.

PGlite tests execute actual SQL with Supabase Auth/Storage schema shims. Browser tests use a local test-only REST/Auth gateway; their JWT and users are fixture values, not real Supabase identities. They do not verify hosted Auth, native Storage byte deletion or independent-connection PostgreSQL concurrency. Hosted migration 013 has not been applied by this task. Native staging verification remains necessary before production rollout. Local guest carts cannot be enumerated by the database; their existing cart revalidation marks removed/archived variants unavailable. No automatic bulk deletion or scheduled orphan cleanup is introduced.
