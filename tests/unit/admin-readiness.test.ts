import { beforeEach, describe, expect, it, vi } from "vitest";
import { utcSchedule, codReconciliation } from "@/lib/admin-input";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RecordEditor } from "@/components/admin/editor";
import { fields } from "@/lib/admin-fields";
const mocks = vi.hoisted(() => ({
  db: vi.fn(),
  staff: vi.fn(),
  user: vi.fn(),
  reports: vi.fn(),
}));
vi.mock("@/lib/security/guest-checkout", () => ({
  guestToken: async () => null,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  db: mocks.db,
  configured: () => true,
}));
vi.mock("@/lib/auth", () => ({
  requireStaff: mocks.staff,
  requireUser: mocks.user,
  currentUser: mocks.user,
}));
vi.mock("@/repositories/reports", () => ({ reportOrders: mocks.reports }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  useRouter: vi.fn(),
}));
import Module from "@/app/admin/[section]/page";
import Dashboard from "@/app/admin/page";
import Product from "@/app/admin/products/[id]/page";
import Customer from "@/app/admin/customers/[id]/page";
import Order from "@/app/admin/orders/[id]/page";
import Checkout from "@/app/checkout/page";
import Tracking from "@/app/track-order/page";
import Confirmation from "@/app/order-confirmation/[orderId]/page";
import { catalog } from "@/repositories/catalog";
const id = "00000000-0000-4000-8000-000000000001";
function transport(failing = "", singleData: unknown = { id }) {
  const chains: Record<string, ReturnType<typeof chain>> = {};
  function chain(table: string) {
    const result = {
      data: table === failing ? null : [],
      error: table === failing ? { message: "PRIVATE_TRANSPORT_ERROR" } : null,
      count: 0,
    };
    const q = {
      select: vi.fn(),
      order: vi.fn(),
      eq: vi.fn(),
      neq: vi.fn(),
      ilike: vi.fn(),
      range: vi.fn(),
      limit: vi.fn(),
      gte: vi.fn(),
      lte: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        ...result,
        data: table === failing ? null : singleData,
      }),
      then: (resolve: (value: typeof result) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    for (const method of [
      "select",
      "order",
      "eq",
      "neq",
      "ilike",
      "range",
      "limit",
      "gte",
      "lte",
    ] as const)
      q[method].mockReturnValue(q);
    return q;
  }
  return {
    chains,
    from: vi.fn((table: string) => (chains[table] ??= chain(table))),
    rpc: vi.fn().mockResolvedValue({
      data: [],
      error: failing === "timeline" ? { message: "PRIVATE" } : null,
    }),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.staff.mockResolvedValue({ id, profile: { role: "owner" } });
  mocks.user.mockResolvedValue({ id });
  mocks.reports.mockResolvedValue([]);
});
describe("Admin and customer server views (mocked Supabase transport)", () => {
  it.each([
    ["products", "catalog"],
    ["categories", "catalog"],
    ["inventory", "catalog"],
    ["orders", "orders"],
    ["customers", "orders"],
    ["inquiries", "orders"],
    ["coupons", "settings"],
    ["promotions", "settings"],
    ["content", "settings"],
    ["settings", "settings"],
    ["reports", "settings"],
    ["staff", "settings"],
  ])(
    "constructs %s and requests its required scope",
    async (section, scope) => {
      mocks.db.mockResolvedValue(transport());
      expect(
        await Module({
          params: Promise.resolve({ section }),
          searchParams: Promise.resolve({}),
        }),
      ).toBeTruthy();
      expect(mocks.staff).toHaveBeenCalledWith(scope);
    },
  );
  it.each(["__proto__", "constructor", "unknown"])(
    "returns 404 for unknown module %s before querying",
    async (section) => {
      await expect(
        Module({
          params: Promise.resolve({ section }),
          searchParams: Promise.resolve({}),
        }),
      ).rejects.toThrow("NOT_FOUND");
      expect(mocks.db).not.toHaveBeenCalled();
    },
  );
  it.each(["orders", "inventory", "admin_audit_logs"])(
    "does not turn failed dashboard %s into zero metrics",
    async (table) => {
      mocks.db.mockResolvedValue(transport(table));
      await expect(
        Dashboard({ searchParams: Promise.resolve({}) }),
      ).rejects.toThrow("could not be loaded");
    },
  );
  it("does not query dashboard data outside a staff role's scope", async () => {
    const t = transport();
    mocks.db.mockResolvedValue(t);
    mocks.staff.mockResolvedValue({ id, profile: { role: "catalog_manager" } });
    await Dashboard({ searchParams: Promise.resolve({}) });
    expect(t.from.mock.calls.map((c) => c[0])).toEqual(["inventory"]);
  });
  it("reports failed category reads rather than a misleading empty editor", async () => {
    mocks.db.mockResolvedValue(transport("categories"));
    await expect(
      Product({ params: Promise.resolve({ id: "new" }) }),
    ).rejects.toThrow("categories could not be loaded");
    await expect(catalog({ category: "robes" })).rejects.toThrow(
      "Collection could not be loaded",
    );
  });
  it("reports a failed customer history rather than no orders", async () => {
    mocks.db.mockResolvedValue(transport("orders"));
    await expect(Customer({ params: Promise.resolve({ id }) })).rejects.toThrow(
      "history could not be loaded",
    );
  });
  it("reports timeline failures instead of claiming access is restricted", async () => {
    mocks.db.mockResolvedValue(transport("timeline"));
    await expect(Order({ params: Promise.resolve({ id }) })).rejects.toThrow(
      "timeline could not be loaded",
    );
  });
  it("reports failed checkout address, tracking and confirmation reads", async () => {
    mocks.db.mockResolvedValue(transport("addresses"));
    await expect(Checkout()).rejects.toThrow("addresses could not be loaded");
    mocks.db.mockResolvedValue(transport("orders"));
    await expect(
      Tracking({ searchParams: Promise.resolve({ reference: "MM-TEST" }) }),
    ).rejects.toThrow("tracking could not be loaded");
    await expect(
      Confirmation({ params: Promise.resolve({ orderId: id }) }),
    ).rejects.toThrow("confirmation could not be loaded");
  });
  it("distinguishes a genuinely absent order from a transport failure", async () => {
    const t = transport("", null);
    mocks.db.mockResolvedValue(t);
    await expect(
      Confirmation({ params: Promise.resolve({ orderId: id }) }),
    ).rejects.toThrow("NOT_FOUND");
    expect(t.chains.orders.eq).toHaveBeenCalledWith("user_id", id);
  });
});
describe("Operational editor regressions", () => {
  it.each(["categories", "banners", "store_settings"])(
    "renders a file picker for %s images while preserving URL entry",
    (table) => {
      const html = renderToStaticMarkup(
        createElement(RecordEditor, {
          table,
          fields: fields[table],
          title: "Edit content",
        }),
      );
      expect(html).toContain('type="file"');
      expect(html).toContain('accept="image/jpeg,image/png,image/webp"');
      expect(html).toContain("Use an existing store image URL");
      expect(html).toContain('type="hidden"');
    },
  );
  it("stores the UTC clock entered by staff regardless of browser timezone", () => {
    expect(utcSchedule("2026-10-12T10:30")).toBe("2026-10-12T10:30:00.000Z");
    expect(() => utcSchedule("invalid")).toThrow();
    expect(() => utcSchedule("2026-02-30T10:30")).toThrow();
  });
  it("supports late COD collection after return and refund only after collection", () => {
    expect(codReconciliation("returned", "unpaid")).toBe("paid");
    expect(codReconciliation("returned", "paid")).toBe("refunded");
    expect(codReconciliation("delivered", "unpaid")).toBe("paid");
    expect(codReconciliation("shipped", "unpaid")).toBeNull();
    expect(codReconciliation("returned", "refunded")).toBeNull();
  });
});
