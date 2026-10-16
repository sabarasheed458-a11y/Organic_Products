import { requireUser, currentUser } from "@/lib/auth";
import { guestToken } from "@/lib/security/guest-checkout";
import { db } from "@/lib/supabase/server";
import { OrderView } from "@/components/account/order-view";
import type { Order } from "@/types";
import { orderProgress } from "@/repositories/order-progress";
export const metadata = { title: "Track your order", robots: { index: false } };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string }>;
}) {
  const user = await currentUser(),
    token = await guestToken();
  if (!user && !token) await requireUser("/track-order");
  const ref = ((await searchParams).reference ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 40);
  let order: Order | null = null;
  if (ref && user) {
    const { data, error } = await (
      await db()
    )
      .from("orders")
      .select("*,order_items(*)")
      .eq("reference", ref)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw new Error("Order tracking could not be loaded.");
    order = data as Order | null;
  }
  if (ref && !order && token) {
    const { data, error } = await (
      await db()
    ).rpc("guest_order_by_reference", { p_reference: ref, p_token: token });
    if (error) throw new Error("Order tracking could not be loaded.");
    order = data as Order | null;
  }
  return (
    <div className="section narrow">
      <h1>A little closer to your door.</h1>
      <form className="filters">
        <input
          name="reference"
          placeholder="Order reference, e.g. MM-…"
          defaultValue={ref}
          required
          maxLength={40}
          aria-label="Order reference"
        />
        <button className="btn btn-primary">Track order</button>
      </form>
      {order ? (
        <OrderView order={order} progress={await orderProgress(order.id)} />
      ) : ref ? (
        <p role="status">
          No matching order was found for this account or browser.
        </p>
      ) : (
        <p className="muted">
          Enter the reference from your order confirmation.
        </p>
      )}
    </div>
  );
}
