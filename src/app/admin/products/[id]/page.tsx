import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/supabase/server";
import { productSelect } from "@/repositories/catalog";
import { ProductEditor } from "@/components/admin/product-editor";
import { notFound } from "next/navigation";
import type { Product } from "@/types";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff("catalog");
  const { id } = await params;
  const client = await db();
  const { data: cats, error: categoryError } = await client
    .from("categories")
    .select("*")
    .order("position");
  if (categoryError) throw new Error("Product categories could not be loaded.");
  let p: Product | null = null;
  if (id !== "new") {
    if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
    const { data, error } = await client
      .from("products")
      .select(productSelect)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("Product could not be loaded.");
    if (!data) notFound();
    p = data as Product;
  }
  return <ProductEditor product={p} categories={cats ?? []} />;
}
