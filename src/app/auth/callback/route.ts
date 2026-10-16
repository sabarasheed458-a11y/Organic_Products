import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/supabase/server";
import { safePath } from "@/lib/utils";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safePath(request.nextUrl.searchParams.get("next"));
  try {
    if (code) {
      const { error } = await (await db()).auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, request.url));
    }
  } catch {
    /* Invalid configuration or exchange failure must not expose SDK details. */
  }
  return NextResponse.redirect(
    new URL(
      "/login?error=confirmation&next=" + encodeURIComponent(next),
      request.url,
    ),
  );
}
