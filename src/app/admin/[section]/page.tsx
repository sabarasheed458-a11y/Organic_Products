import { notFound } from "next/navigation";
import { BulkStatus } from "@/components/admin/bulk-status";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/supabase/server";
import { reportOrders } from "@/repositories/reports";
import { money, orderStatusLabel } from "@/lib/utils";
import { RecordEditor } from "@/components/admin/editor";
import { StockForm } from "@/components/admin/product-editor";
import { fields } from "@/lib/admin-fields";
import { FeedbackModeration } from "@/components/account/feedback";
import type { Feedback } from "@/types";
const scopes: Record<string, string> = {
  products: "catalog",
  feedback: "catalog",
  categories: "catalog",
  inventory: "catalog",
  orders: "orders",
  customers: "orders",
  inquiries: "orders",
  coupons: "settings",
  promotions: "settings",
  content: "settings",
  settings: "settings",
  reports: "settings",
  staff: "settings",
};
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { section } = await params;
  if (!Object.hasOwn(scopes, section)) notFound();
  const user = await requireStaff(scopes[section]);
  const client = await db(),
    query = await searchParams;
  const page = Math.max(1, Math.floor(Number(query.page) || 1)),
    q = (query.q ?? "").replace(/[%_\\]/g, "").slice(0, 100);
  const title = section.charAt(0).toUpperCase() + section.slice(1);
  const table =
    section === "content"
      ? "pages"
      : section === "settings"
        ? "store_settings"
        : section === "customers" || section === "staff"
          ? "profiles"
          : section === "inquiries"
            ? "contact_inquiries"
            : section;
  if (section === "feedback") {
    const approved =
      query.status === "approved"
        ? true
        : query.status === "pending"
          ? false
          : null;
    const { data, error } = await client.rpc("feedback_admin", {
      p_page: page,
      p_approved: approved,
    });
    if (error || !Array.isArray(data))
      throw new Error("Feedback could not be loaded.");
    return (
      <>
        <h1>Customer feedback</h1>
        <form className="filters">
          <label>
            Show feedback
            <select name="status" defaultValue={query.status ?? ""}>
              <option value="">All feedback</option>
              <option value="pending">Pending / hidden</option>
              <option value="approved">Published</option>
            </select>
          </label>
          <button className="btn btn-outline">Filter feedback</button>
        </form>
        {data.length ? (
          data.map((r: Feedback) => (
            <FeedbackModeration key={r.id} feedback={r} />
          ))
        ) : (
          <p className="empty">No matching customer feedback yet.</p>
        )}
        <Pagination
          page={page}
          status={query.status}
          hasNext={data.length === 20}
        />
      </>
    );
  }
  if (section === "reports") {
    const from = /^\d{4}-\d{2}-\d{2}$/.test(query.from ?? "")
      ? query.from!
      : "2026-01-01";
    const to = /^\d{4}-\d{2}-\d{2}$/.test(query.to ?? "")
      ? query.to!
      : new Date().toISOString().slice(0, 10);
    const rows = await reportOrders(from, to);
    const paid = rows.filter(
      (o) => o.payment_status === "paid" && o.status !== "returned",
    );
    const revenue = paid.reduce((s, o) => s + o.total, 0);
    const best = new Map<string, { quantity: number; total: number }>();
    paid.forEach((o) =>
      o.order_items.forEach(
        (i: { product_name: string; quantity: number; line_total: number }) => {
          const old = best.get(i.product_name) ?? { quantity: 0, total: 0 };
          best.set(i.product_name, {
            quantity: old.quantity + i.quantity,
            total: old.total + i.line_total,
          });
        },
      ),
    );
    const categorySales = new Map<string, number>();
    paid.forEach((o) =>
      o.order_items.forEach((i) => {
        const category =
          i.product_variants?.products?.categories?.name ?? "Uncategorized";
        categorySales.set(
          category,
          (categorySales.get(category) ?? 0) + i.line_total,
        );
      }),
    );
    const statuses = new Map<string, { count: number; total: number }>();
    rows.forEach((o) => {
      const prior = statuses.get(o.status) ?? { count: 0, total: 0 };
      statuses.set(o.status, {
        count: prior.count + 1,
        total: prior.total + o.total,
      });
    });
    const days = new Map<string, number>();
    paid.forEach((o) => {
      const day = new Date(o.created_at).toLocaleDateString("en-CA", {
        timeZone: "Asia/Karachi",
      });
      days.set(day, (days.get(day) ?? 0) + o.total);
    });
    const high = Math.max(...days.values(), 1);
    return (
      <>
        <h1>Reports</h1>
        <form className="filters">
          <label>
            From
            <input type="date" name="from" defaultValue={from} />
          </label>
          <label>
            Through
            <input type="date" name="to" defaultValue={to} />
          </label>
          <button className="btn btn-primary">Generate</button>
          <Link
            className="btn btn-outline"
            href={`/api/admin/export?from=${from}&to=${to}`}
          >
            Export orders CSV
          </Link>
        </form>
        <p className="muted">
          Up to 5,000 orders. Collected sales exclude returns; product figures
          use immutable item snapshots.
        </p>
        <div className="metric-grid">
          {[
            ["Collected sales", money(revenue)],
            ["Order volume", rows.length],
            [
              "Average collected order",
              money(paid.length ? Math.round(revenue / paid.length) : 0),
            ],
            [
              "Cancelled / returned",
              `${rows.filter((o) => o.status === "cancelled").length} / ${rows.filter((o) => o.status === "returned").length}`,
            ],
          ].map(([l, v]) => (
            <div className="metric" key={l}>
              <p>{l}</p>
              <strong>{v}</strong>
            </div>
          ))}
        </div>
        <section className="panel">
          <h2>Collected sales by day</h2>
          {[...days]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([day, total]) => (
              <div className="chart-row" key={day}>
                <span>{day}</span>
                <div>
                  <i style={{ width: `${(total / high) * 100}%` }} />
                </div>
                <strong>{money(total)}</strong>
              </div>
            ))}
          {!days.size && (
            <p className="empty">No collected sales in this period.</p>
          )}
        </section>
        <section className="panel">
          <h2>Sales by current category</h2>
          <p className="muted">
            Item sales before order-level coupons/shipping. Uses current product
            category.
          </p>
          {[...categorySales].map(([name, total]) => (
            <div className="summary-row" key={name}>
              <span>{name}</span>
              <strong>{money(total)}</strong>
            </div>
          ))}
        </section>
        <section className="panel">
          <h2>Orders by status</h2>
          {[...statuses].map(([status, value]) => (
            <div className="summary-row" key={status}>
              <span>
                {status} ? {value.count} orders
              </span>
              <strong>{money(value.total)}</strong>
            </div>
          ))}
        </section>
        <section className="panel">
          <h2>Best-selling products</h2>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Units</th>
                <th>Item sales</th>
              </tr>
            </thead>
            <tbody>
              {[...best]
                .sort((a, b) => b[1].quantity - a[1].quantity)
                .map(([name, r]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td>{r.quantity}</td>
                    <td>{money(r.total)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      </>
    );
  }
  if (section === "inventory") {
    const { data, error } = await client
      .from("product_variants")
      .select("*,inventory(*)")
      .order("sku")
      .range((page - 1) * 20, page * 20 - 1);
    if (error) throw new Error("Inventory could not be loaded.");
    return (
      <>
        <h1>Inventory</h1>
        <p className="muted">
          Available = on hand − reserved. COD checkout deducts stock
          immediately; cancelled and returned orders restore it once.
        </p>
        {data?.map((v) => (
          <details className="record-editor" key={v.id}>
            <summary>
              {v.sku} · {v.size} / {v.color} · {v.inventory?.on_hand ?? 0} on
              hand
            </summary>
            <StockForm
              variantId={v.id}
              onHand={v.inventory?.on_hand ?? 0}
              reserved={v.inventory?.reserved ?? 0}
            />
          </details>
        ))}
        {!data?.length && (
          <p className="empty">
            Create a product variant to start managing stock.
          </p>
        )}
        <Pagination page={page} hasNext={(data?.length ?? 0) === 20} />
      </>
    );
  }
  let request = client
    .from(table)
    .select("*", { count: "exact" })
    .order(section === "settings" ? "id" : "created_at", { ascending: false });
  if (["categories", "coupons", "promotions", "pages"].includes(table))
    request = client
      .from(table)
      .select("*", { count: "exact" })
      .order(
        table === "categories"
          ? "position"
          : table === "coupons"
            ? "code"
            : table === "promotions"
              ? "name"
              : "updated_at",
      );
  if (q)
    request = request.ilike(
      table === "orders"
        ? "reference"
        : table === "profiles"
          ? "full_name"
          : table === "coupons"
            ? "code"
            : table === "pages"
              ? "title"
              : "name",
      "%" + q + "%",
    );
  if (
    query.status &&
    ["products", "orders", "contact_inquiries"].includes(table)
  )
    request = request.eq("status", query.status);
  if (section === "staff") request = request.neq("role", "customer");
  const { data, error, count } = await request.range(
    (page - 1) * 20,
    page * 20 - 1,
  );
  if (error) throw new Error("This management view could not be loaded.");
  const records = data ?? [];
  return (
    <>
      <div className="admin-heading">
        <h1>{title}</h1>
        <p className="muted">
          {count ?? 0} records · Changes are saved to Supabase.
        </p>
        {section === "products" && (
          <Link className="btn btn-primary" href="/admin/products/new">
            Create product +
          </Link>
        )}
      </div>
      {section !== "settings" && (
        <form className="filters">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search"
            aria-label={"Search " + title}
          />
          {["products", "orders", "inquiries"].includes(section) && (
            <select
              name="status"
              defaultValue={query.status ?? ""}
              aria-label="Status"
            >
              <option value="">All statuses</option>
              {(section === "products"
                ? ["draft", "published", "archived"]
                : section === "orders"
                  ? [
                      "pending",
                      "confirmed",
                      "processing",
                      "packed",
                      "shipped",
                      "out_for_delivery",
                      "delivered",
                      "cancelled",
                      "returned",
                    ]
                  : ["open", "resolved"]
              ).map((s) => (
                <option key={s} value={s}>
                  {section === "orders" ? orderStatusLabel(s) : s}
                </option>
              ))}
            </select>
          )}
          <button className="btn btn-outline">Filter</button>
        </form>
      )}
      {section === "content" && (
        <>
          <h2>Homepage banners</h2>
          <BannerEditors />
          <h2>Pages & policies</h2>
        </>
      )}
      {fields[table] &&
        !["store_settings", "contact_inquiries"].includes(table) && (
          <RecordEditor
            table={table}
            fields={fields[table]}
            title={
              "Create " +
              (section === "content" ? "page" : section.slice(0, -1))
            }
          />
        )}
      {section === "products" && (
        <BulkStatus
          products={records.map((r) => ({ id: r.id, name: r.name }))}
        />
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>
                {section === "orders"
                  ? "Reference"
                  : section === "products"
                    ? "Product"
                    : section === "coupons"
                      ? "Code"
                      : "Record"}
              </th>
              <th>Details</th>
              <th>Status / action</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                <td>
                  {section === "products" ? (
                    <Link href={"/admin/products/" + r.id}>
                      {r.name}
                      <small className="block muted">{r.sku}</small>
                    </Link>
                  ) : section === "orders" ? (
                    <Link href={"/admin/orders/" + r.id}>{r.reference}</Link>
                  ) : (
                    (r.name ?? r.title ?? r.code ?? r.full_name ?? r.id)
                  )}
                </td>
                <td>
                  {section === "products" ? (
                    money(r.sale_price ?? r.price)
                  ) : section === "orders" ? (
                    money(r.total)
                  ) : section === "customers" || section === "staff" ? (
                    <>
                      <span>{r.phone}</span>
                      <small className="block muted">{r.id}</small>
                      {section === "customers" && (
                        <Link href={"/admin/customers/" + r.id}>
                          View order history →
                        </Link>
                      )}
                    </>
                  ) : section === "inquiries" ? (
                    <>
                      <a href={"mailto:" + r.email}>{r.email}</a>
                      <p className="whitespace">{r.message}</p>
                    </>
                  ) : (
                    (r.description ?? r.slug ?? r.announcement ?? "")
                  )}
                </td>
                <td>
                  {fields[table] ? (
                    <RecordEditor
                      table={table}
                      record={r}
                      fields={fields[table]}
                      title="Edit"
                    />
                  ) : section === "staff" && user.profile.role === "owner" ? (
                    <RecordEditor
                      table="staff"
                      record={r}
                      fields={fields.staff}
                      title="Manage access"
                    />
                  ) : (
                    <span className="badge">
                      {section === "orders" && r.status
                        ? orderStatusLabel(String(r.status))
                        : (r.status ??
                          r.role ??
                          (r.active === false ? "Inactive" : "Active"))}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!records.length && <div className="empty">No matching records.</div>}
      <Pagination
        page={page}
        hasNext={page * 20 < (count ?? 0)}
        q={q}
        status={query.status}
      />
      {section === "staff" && (
        <p className="muted">
          First create an account through the normal confirmed registration
          flow. Owners promote existing customer accounts from the customer
          details page. There is no public admin registration.
        </p>
      )}
    </>
  );
}
async function BannerEditors() {
  const { data, error } = await (
    await db()
  )
    .from("banners")
    .select("*")
    .order("position");
  if (error) throw new Error("Banners could not be loaded.");
  return (
    <>
      <RecordEditor
        table="banners"
        fields={fields.banners}
        title="Create banner"
      />
      {data?.map((r) => (
        <RecordEditor
          key={r.id}
          table="banners"
          record={r}
          fields={fields.banners}
          title={r.title}
        />
      ))}
    </>
  );
}
function Pagination({
  page,
  hasNext,
  q = "",
  status = "",
}: {
  page: number;
  hasNext: boolean;
  q?: string;
  status?: string;
}) {
  return (
    <nav className="pagination" aria-label="Management pages">
      {page > 1 && (
        <Link
          href={`?page=${page - 1}&q=${encodeURIComponent(q)}&status=${status}`}
        >
          ← Previous
        </Link>
      )}
      {page > 1 && <span>Page {page}</span>}
      {hasNext && (
        <Link
          href={`?page=${page + 1}&q=${encodeURIComponent(q)}&status=${status}`}
        >
          Next →
        </Link>
      )}
    </nav>
  );
}
