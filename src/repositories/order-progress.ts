import "server-only";
import { db } from "@/lib/supabase/server";
import { guestToken } from "@/lib/security/guest-checkout";
import type { OrderProgress } from "@/types";
export async function orderProgress(id: string) {
  const { data, error } = await (
    await db()
  ).rpc("order_progress", { p_order: id, p_token: await guestToken() });
  if (error)
    throw new Error("Order progress and feedback could not be loaded.");
  return data as OrderProgress | null;
}
