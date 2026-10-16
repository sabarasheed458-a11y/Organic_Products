import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/supabase/server";
import { can, money, orderStatusLabel } from "@/lib/utils";
import Link from "next/link";
import { queryRows } from "@/lib/query-result";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireStaff();
  const client = await db(),
    params = await searchParams;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(params.from ?? "")
    ? params.from!
    : new Date(new Date().getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(params.to ?? "")
    ? params.to!
    : new Date().toISOString().slice(0, 10);
  const orders = can(user.profile.role, "orders")
    ? queryRows(
        await client
          .from("orders")
          .select(
            "id,reference,status,payment_status,total,created_at,order_items(product_name,quantity,line_total)",
          )
          .gte("created_at", from + "T00:00:00+05:00")
          .lte("created_at", to + "T23:59:59+05:00")
          .order("created_at", { ascending: false })
          .limit(1000),
        "Dashboard orders could not be loaded.",
      )
    : [];
  const stock = can(user.profile.role, "catalog")
    ? queryRows(
        await client
          .from("inventory")
          .select("*,product_variants(sku,size,color,product_id)")
          .lte("on_hand", 5)
          .limit(100),
        "Dashboard inventory could not be loaded.",
      )
    : [];
  const revenue = orders
    .filter((o) => o.payment_status === "paid" && o.status !== "returned")
    .reduce((s, o) => s + o.total, 0);
  const days = new Map<string, number>();
  const best = new Map<string, number>();
  orders
    .filter((o) => o.payment_status === "paid" && o.status !== "returned")
    .forEach((o) => {
      const day = new Date(o.created_at).toLocaleDateString("en-CA", {
        timeZone: "Asia/Karachi",
      });
      days.set(day, (days.get(day) ?? 0) + o.total);
      o.order_items.forEach((i) =>
        best.set(i.product_name, (best.get(i.product_name) ?? 0) + i.quantity),
      );
    });
  const peak = Math.max(...days.values(), 1);
  const activity = can(user.profile.role, "settings")
    ? queryRows(
        await client
          .from("admin_audit_logs")
          .select("id,action,entity,created_at")
          .order("created_at", { ascending: false })
          .limit(10),
        "Staff activity could not be loaded.",
      )
    : [];
  return (
    <>
      <div className="admin-heading">
        <p className="eyebrow">THE BIG PICTURE</p>
        <h1>Your store, at a glance.</h1>
        <p className="muted">
          Collected COD revenue excludes returns. Metrics cover up to 1,000
          orders in the selected range.
        </p>
      </div>
      <div className="panel">
        <h2>Order status breakdown</h2>
        <div className="button-row">
          {[
            "pending",
            "confirmed",
            "processing",
            "packed",
            "shipped",
            "out_for_delivery",
            "delivered",
            "cancelled",
            "returned",
          ].map((status) => (
            <span className="badge" key={status}>
              {orderStatusLabel(status)}:{" "}
              {orders.filter((o) => o.status === status).length}
            </span>
          ))}
        </div>
      </div>
      <div className="admin-columns">
        <section className="panel">
          <h2>Collected sales trend</h2>
          {[...days]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([day, total]) => (
              <div className="chart-row" key={day}>
                <span>{day}</span>
                <div>
                  <i style={{ width: `${(total / peak) * 100}%` }} />
                </div>
                <strong>{money(total)}</strong>
              </div>
            ))}
          {!days.size && (
            <p className="muted">No collected revenue in the selected range.</p>
          )}
        </section>
        <section className="panel">
          <h2>Best sellers</h2>
          {[...best]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, quantity]) => (
              <div className="summary-row" key={name}>
                <span>{name}</span>
                <strong>{quantity} units</strong>
              </div>
            ))}
          {!best.size && (
            <p className="muted">Best sellers appear after collected sales.</p>
          )}
        </section>
      </div>
      <form className="filters">
        <label>
          From
          <input type="date" name="from" defaultValue={from} />
        </label>
        <label>
          Through
          <input type="date" name="to" defaultValue={to} />
        </label>
        <button className="btn btn-primary">Update range</button>
      </form>
      <div className="metric-grid">
        {[
          ["Collected revenue", money(revenue)],
          ["Orders", orders.length],
          [
            "Awaiting action",
            orders.filter((o) =>
              ["pending", "confirmed", "processing", "packed"].includes(
                o.status,
              ),
            ).length,
          ],
          ["Low-stock variants", stock.length],
        ].map(([label, value]) => (
          <div className="metric" key={label}>
            <p>{label}</p>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      {can(user.profile.role, "settings") && (
        <section className="panel">
          <h2>Recent staff activity</h2>
          {activity.map((event) => (
            <p className="muted" key={event.id}>
              {new Date(event.created_at).toLocaleString("en-PK", {
                timeZone: "Asia/Karachi",
              })}{" "}
              · {event.action} · {event.entity}
            </p>
          ))}
          {!activity.length && <p className="muted">No recent activity.</p>}
        </section>
      )}
      <div className="admin-columns">
        <section className="panel">
          <h2>Recent orders</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Status</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 10).map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={"/admin/orders/" + o.id}>{o.reference}</Link>
                    </td>
                    <td>
                      <span className="badge">
                        {orderStatusLabel(o.status)}
                      </span>
                    </td>
                    <td>{money(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!orders.length && (
            <p className="empty">
              No orders in this range, or order access is restricted for your
              role.
            </p>
          )}
        </section>
        <section className="panel">
          <h2>Stock needs attention</h2>
          {stock.map((i) => (
            <p key={i.variant_id}>
              <Link href={"/admin/products/" + i.product_variants?.product_id}>
                {i.product_variants?.sku}
              </Link>
              <span className="badge">{i.on_hand - i.reserved} available</span>
            </p>
          ))}
          {!stock.length && (
            <p className="muted">No low-stock alerts available.</p>
          )}
        </section>
      </div>
    </>
  );
}
