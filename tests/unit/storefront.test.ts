import { describe, it, expect } from "vitest";
import { productPresentation, pageWindow } from "@/lib/storefront";
import { money } from "@/lib/utils";
import type { Product, Variant } from "@/types";
const variant = (price: number | null, stock = 3, active = true) =>
  ({
    price,
    active,
    color: "Ivory",
    inventory: { on_hand: stock, reserved: 0 },
  }) as Variant;
const product = (variants: Variant[], sale: number | null = 400000) =>
  ({ price: 500000, sale_price: sale, product_variants: variants }) as Product;
describe("Storefront prices and availability", () => {
  it("preserves fractional rupee amounts instead of rounding displayed totals", () => {
    expect(money(199999)).toContain("1,999.99");
    expect(money(650000)).toContain("6,500");
    expect(money(650000)).not.toContain(".00");
  });
  it("shows the minimum purchasable variant price and a From label when prices vary", () => {
    const info = productPresentation(
      product([variant(600000), variant(450000)]),
    );
    expect(info.price).toBe(450000);
    expect(info.varies).toBe(true);
    expect(info.discounted).toBe(false);
  });
  it("does not advertise an unavailable or inactive cheap variant", () => {
    const info = productPresentation(
      product([variant(100000, 0), variant(200000, 3, false), variant(600000)]),
    );
    expect(info.price).toBe(600000);
    expect(info.available).toBe(true);
    expect(info.discounted).toBe(false);
  });
  it("only strikes the regular price when an applicable base sale is cheaper", () => {
    expect(productPresentation(product([variant(null)])).discounted).toBe(true);
    expect(
      productPresentation(product([variant(null)], 500000)).discounted,
    ).toBe(false);
  });
  it("marks products with no stock sold out and excludes inactive colours", () => {
    expect(productPresentation(product([variant(null, 0)])).available).toBe(
      false,
    );
    expect(
      productPresentation(product([variant(null, 3, false)])).colours,
    ).toEqual([]);
  });
});
describe("Catalog pagination", () => {
  it("keeps the current page reachable beyond page 20", () => {
    expect(pageWindow(35, 80)).toEqual([1, 33, 34, 35, 36, 37, 80]);
  });
  it("handles boundaries without duplicates or invalid pages", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(80, 80)).toEqual([1, 78, 79, 80]);
  });
});
