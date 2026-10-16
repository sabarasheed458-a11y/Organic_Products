import { NextResponse, type NextRequest } from "next/server";
import { staff } from "@/lib/auth";
import { reportOrders } from "@/repositories/reports";
import { csvCell } from "@/lib/utils";
export async function GET(request: NextRequest) {
  try {
    await staff("settings");
    const from = request.nextUrl.searchParams.get("from") ?? "2026-01-01",
      to =
        request.nextUrl.searchParams.get("to") ??
        new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
      return NextResponse.json(
        { error: "Invalid date range" },
        { status: 400 },
      );
    const data = await reportOrders(from, to);
    const cols = [
      "reference",
      "status",
      "payment_status",
      "subtotal",
      "discount",
      "shipping",
      "total",
      "created_at",
    ];
    const csv = [
      cols.join(","),
      ...(data ?? []).map((row) =>
        cols.map((c) => csvCell(row[c as keyof typeof row])).join(","),
      ),
    ].join("\r\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="maison-mira-orders.csv"',
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Export unavailable or access denied" },
      { status: 403 },
    );
  }
}
