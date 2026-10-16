import { notFound } from "next/navigation";
import Link from "next/link";
import {
  product,
  catalog,
  settings,
  productFeedback,
} from "@/repositories/catalog";
import { ProductFeedback } from "@/components/product/feedback";
import { productPresentation } from "@/lib/storefront";
import { ProductDetail } from "@/components/product/detail";
import { ProductCard } from "@/components/storefront/product-card";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const p = await product((await params).slug);
  return {
    title: p?.seo_title ?? p?.name ?? "Product not found",
    description: p?.seo_description ?? p?.description.slice(0, 160),
    alternates: { canonical: "/products/" + (await params).slug },
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const p = await product((await params).slug);
  if (!p) notFound();
  const [related, store, feedback] = await Promise.all([
    catalog({ category: p.categories?.slug }),
    settings(),
    productFeedback(p.id),
  ]);
  const display = productPresentation(p);
  const json = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description,
    sku: p.sku,
    image: p.product_images.map((i) => i.url),
    offers: {
      "@type": "Offer",
      priceCurrency: "PKR",
      price: display.price / 100,
      availability: display.available
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url:
        (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000") +
        "/products/" +
        p.slug,
    },
  };
  return (
    <div className="section">
      <p className="breadcrumbs">
        <Link href="/">Home</Link> /{" "}
        <Link href="/collections/all">Collection</Link> / {p.name}
      </p>
      <ProductDetail product={p} codEnabled={store.cod_enabled} />
      <ProductFeedback feedback={feedback} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(json).replace(/</g, "\\u003c"),
        }}
      />
      <div className="section-heading related">
        <h2>You might also love</h2>
      </div>
      <div className="product-grid">
        {related.products
          .filter((r) => r.id !== p.id)
          .slice(0, 4)
          .map((r) => (
            <ProductCard key={r.id} product={r} />
          ))}
      </div>
    </div>
  );
}
