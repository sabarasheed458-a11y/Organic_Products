import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const exchange = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({
  db: async () => ({ auth: { exchangeCodeForSession: exchange } }),
}));
import { GET } from "@/app/auth/callback/route";
beforeEach(() => exchange.mockReset());
it("returns a confirmed session to checkout and preserves that destination on failure", async () => {
  exchange.mockResolvedValue({ error: null });
  const request = new NextRequest(
    "http://localhost:3000/auth/callback?code=test-only&next=%2Fcheckout",
  );
  expect((await GET(request)).headers.get("location")).toBe(
    "http://localhost:3000/checkout",
  );
  exchange.mockResolvedValue({ error: { code: "invalid_grant" } });
  const location = new URL((await GET(request)).headers.get("location")!);
  expect(location.pathname).toBe("/login");
  expect(location.searchParams.get("next")).toBe("/checkout");
  expect(location.searchParams.get("error")).toBe("confirmation");
});
it("rejects external callback destinations", async () => {
  exchange.mockResolvedValue({ error: null });
  const response = await GET(
    new NextRequest(
      "http://localhost:3000/auth/callback?code=test-only&next=https://evil.example",
    ),
  );
  expect(response.headers.get("location")).toBe(
    "http://localhost:3000/account",
  );
});
