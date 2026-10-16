import "server-only";
import { db } from "@/lib/supabase/server";
import { staff } from "@/lib/auth";
import type { Order } from "@/types";
export type ReportOrder = Pick<
  Order,
  | "id"
  | "reference"
  | "status"
  | "payment_status"
  | "subtotal"
  | "discount"
  | "shipping"
  | "total"
  | "created_at"
> & {
  order_items: {
    product_name: string;
    quantity: number;
    line_total: number;
    product_variants: {
      products: { categories: { name: string } | null } | null;
    } | null;
  }[];
};
export async function reportOrders(
  from: string,
  to: string,
): Promise<ReportOrder[]> {
  await staff("settings");
  const client = await db();
  const result: ReportOrder[] = [];
  for (let offset = 0; offset < 5000; offset += 500) {
    const { data, error } = await client
      .from("orders")
      .select(
        "id,reference,status,payment_status,subtotal,discount,shipping,total,created_at,order_items(product_name,quantity,line_total,product_variants(products(categories(name))))",
      )
      .gte("created_at", from + "T00:00:00+05:00")
      .lte("created_at", to + "T23:59:59+05:00")
      .order("created_at")
      .order("id")
      .range(offset, offset + 499);
    if (error) throw new Error("Report could not be loaded.");
    result.push(...((data ?? []) as unknown as ReportOrder[]));
    if ((data?.length ?? 0) < 500) break;
  }
  return result;
}
