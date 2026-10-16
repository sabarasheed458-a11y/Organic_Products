import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { RecordEditor } from "@/components/admin/editor";
import { fields } from "@/lib/admin-fields";
import { OrderView } from "@/components/account/order-view";
import type { Order } from "@/types";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaff("orders");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const client = await db();
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Customer could not be loaded.");
  if (!data) notFound();
  const { data: orders, error: ordersError } = await client
    .from("orders")
    .select("*,order_items(*)")
    .eq("user_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (ordersError)
    throw new Error("Customer order history could not be loaded.");
  return (
    <>
      <h1>{data.full_name || "Customer"}</h1>
      <p>
        {data.phone} · {data.role}
      </p>
      {user.profile.role === "owner" && (
        <RecordEditor
          table="staff"
          record={data}
          fields={fields.staff}
          title="Role & account access"
        />
      )}
      <h2>Order history</h2>
      <p className="muted">Showing the latest 100 orders.</p>
      {orders?.map((o) => (
        <OrderView key={o.id} order={o as Order} />
      ))}
      {!orders?.length && <p className="empty">No orders yet.</p>}
    </>
  );
}
