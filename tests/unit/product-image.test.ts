import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductImage } from "@/components/product/product-image";
it("renders a fallback rather than throwing for unconfigured or unsafe image hosts", () => {
  for (const src of [
    "https://unconfigured.example/image.png",
    "//unconfigured.example/image.png",
    "javascript:alert(1)",
  ]) {
    const html = renderToStaticMarkup(
      createElement(ProductImage, {
        src,
        alt: "Garment",
        width: 80,
        height: 100,
      }),
    );
    expect(html).toContain("Product image unavailable");
    expect(html).not.toContain("<img");
  }
});

it("normalizes legacy Supabase product URLs to the configured public path", () => {
  const html = renderToStaticMarkup(
    createElement(ProductImage, {
      src: "https://store.supabase.co/storage/v1/object/product-images/photo.jpg",
      alt: "Dress",
      width: 80,
      height: 100,
    }),
  );
  expect(html).toContain(
    "%2Fstorage%2Fv1%2Fobject%2Fpublic%2Fproduct-images%2Fphoto.jpg",
  );
});
