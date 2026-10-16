"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { transitions, orderStatusLabel } from "@/lib/utils";
import { codReconciliation } from "@/lib/admin-input";
import { actionRequest } from "@/lib/action-request";
import { updateOrder, recordPayment } from "@/actions/commerce";
import type { Order } from "@/types";
export function OrderActions({ order }: { order: Order }) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  const pending = useRef(false);
  const reconciliation = codReconciliation(order.status, order.payment_status);
  return (
    <div className="panel">
      <h2>Order management</h2>
      {transitions[order.status]?.length > 0 && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (pending.current) return;
            const f = new FormData(e.currentTarget);
            if (!confirm(`Change order to ${f.get("status")}?`)) return;
            pending.current = true;
            setBusy(true);
            const r = await actionRequest(() =>
              updateOrder({
                id: order.id,
                status: f.get("status"),
                tracking: f.get("tracking"),
                courier: f.get("courier"),
                reason: f.get("reason"),
              }),
            );
            setBusy(false);
            pending.current = false;
            setMessage(r.message);
            if (r.ok) router.refresh();
          }}
        >
          <div className="form-grid">
            <label>
              New status
              <select name="status">
                {transitions[order.status].map((s) => (
                  <option key={s} value={s}>
                    {orderStatusLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Courier
              <input
                name="courier"
                maxLength={120}
                defaultValue={order.courier}
              />
            </label>
            <label>
              Tracking number
              <input
                name="tracking"
                maxLength={120}
                defaultValue={order.tracking_number}
              />
            </label>
            <label>
              Reason
              <input name="reason" minLength={3} maxLength={500} required />
            </label>
          </div>
          <button className="btn btn-primary" disabled={busy}>
            Update order
          </button>
        </form>
      )}
      {reconciliation && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (pending.current) return;
            if (!confirm("Record confirmed COD collection or refund?")) return;
            pending.current = true;
            setBusy(true);
            const form = new FormData(e.currentTarget);
            const r = await actionRequest(() =>
              recordPayment({
                id: order.id,
                status: reconciliation,
                reason: form.get("reason"),
              }),
            );
            setBusy(false);
            pending.current = false;
            setMessage(r.message);
            if (r.ok) router.refresh();
          }}
        >
          <label>
            Payment reconciliation reason
            <input name="reason" required minLength={3} maxLength={500} />
          </label>
          <button disabled={busy} className="btn btn-outline">
            {reconciliation === "refunded"
              ? "Record completed refund"
              : "Record collected COD payment"}
          </button>
        </form>
      )}
      <p role="status">{message}</p>
    </div>
  );
}
