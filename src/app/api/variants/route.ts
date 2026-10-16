import { NextResponse, type NextRequest } from "next/server";
import { db, configured } from "@/lib/supabase/server";
import { productSelect } from "@/repositories/catalog";
import { z } from "zod";
export async function GET(request: NextRequest) {
  const parsed = z
    .array(z.guid())
    .max(50)
    .safeParse(
      (request.nextUrl.searchParams.get("ids") ?? "")
        .split(",")
        .filter(Boolean),
    );
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid identifiers" }, { status: 400 });
  if (!configured() || !parsed.data.length)
    return NextResponse.json({ products: [] });
  const client = await db();
  const { data: variants, error: ve } = await client
    .from("product_variants")
    .select("product_id")
    .in("id", parsed.data)
    .eq("active", true);
  if (ve)
    return NextResponse.json({ error: "Catalog unavailable" }, { status: 503 });
  const { data, error } = await client
    .from("products")
    .select(productSelect)
    .eq("status", "published")
    .in("id", [...new Set(variants?.map((v) => v.product_id) ?? [])]);
  return error
    ? NextResponse.json({ error: "Catalog unavailable" }, { status: 503 })
    : NextResponse.json(
        { products: data },
        { headers: { "Cache-Control": "no-store" } },
      );
}
