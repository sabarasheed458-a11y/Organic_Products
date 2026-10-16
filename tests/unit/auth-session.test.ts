import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  db: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(url);
  }),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  db: mocks.db,
  configured: () => true,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { requireUser } from "@/lib/auth";
const id = "00000000-0000-4000-8000-000000000011";
beforeEach(() => vi.clearAllMocks());
it("restores a verified active session without redirecting checkout, including repeat reads", async () => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi
      .fn()
      .mockResolvedValue({
        data: { active: true, role: "customer" },
        error: null,
      }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const client = {
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id } }, error: null }),
    },
    from: vi.fn().mockReturnValue(query),
  };
  mocks.db.mockResolvedValue(client);
  for (let i = 0; i < 2; i++)
    expect((await requireUser("/checkout")).id).toBe(id);
  expect(mocks.redirect).not.toHaveBeenCalled();
  expect(query.eq).toHaveBeenCalledWith("id", id);
});
it("redirects an unauthenticated checkout to login with its destination", async () => {
  mocks.db.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  });
  await expect(requireUser("/checkout")).rejects.toThrow(
    "/login?next=%2Fcheckout",
  );
});
