import { describe, it, expect } from "vitest";
import { safePath } from "@/lib/utils";
import { cartSchema } from "@/lib/validation";
import { authErrorMessage, logAuthFailure } from "@/lib/security/auth-errors";
import { vi } from "vitest";
import { isPublicSupabaseKey } from "@/lib/security/config";
import {
  PublicError,
  safeErrorMessage,
  rpcPayload,
} from "@/lib/security/errors";
describe("Security boundary helpers", () => {
  it("distinguishes confirmation-email quotas and logs only fixed Auth metadata", () => {
    expect(
      authErrorMessage({ code: "over_email_send_rate_limit", status: 429 }),
    ).toContain("confirmation-email sending limit");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      logAuthFailure("register", { code: "PRIVATE_VALUE", status: 429 });
      expect(warn).toHaveBeenCalledWith("Auth request rejected", {
        operation: "register",
        code: "auth_error",
        status: 429,
      });
    } finally {
      warn.mockRestore();
    }
  });
  it("rejects duplicate UUIDs with different text casing", () => {
    const id = "a0000000-0000-4000-8000-000000000001";
    expect(
      cartSchema.safeParse([
        { variant_id: id, quantity: 1 },
        { variant_id: id.toUpperCase(), quantity: 1 },
      ]).success,
    ).toBe(false);
  });
  it("blocks URL normalization of a tab into an external auth redirect", () => {
    const path = "/\t/evil.example";
    expect(new URL(path, "https://store.example").origin).toBe(
      "https://evil.example",
    );
    expect(safePath(path)).toBe("/account");
    expect(safePath("/account/orders?view=recent")).toBe(
      "/account/orders?view=recent",
    );
    expect(safePath({} as string)).toBe("/account");
  });
  it("rejects secret/service-role keys without including them in errors", () => {
    const token = (role: string) =>
      "header." +
      Buffer.from(JSON.stringify({ role })).toString("base64url") +
      ".test-signature";
    expect(isPublicSupabaseKey(token("service_role"))).toBe(false);
    expect(isPublicSupabaseKey("sb_secret_TEST_ONLY")).toBe(false);
    expect(isPublicSupabaseKey(token("anon"))).toBe(true);
    expect(isPublicSupabaseKey("sb_publishable_TEST_ONLY")).toBe(true);
    expect(isPublicSupabaseKey("not-a-key")).toBe(false);
  });
  it("does not send unexpected SDK errors or credentials to callers", () => {
    expect(
      safeErrorMessage(new Error("private-secret-test-only"), "Try again"),
    ).toBe("Try again");
    expect(
      safeErrorMessage(new PublicError("Invalid quantity"), "Try again"),
    ).toBe("Invalid quantity");
  });
  it("maps committed RPC error envelopes to failed actions", () => {
    expect(() => rpcPayload({ error: "Coupon is unavailable" })).toThrow(
      "Coupon is unavailable",
    );
    expect(rpcPayload({ id: "order-test-only" })).toEqual({
      id: "order-test-only",
    });
    expect(rpcPayload(null)).toBeNull();
  });
});
