import { NextResponse, type NextRequest } from "next/server";
import { db, configured } from "@/lib/supabase/server";
import { productSelect } from "@/repositories/catalog";
import { z } from "zod";
export async function GET(request: NextRequest) {
  const parsed = z
    .array(z.guid())
    .max(100)
    .safeParse(
      (request.nextUrl.searchParams.get("ids") ?? "")
        .split(",")
        .filter(Boolean),
    );
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid identifiers" }, { status: 400 });
  if (!configured() || !parsed.data.length)
    return NextResponse.json({ products: [] });
  const { data, error } = await (
    await db()
  )
    .from("products")
    .select(productSelect)
    .eq("status", "published")
    .in("id", parsed.data);
  return error
    ? NextResponse.json({ error: "Catalog unavailable" }, { status: 503 })
    : NextResponse.json(
        { products: data },
        { headers: { "Cache-Control": "no-store" } },
      );
}
