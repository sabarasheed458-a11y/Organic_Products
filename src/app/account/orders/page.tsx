import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase/server";
import { OrderView } from "@/components/account/order-view";
import type { Order } from "@/types";
import Link from "next/link";
import { orderProgress } from "@/repositories/order-progress";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const page = Math.max(1, Math.floor(Number((await searchParams).page) || 1));
  const user = await requireUser();
  const { data, error } = await (
    await db()
  )
    .from("orders")
    .select("*,order_items(*)", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * 20, page * 20 - 1);
  if (error) throw new Error("Orders could not be loaded.");
  const progress = await Promise.all(
    (data ?? []).map((o) => orderProgress(o.id)),
  );
  return (
    <div className="narrow">
      <h1>Your orders</h1>
      {data?.length ? (
        data.map((o, i) => (
          <OrderView order={o as Order} key={o.id} progress={progress[i]} />
        ))
      ) : (
        <div className="empty">
          Your first lovely delivery is waiting to happen.
        </div>
      )}
      <nav className="pagination" aria-label="Order history pages">
        {page > 1 && <Link href={"?page=" + (page - 1)}>Previous</Link>}
        {page > 1 && <span>Page {page}</span>}
        {data?.length === 20 && <Link href={"?page=" + (page + 1)}>Next</Link>}
      </nav>
    </div>
  );
}
