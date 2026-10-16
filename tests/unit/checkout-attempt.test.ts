import { describe, expect, it, vi } from "vitest";
import { checkoutAttempt } from "@/lib/checkout-attempt";
describe("Checkout retry identity", () => {
  function storage() {
    let value: string | null = null;
    return {
      getItem: vi.fn(() => value),
      setItem: vi.fn((_: string, next: string) => {
        value = next;
      }),
    };
  }
  it("keeps the same key across retries and changes it only for changed input", () => {
    const s = storage(),
      first = checkoutAttempt(s, "cart-address-coupon");
    expect(checkoutAttempt(s, "cart-address-coupon")).toBe(first);
    expect(checkoutAttempt(s, "changed-cart")).not.toBe(first);
  });
  it("replaces corrupted storage and invalid keys", () => {
    const s = storage();
    s.getItem.mockReturnValue("{");
    expect(checkoutAttempt(s, "details")).toMatch(/^[0-9a-f-]{36}$/);
    s.getItem.mockReturnValue(
      JSON.stringify({ fingerprint: "details", key: "invalid" }),
    );
    expect(checkoutAttempt(s, "details")).not.toBe("invalid");
  });
  it("fails before submission when a retry reference cannot be persisted", () => {
    const s = storage();
    s.setItem.mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    expect(() => checkoutAttempt(s, "details")).toThrow("Storage blocked");
  });
});
