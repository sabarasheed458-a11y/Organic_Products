import { describe, it, expect } from "vitest";
import {
  checkoutSchema,
  productSchema,
  validImageSignature,
  cartSchema,
} from "@/lib/validation";
import { csvCell, safePath, can, transitions, money } from "@/lib/utils";
const uuid = "00000000-0000-4000-8000-000000000001";
describe("Checkout validation", () => {
  it("accepts canonical PostgreSQL record IDs without RFC version bits", () => {
    const id = "a0000001-0000-0000-0000-000000000000";
    expect(cartSchema.parse([{ variant_id: id, quantity: 1 }])[0].variant_id).toBe(id);
    expect(cartSchema.safeParse([{ variant_id: "not-an-id", quantity: 1 }]).success).toBe(false);
    expect(cartSchema.safeParse([{ variant_id: id, quantity: 1 }, { variant_id: id.toUpperCase(), quantity: 1 }]).success).toBe(false);
  });
  it("rejects duplicate variants, fractional and excessive quantities", () => {
    expect(
      cartSchema.safeParse([
        { variant_id: uuid, quantity: 1 },
        { variant_id: uuid, quantity: 1 },
      ]).success,
    ).toBe(false);
    for (const quantity of [0, -1, 1.5, 100])
      expect(
        cartSchema.safeParse([{ variant_id: uuid, quantity }]).success,
      ).toBe(false);
  });
  it("requires a valid address and removes client totals from input", () => {
    const input = {
      items: [{ variant_id: uuid, quantity: 2 }],
      address: {
        full_name: "Ayesha Khan",
        phone: "+92 300 1234567",
        line1: "12 Garden Road",
        city: "Lahore",
      },
      key: uuid,
      total: 1,
    };
    const parsed = checkoutSchema.parse(input);
    expect(parsed).not.toHaveProperty("total");
    expect(parsed.address.postal_code).toBe("");
    expect(
      checkoutSchema.safeParse({
        ...input,
        address: { ...input.address, phone: "bad" },
      }).success,
    ).toBe(false);
  });
  it("validates sale prices and slug syntax", () => {
    const p = {
      name: "Soft robe",
      slug: "soft-robe",
      sku: "MM-001",
      price: 10000,
      sale_price: 11000,
      status: "published",
      category_id: null,
      featured: false,
      tags: [],
    };
    expect(productSchema.safeParse(p).success).toBe(false);
    expect(productSchema.safeParse({ ...p, sale_price: 9000 }).success).toBe(
      true,
    );
    expect(
      productSchema.safeParse({ ...p, sale_price: null, slug: "../x" }).success,
    ).toBe(false);
  });
});
describe("Security helpers", () => {
  it("blocks external redirects, backslashes and newline injection", () => {
    for (const path of ["//evil.test", "https://evil.test", "/\\evil", "/ok\n"])
      expect(safePath(path)).toBe("/account");
    expect(safePath("/admin")).toBe("/admin");
  });
  it("escapes CSV formula injection and embedded quotes", () => {
    expect(csvCell('=IMPORTXML("x")')).toBe('"\'=IMPORTXML(""x"")"');
    expect(csvCell("normal")).toBe('"normal"');
  });
  it("enforces least privilege", () => {
    expect(can("customer", "orders")).toBe(false);
    expect(can("catalog_manager", "orders")).toBe(false);
    expect(can("order_manager", "catalog")).toBe(false);
    expect(can("catalog_manager", "catalog")).toBe(true);
    expect(can("owner", "settings")).toBe(true);
  });
  it("allows only documented order transitions", () => {
    expect(transitions.pending).toContain("delivered");
    expect(transitions.cancelled).toEqual([]);
    expect(transitions.delivered).toEqual(["returned"]);
  });
  it("validates image magic bytes, rejecting SVG and disguised uploads", () => {
    expect(
      validImageSignature(Uint8Array.from([255, 216, 255]), "image/jpeg"),
    ).toBe(true);
    expect(
      validImageSignature(
        Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
        "image/png",
      ),
    ).toBe(true);
    expect(
      validImageSignature(new TextEncoder().encode("<script>"), "image/jpeg"),
    ).toBe(false);
    expect(
      validImageSignature(new TextEncoder().encode("<svg>"), "image/svg+xml"),
    ).toBe(false);
  });
  it("formats paisa as PKR rupees", () => {
    expect(money(25000)).toContain("250");
  });
});
