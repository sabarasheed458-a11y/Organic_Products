import Link from "next/link";
import { money, orderStatusLabel } from "@/lib/utils";
import type { Order, OrderProgress } from "@/types";
import { ProgressTracker } from "./order-progress";
import { FeedbackForm } from "./feedback";
export function OrderView({
  order,
  progress,
  customerFeedback = true,
}: {
  order: Order;
  progress?: OrderProgress | null;
  customerFeedback?: boolean;
}) {
  return (
    <div className="panel">
      <div className="section-heading">
        <h2>{order.reference}</h2>
        <span className="badge">{orderStatusLabel(order.status)}</span>
      </div>
      <p className="muted">
        {order.user_id ? "Registered customer" : "Guest checkout"}
      </p>
      <ProgressTracker order={order} progress={progress} />
      <p className="muted">
        Placed{" "}
        {new Date(order.created_at).toLocaleDateString("en-PK", {
          timeZone: "Asia/Karachi",
        })}{" "}
        · COD payment: {order.payment_status}
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Variant</th>
              <th>Quantity</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {order.order_items.map((i) => (
              <tr key={i.id}>
                <td>
                  {i.product_name}
                  <small className="block muted">{i.sku}</small>
                </td>
                <td>
                  {i.size} / {i.color}
                </td>
                <td>{i.quantity}</td>
                <td>{money(i.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="summary-row">
        <span>Subtotal</span>
        <span>{money(order.subtotal)}</span>
      </div>
      <div className="summary-row">
        <span>Discount</span>
        <span>−{money(order.discount)}</span>
      </div>
      <div className="summary-row">
        <span>Delivery</span>
        <span>{money(order.shipping)}</span>
      </div>
      <div className="summary-row">
        <strong>Total</strong>
        <strong>{money(order.total)}</strong>
      </div>
      <p>
        Deliver to: {order.address.full_name}, {order.address.line1},{" "}
        {order.address.city}
      </p>
      <p>
        Phone: {order.address.phone}
        {order.address.email ? ` ? Email: ${order.address.email}` : ""}
      </p>
      {order.tracking_number && (
        <p>
          Courier: {order.courier} · Tracking: {order.tracking_number}
        </p>
      )}
      <Link href="/pages/contact" className="text-link">
        Need help with this order? →
      </Link>
      {customerFeedback &&
        order.status === "delivered" &&
        !!progress?.products?.length && (
          <section aria-label="Customer feedback">
            <h3>Your feedback</h3>
            {progress.products.map((p) => (
              <FeedbackForm
                key={p.product_id}
                orderId={order.id}
                productId={p.product_id}
                name={p.product_name}
                feedback={progress.feedback?.find(
                  (r) => r.product_id === p.product_id,
                )}
              />
            ))}
          </section>
        )}
    </div>
  );
}
