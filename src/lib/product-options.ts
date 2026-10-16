import type { Product } from "@/types";
export const imageViews = ["front", "back", "top", "bottom"] as const;
export function hasSizes(product: Product) {
  return (
    product.has_sizes ??
    product.product_variants.some(
      (v) => !["one size", "default", ""].includes(v.size.toLowerCase()),
    )
  );
}
export function productGallery(product: Product, color: string) {
  const eligible = product.product_images.filter(
    (i) => !i.color || i.color.toLowerCase() === color.toLowerCase(),
  );
  const views = imageViews.flatMap((view) => {
    const matches = eligible.filter((i) => i.view === view);
    const image = matches.find((i) => !!i.color) ?? matches[0];
    return image ? [image] : [];
  });
  const images = [
    ...views,
    ...eligible.filter((i) => !i.view).sort((a, b) => a.position - b.position),
  ];
  const seen = new Set<string>();
  return images.filter((i) => {
    if (seen.has(i.url)) return false;
    seen.add(i.url);
    return true;
  });
}
