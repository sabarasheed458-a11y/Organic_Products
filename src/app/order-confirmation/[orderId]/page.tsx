import { currentUser, requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { OrderView } from "@/components/account/order-view";
import { guestToken } from "@/lib/security/guest-checkout";
import type { Order } from "@/types";
import { orderProgress } from "@/repositories/order-progress";
export const metadata = {
  title: "Order confirmation",
  robots: { index: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const user = await currentUser(),
    { orderId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) notFound();
  const token = await guestToken();
  if (!user && !token) await requireUser("/order-confirmation/" + orderId);
  const client = await db();
  let data: Order | null = null;
  if (user) {
    const response = await client
      .from("orders")
      .select("*,order_items(*)")
      .eq("id", orderId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (response.error)
      throw new Error("Order confirmation could not be loaded.");
    data = response.data as Order | null;
  }
  if (!data && token) {
    const response = await client.rpc("guest_order", {
      p_order: orderId,
      p_token: token,
    });
    if (response.error)
      throw new Error("Order confirmation could not be loaded.");
    data = response.data as Order | null;
  }
  if (!data) notFound();
  return (
    <div className="section narrow">
      <p className="eyebrow">THANK YOU FOR CHOOSING US</p>
      <h1>Your lovely things are on their way.</h1>
      <p>Your order has been received. We’ll confirm it before dispatch.</p>
      <OrderView
        order={data as Order}
        progress={await orderProgress(orderId)}
      />
    </div>
  );
}
