import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error("REDIRECT:" + path);
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  db: async () => ({ auth: { signOut: mocks.signOut } }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { signOut } from "@/actions/auth";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("does not claim logout succeeded or redirect when Supabase rejects it", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  mocks.signOut.mockResolvedValue({
    error: {
      code: "unexpected_failure",
      status: 503,
      message: "PRIVATE_DETAIL",
    },
  });
  await expect(signOut()).rejects.toThrow("Sign out could not be completed");
  expect(mocks.redirect).not.toHaveBeenCalled();
});
it("logs out admin and customer sessions through the same action before redirecting", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  mocks.signOut.mockResolvedValue({ error: null });
  await expect(signOut()).rejects.toThrow("REDIRECT:/");
  expect(mocks.signOut).toHaveBeenCalledTimes(1);
  expect(mocks.redirect).toHaveBeenCalledWith("/");
});
