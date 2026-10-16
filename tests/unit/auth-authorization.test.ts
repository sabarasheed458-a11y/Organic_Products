import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  db: vi.fn(),
  reports: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(path);
  }),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  db: mocks.db,
  configured: () => true,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/repositories/reports", () => ({ reportOrders: mocks.reports }));
import { currentUser, staff, requireStaff, requireUser } from "@/lib/auth";
import { GET } from "@/app/api/admin/export/route";
import { signOut } from "@/actions/auth";
const id = "00000000-0000-4000-8000-000000000011";
function account(role: string, metadataRole = "owner") {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    update: vi.fn(),
    single: vi
      .fn()
      .mockResolvedValue({ data: { id, role, active: true }, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const getUser = vi
    .fn()
    .mockResolvedValue({
      data: { user: { id, user_metadata: { role: metadataRole } } },
      error: null,
    });
  const client = {
    auth: {
      getUser,
      signOut: vi.fn(async () => {
        getUser.mockResolvedValue({ data: { user: null }, error: null });
        return { error: null };
      }),
    },
    from: vi.fn().mockReturnValue(query),
  };
  mocks.db.mockResolvedValue(client);
  return { client, query };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.reports.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());
it.each(["owner", "customer"])(
  "%s logout removes the session used by subsequent protected guards",
  async (role) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
    const { client, query } = account(role);
    expect((await requireUser()).id).toBe(id);
    await expect(signOut()).rejects.toThrow(/^\/$/);
    await expect(requireStaff()).rejects.toThrow("/login?next=/admin");
    await expect(requireUser("/checkout")).rejects.toThrow(
      "/login?next=%2Fcheckout",
    );
    expect(client.auth.signOut).toHaveBeenCalledTimes(1);
    expect(query.update).not.toHaveBeenCalled();
  },
);
it.each([
  ["owner", "settings"],
  ["manager", "settings"],
  ["catalog_manager", "catalog"],
  ["order_manager", "orders"],
])(
  "permits %s only through verified database role for %s",
  async (role, scope) => {
    const { query } = account(role, "customer");
    expect((await staff(scope)).profile.role).toBe(role);
    expect((await requireStaff(scope)).profile.role).toBe(role);
    expect((await requireUser("/checkout")).profile.role).toBe(role);
    expect(query.eq).toHaveBeenCalledWith("id", id);
    expect(query.update).not.toHaveBeenCalled();
  },
);
it("denies customer admin routes/actions even if metadata claims owner", async () => {
  const { query } = account("customer", "owner");
  for (const scope of ["catalog", "orders", "settings"])
    await expect(staff(scope)).rejects.toThrow("permission");
  await expect(requireStaff()).rejects.toThrow("/account");
  expect((await requireUser("/checkout")).id).toBe(id);
  expect(query.update).not.toHaveBeenCalled();
});
it("rejects customers at the actual export handler before reading financial data", async () => {
  account("customer");
  const result = await GET(
    new NextRequest("http://localhost:3000/api/admin/export?role=owner"),
  );
  expect(result.status).toBe(403);
  expect(mocks.reports).not.toHaveBeenCalled();
});
it("permits owner exports without mutating account roles", async () => {
  const { query } = account("owner", "customer");
  expect(
    (await GET(new NextRequest("http://localhost:3000/api/admin/export")))
      .status,
  ).toBe(200);
  expect(query.update).not.toHaveBeenCalled();
  expect((await currentUser())?.profile.role).toBe("owner");
});
it.each([
  ["catalog_manager", "orders"],
  ["order_manager", "catalog"],
])("keeps %s out of %s operations", async (role, scope) => {
  account(role);
  await expect(staff(scope)).rejects.toThrow("permission");
  await expect(requireStaff(scope)).rejects.toThrow("/admin?denied=1");
});
