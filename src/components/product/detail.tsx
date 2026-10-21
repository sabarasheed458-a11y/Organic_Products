"use client";
import { useEffect, useState, useRef } from "react";
import { ProductImage } from "./product-image";
import { hasSizes, productGallery, productSizes } from "@/lib/product-options";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Heart,
  Minus,
  Plus,
  Truck,
  ShieldCheck,
  RotateCcw,
  X,
} from "lucide-react";
import { useShopping } from "@/components/storefront/shopping-provider";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/utils";
import type { Product } from "@/types";
export function ProductDetail({
  product,
  codEnabled = true,
}: {
  product: Product;
  codEnabled?: boolean;
}) {
  const { add, toggle, wishlist, ready } = useShopping();
  const [added, setAdded] = useState(false);
  const variants = product.product_variants.filter((v) => v.active);
  const sizing = hasSizes(product);
  const colors = [...new Set(variants.map((v) => v.color))];
  const sizes = productSizes(product);
  const [color, setColor] = useState(
      variants.find(
        (v) => (v.inventory?.on_hand ?? 0) - (v.inventory?.reserved ?? 0) > 0,
      )?.color ??
        colors[0] ??
        "",
    ),
    [size, setSize] = useState(""),
    [qty, setQty] = useState(1),
    [index, setIndex] = useState(0),
    [zoom, setZoom] = useState(false);
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (zoom) dialog.current?.showModal();
  }, [zoom]);
  const images = productGallery(product, color);
  const variant = variants.find(
      (v) => v.color === color && (!sizing || v.size === size),
    ),
    stock =
      (variant?.inventory?.on_hand ?? 0) - (variant?.inventory?.reserved ?? 0);
  const canBuy = codEnabled && ready && !!variant && stock >= qty;
  const price = variant?.price ?? product.sale_price ?? product.price;
  useEffect(() => {
    try {
      const viewed: string[] = JSON.parse(
        localStorage.getItem("mira-viewed") ?? "[]",
      );
      localStorage.setItem(
        "mira-viewed",
        JSON.stringify(
          [product.id, ...viewed.filter((id) => id !== product.id)].slice(0, 8),
        ),
      );
    } catch {}
  }, [product.id]);
  return (
    <div className="product-detail">
      <div>
        <button
          className="detail-image"
          disabled={!images.length}
          onClick={() => images.length && setZoom(true)}
          aria-label="Enlarge product image"
        >
          {images[index] ? (
            <ProductImage
              src={images[index].url}
              alt={images[index].alt}
              fill
              sizes="(max-width: 760px) calc(100vw - 44px), (max-width:1100px) 50vw, 600px"
              priority
              style={{ objectFit: "contain" }}
            />
          ) : (
            <span role="img" aria-label="No product image">
              <svg
                width="120"
                height="140"
                viewBox="0 0 120 140"
                aria-hidden="true"
              >
                <path
                  d="M35 20 15 40 30 60 35 50V120H85V50L90 60 105 40 85 20 70 25H50Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
              <br />
              No image uploaded
            </span>
          )}
        </button>
        <div className="thumbnails">
          {images.map((im, i) => (
            <button
              key={im.id}
              aria-label={im.view ? `View ${im.view}` : `View image ${i + 1}`}
              aria-pressed={index === i}
              onClick={() => setIndex(i)}
            >
              <ProductImage src={im.url} alt={im.alt} width={80} height={100} />
            </button>
          ))}
        </div>
      </div>
      <section>
        <p className="eyebrow">
          {product.categories?.name ?? "Organic Products collection"}
        </p>
        <h1>{product.name}</h1>
        <p className="detail-price">
          {money(price)}{" "}
          {product.sale_price !== null && variant?.price == null && (
            <del>{money(product.price)}</del>
          )}
        </p>
        <p className="prose">{product.description}</p>
        {colors.length > 1 && (
          <fieldset className="variant-options">
            <legend>Color</legend>
            <div className="button-row">
              {colors.map((value) => (
                <button
                  type="button"
                  key={value}
                  className={
                    color === value
                      ? "btn btn-primary btn-sm"
                      : "btn btn-outline btn-sm"
                  }
                  aria-pressed={color === value}
                  disabled={
                    !variants.some(
                      (v) =>
                        v.color === value &&
                        (v.inventory?.on_hand ?? 0) -
                          (v.inventory?.reserved ?? 0) >
                          0,
                    )
                  }
                  onClick={() => {
                    setColor(value);
                    setQty(1);
                    setIndex(0);
                    setAdded(false);
                  }}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {sizing && (
          <fieldset className="variant-options">
            <legend>Size</legend>
            <div className="button-row">
              {sizes.map((value) => (
                <button
                  type="button"
                  key={value}
                  className={
                    size === value
                      ? "btn btn-primary btn-sm"
                      : "btn btn-outline btn-sm"
                  }
                  aria-pressed={size === value}
                  disabled={
                    !variants.some(
                      (v) =>
                        v.color === color &&
                        v.size === value &&
                        (v.inventory?.on_hand ?? 0) -
                          (v.inventory?.reserved ?? 0) >
                          0,
                    )
                  }
                  onClick={() => {
                    setSize(value);
                    setQty(1);
                    setAdded(false);
                  }}
                >
                  {value}
                </button>
              ))}
            </div>
            {!size && <p className="muted">Choose a size to continue.</p>}
          </fieldset>
        )}
        <p className="muted">
          {sizing && !size
            ? "Select your size to check availability"
            : stock > 0
              ? `${stock} available · SKU ${variant?.sku}`
              : "Currently out of stock"}
        </p>
        <div className="buy-row">
          <div className="quantity">
            <button
              onClick={() => setQty(Math.max(1, qty - 1))}
              aria-label="Decrease quantity"
            >
              <Minus size={14} />
            </button>
            <span>{qty}</span>
            <button
              disabled={stock <= qty}
              onClick={() => setQty(Math.max(1, Math.min(99, stock, qty + 1)))}
              aria-label="Increase quantity"
            >
              <Plus size={14} />
            </button>
          </div>
          <Button
            disabled={!canBuy}
            onClick={() => {
              if (variant) {
                add(variant.id, qty);
                setAdded(true);
              }
            }}
          >
            {!codEnabled
              ? "Checkout paused"
              : sizing && !size
                ? "Choose a size"
                : stock < 1
                  ? "Sold out"
                  : added
                    ? "Add another"
                    : "Add to bag"}
          </Button>
          <Button
            variant="outline"
            disabled={!canBuy}
            onClick={() => {
              if (variant) {
                add(variant.id, qty);
                router.push("/checkout");
              }
            }}
          >
            Buy now
          </Button>
          <Button
            variant="outline"
            disabled={!ready}
            onClick={() => toggle(product.id)}
            aria-label="Toggle wishlist"
            aria-pressed={wishlist.includes(product.id)}
          >
            <Heart
              fill={wishlist.includes(product.id) ? "currentColor" : "none"}
              size={20}
            />
          </Button>
        </div>
        {added && (
          <div className="added-confirmation" role="status">
            <span>Added to your bag.</span>
            <Link href="/cart" className="btn btn-outline">
              View bag & checkout →
            </Link>
          </div>
        )}
        <div className="detail-trust">
          <p>
            <Truck size={18} />
            Delivery charges calculated at checkout
          </p>
          <p>
            <ShieldCheck size={18} />
            {codEnabled
              ? "Pay with cash on delivery"
              : "Checkout is temporarily paused"}
          </p>
          <p>
            <RotateCcw size={18} />
            <Link href="/policies/returns">
              Read the exchange & return policy
            </Link>
          </p>
        </div>
      </section>
      {zoom && (
        <dialog
          ref={dialog}
          className="image-dialog"
          aria-label="Product image"
          onClose={() => setZoom(false)}
          onClick={(e) => {
            if (e.target === e.currentTarget) dialog.current?.close();
          }}
        >
          <button
            className="modal-close"
            aria-label="Close image"
            autoFocus
            onClick={() => dialog.current?.close()}
          >
            <X />
          </button>
          <ProductImage
            src={images[index].url}
            alt={images[index].alt}
            width={1000}
            height={1200}
            className="zoom-image"
          />
        </dialog>
      )}
    </div>
  );
}
