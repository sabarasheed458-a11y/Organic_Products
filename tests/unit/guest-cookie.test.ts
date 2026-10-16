import { beforeEach, expect, it, vi } from "vitest";
const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => jar }));
import { guestToken, guestCookie } from "@/lib/security/guest-checkout";
beforeEach(() => {
  vi.clearAllMocks();
  jar.get.mockReturnValue(undefined);
});
it("only creates a high entropy private cookie on explicit creation", async () => {
  expect(await guestToken()).toBeNull();
  expect(jar.set).not.toHaveBeenCalled();
  const token = await guestToken(true);
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  expect(jar.set).toHaveBeenCalledWith(
    guestCookie,
    token,
    expect.objectContaining({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 2592000,
    }),
  );
});
it("preserves valid access and rejects malformed cookies", async () => {
  jar.get.mockReturnValue({ value: "b".repeat(64) });
  expect(await guestToken(true)).toBe("b".repeat(64));
  expect(jar.set).not.toHaveBeenCalled();
  jar.get.mockReturnValue({ value: "malformed" });
  expect(await guestToken()).toBeNull();
});
it("marks the guest capability Secure in production", async () => {
  vi.stubEnv("NODE_ENV", "production");
  try {
    await guestToken(true);
    expect(jar.set).toHaveBeenCalledWith(
      guestCookie,
      expect.any(String),
      expect.objectContaining({ secure: true }),
    );
  } finally {
    vi.unstubAllEnvs();
  }
});
