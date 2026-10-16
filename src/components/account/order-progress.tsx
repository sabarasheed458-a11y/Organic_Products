import { orderStages, orderStatusLabel } from "@/lib/utils";
import type { Order, OrderProgress } from "@/types";
export function ProgressTracker({
  order,
  progress,
}: {
  order: Order;
  progress?: OrderProgress | null;
}) {
  const current = orderStages.indexOf(
    order.status as (typeof orderStages)[number],
  );
  const history = progress?.history ?? [];
  const date = (status: string) =>
    status === "pending"
      ? order.created_at
      : history.find((e) => e.status === status)?.created_at;
  return (
    <section aria-label="Order progress">
      <h3>Order progress</h3>
      {["cancelled", "returned"].includes(order.status) && (
        <p role="status">
          {orderStatusLabel(order.status)}
          {date(order.status)
            ? " · " +
              new Date(date(order.status)!).toLocaleString("en-PK", {
                timeZone: "Asia/Karachi",
              })
            : ""}
          .{" "}
          {order.status === "cancelled"
            ? "This order will not be dispatched."
            : "Return handling is separate from COD payment or refund status."}
        </p>
      )}
      <ol className="order-progress">
        {orderStages.map((status, i) => {
          const timestamp = date(status);
          return (
            <li
              key={status}
              aria-current={order.status === status ? "step" : undefined}
              className={
                order.status === status
                  ? "current"
                  : timestamp
                    ? "completed"
                    : ""
              }
            >
              <strong>{orderStatusLabel(status)}</strong>
              <small>
                {timestamp ? (
                  <time dateTime={timestamp}>
                    {new Date(timestamp).toLocaleString("en-PK", {
                      timeZone: "Asia/Karachi",
                    })}
                  </time>
                ) : order.status === status ? (
                  "Current stage · timestamp unavailable"
                ) : current > i ||
                  ["cancelled", "returned"].includes(order.status) ? (
                  "No recorded timestamp"
                ) : (
                  "Awaiting this stage"
                )}
              </small>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
