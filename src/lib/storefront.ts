import type { Product } from "@/types";
export function productPresentation(product: Product) {
  const variants = product.product_variants.filter((v) => v.active !== false);
  const available = variants.filter(
    (v) => (v.inventory?.on_hand ?? 0) - (v.inventory?.reserved ?? 0) > 0,
  );
  const choices = available.length ? available : variants;
  const prices = choices.map(
    (v) => v.price ?? product.sale_price ?? product.price,
  );
  const price = prices.length
    ? Math.min(...prices)
    : (product.sale_price ?? product.price);
  const varies = new Set(prices).size > 1;
  const discounted =
    choices.some((v) => v.price == null) &&
    product.sale_price != null &&
    product.sale_price < product.price &&
    price === product.sale_price;
  return {
    price,
    varies,
    discounted,
    available: available.length > 0,
    colours: [...new Set(variants.map((v) => v.color))],
  };
}
export function pageWindow(page: number, pages: number) {
  return [
    ...new Set([
      1,
      ...Array.from({ length: 5 }, (_, i) => page - 2 + i).filter(
        (p) => p > 0 && p <= pages,
      ),
      pages,
    ]),
  ]
    .filter((p) => p > 0)
    .sort((a, b) => a - b);
}
