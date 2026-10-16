import { expect, it } from "vitest";
import { hasSizes, productGallery } from "@/lib/product-options";
import type { Product } from "@/types";
const product = {
  product_variants: [{ size: "M" }],
  product_images: [
    {
      id: "1",
      url: "/front.png",
      alt: "Front",
      position: 5,
      view: "front",
      color: null,
    },
    {
      id: "2",
      url: "/blue.png",
      alt: "Blue front",
      position: 0,
      view: "front",
      color: "Blue",
    },
    {
      id: "3",
      url: "/back.png",
      alt: "Back",
      position: 4,
      view: "back",
      color: null,
    },
  ],
} as Product;
it("orders explicit views and prefers matching color photos without duplicating slots", () => {
  expect(productGallery(product, "Blue").map((i) => i.url)).toEqual([
    "/blue.png",
    "/back.png",
  ]);
  expect(productGallery(product, "Red").map((i) => i.url)).toEqual([
    "/front.png",
    "/back.png",
  ]);
  expect(productGallery({ ...product, product_images: [] }, "Blue")).toEqual(
    [],
  );
});
it("preserves legacy sizing and honors explicit unsized products", () => {
  expect(hasSizes(product)).toBe(true);
  expect(hasSizes({ ...product, has_sizes: false })).toBe(false);
});
