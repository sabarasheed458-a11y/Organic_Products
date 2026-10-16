"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { getImageUrl } from "@/lib/images";
import { Heart, ArrowUpRight } from "lucide-react";
import type { Product } from "@/types";
import { money } from "@/lib/utils";
import { productPresentation } from "@/lib/storefront";
import { useShopping } from "./shopping-provider";
export function ProductCard({ product }: { product: Product }) {
  const { wishlist, toggle, ready } = useShopping();
  const [primaryImageFailed, setPrimaryImageFailed] = useState(false);
  const [alternateImageFailed, setAlternateImageFailed] = useState(false);
  const images = [...product.product_images].sort(
    (a, b) => a.position - b.position,
  );
  const image = images[0],
    alternate = images[1];
  const display = productPresentation(product);
  const sale = display.discounted;
  return (
    <article className="product-card">
      <div className="product-image">
        <Link
          href={"/products/" + product.slug}
          aria-label={`View ${product.name}`}
        >
          {image && !primaryImageFailed ? (
            <Image
              src={getImageUrl(image.url)}
              alt={image.alt}
              fill
              className="card-primary-image"
              sizes="(max-width: 760px) calc(50vw - 29px), (max-width: 1100px) calc(33vw - 35px), 300px"
              onError={() => setPrimaryImageFailed(true)}
            />
          ) : (
            <div className="no-image">
              <ProductImagePlaceholder />
              <span>
                {image
                  ? "Product image unavailable"
                  : "Product image coming soon"}
              </span>
            </div>
          )}
          {alternate && !alternateImageFailed && (
            <Image
              src={getImageUrl(alternate.url)}
              alt={alternate.alt}
              fill
              className="card-alternate-image"
              sizes="(max-width: 760px) calc(50vw - 29px), (max-width: 1100px) calc(33vw - 35px), 300px"
              onError={() => setAlternateImageFailed(true)}
            />
          )}
        </Link>
        {(!display.available || sale || product.featured) && (
          <span className="product-badge">
            {!display.available
              ? "SOLD OUT"
              : sale
                ? `${Math.round((1 - product.sale_price! / Math.max(product.price, 1)) * 100)}% OFF`
                : product.featured
                  ? "CURATED PICK"
                  : ""}
          </span>
        )}
        <button
          className={
            "wish-button " + (wishlist.includes(product.id) ? "selected" : "")
          }
          onClick={() => toggle(product.id)}
          disabled={!ready}
          aria-label={
            wishlist.includes(product.id)
              ? "Remove from wishlist"
              : "Save to wishlist"
          }
          aria-pressed={wishlist.includes(product.id)}
        >
          <Heart size={19} />
        </button>
        <Link className="card-shop" href={"/products/" + product.slug}>
          {display.available ? "Choose options" : "View product"}{" "}
          <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="product-meta">
        <small>{product.categories?.name ?? "The collection"}</small>
        <h3>
          <Link href={"/products/" + product.slug}>{product.name}</Link>
        </h3>
        <div className="card-price">
          {display.varies && <span>From </span>}
          {money(display.price)} {sale && <del>{money(product.price)}</del>}
        </div>
        <p className="muted">
          {display.colours.length > 0 &&
            `${display.colours.length} ${display.colours.length === 1 ? "colour" : "colours"} · `}
          {display.available ? "Available" : "Out of stock"}
        </p>
      </div>
    </article>
  );
}
function ProductImagePlaceholder() {
  return (
    <svg
      width="110"
      height="130"
      viewBox="0 0 110 130"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M43 12h24v13l9 8v75H34V33l9-8V12Z"
        fill="var(--ivory)"
        stroke="var(--forest-green)"
        strokeWidth="2"
      />
      <path
        d="M43 12h24M45 48h20v31H45z"
        stroke="var(--natural-beige)"
        strokeWidth="2"
      />
      <path
        d="M55 70c-12-7-9-17 0-22 9 5 12 15 0 22Zm0 0V55m0 8c-4-5-7-6-10-6m10 1c3-4 6-5 9-5"
        stroke="var(--forest-green)"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
