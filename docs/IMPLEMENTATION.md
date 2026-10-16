# Repository audit

The working tree initially contained only `.git`. HEAD tracks a portfolio project, whose files were already deleted before this task. All commerce work is isolated in `commerce/`; those pre-existing deletions are not changed or committed. No existing live application, dependency installation, Supabase configuration, or environment file was present in the selected directory.

# Plan

1. Establish strict Next.js/React/TypeScript, Tailwind, reusable shadcn-style primitives, validation and request-scoped Supabase clients.
2. Create versioned PostgreSQL schema, RLS, trusted role checks, transactional checkout, inventory ledger and immutable snapshots.
3. Build the original Maison Mira storefront, database catalog, search, variants and persistent shopping tools.
4. Add authentication, customer addresses, COD checkout, confirmation and account-scoped tracking.
5. Build protected staff dashboard and database-backed catalog, orders, inventory, content, coupons, shipping and reports.
6. Verify types, lint, build, unit tests and local PostgreSQL-compatible integration tests; document live Supabase checks still required.

Decisions: PKR currency; COD only; authenticated checkout; stock deducted atomically at order creation and restored once on cancellation/return; manual courier updates; plain-text CMS to avoid rich-text XSS; no simulated accounts/orders or payments. Missing credentials show explicit setup/empty states rather than a fake catalog. Vercel is the requested deployment target; no alternative hosting registration is created.
