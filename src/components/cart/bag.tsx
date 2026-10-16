"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useShopping } from "@/components/storefront/shopping-provider";
import { money } from "@/lib/utils";
import type { Product } from "@/types";
export function useBagProducts() {
  const { cart } = useShopping();
  const [snapshot, setSnapshot] = useState<{
      products: Product[];
      ids: string;
    } | null>(null),
    [error, setError] = useState("");
  const ids = cart.map((l) => l.variant_id).join(",");
  useEffect(() => {
    let alive = true;
    fetch("/api/variants?ids=" + ids)
      .then((r) => {
        if (!r.ok)
          throw new Error("Your bag could not be loaded. Please refresh.");
        return r.json();
      })
      .then((data) => {
        if (alive) {
          setSnapshot({ products: data.products, ids });
          setError("");
        }
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [ids]);
  return {
    products: snapshot?.products ?? [],
    error,
    loading: snapshot?.ids !== ids,
  };
}
export function Bag() {
  const { cart, quantity, ready } = useShopping();
  const { products, error, loading } = useBagProducts();
  if (!ready) return <div className="skeleton" />;
  if (error) return <p role="alert">{error}</p>;
  if (!cart.length)
    return (
      <div className="empty">
        <h2>A little room for something lovely.</h2>
        <p>Your shopping bag is empty.</p>
        <Link className="btn btn-primary" href="/collections/all">
          Discover the collection
        </Link>
      </div>
    );
  if (loading)
    return <div className="skeleton" aria-label="Loading your bag" />;
  const unavailable = cart.some((line) => {
    const v = products
      .flatMap((p) => p.product_variants)
      .find((v) => v.id === line.variant_id);
    return (
      !v ||
      v.active === false ||
      (v.inventory?.on_hand ?? 0) - (v.inventory?.reserved ?? 0) < line.quantity
    );
  });
  const subtotal = cart.reduce((sum, line) => {
    const product = products.find((p) =>
      p.product_variants.some((v) => v.id === line.variant_id),
    );
    const variant = product?.product_variants.find(
      (v) => v.id === line.variant_id,
    );
    return (
      sum +
      (variant?.price ?? product?.sale_price ?? product?.price ?? 0) *
        line.quantity
    );
  }, 0);
  return (
    <div className="checkout-grid">
      <div>
        {cart.map((line) => {
          const p = products.find((p) =>
              p.product_variants.some((v) => v.id === line.variant_id),
            ),
            v = p?.product_variants.find((v) => v.id === line.variant_id);
          const price = v?.price ?? p?.sale_price ?? p?.price ?? 0;
          const image = p?.product_images
            .slice()
            .sort((a, b) => a.position - b.position)[0];
          const stock =
            (v?.inventory?.on_hand ?? 0) - (v?.inventory?.reserved ?? 0);
          return (
            <div className="bag-line" key={line.variant_id}>
              {image ? (
                <Image
                  src={image.url}
                  alt={image.alt}
                  width={90}
                  height={120}
                />
              ) : (
                <div className="bag-placeholder" />
              )}
              <div>
                <h3>
                  {p ? (
                    <Link href={"/products/" + p.slug}>{p.name}</Link>
                  ) : (
                    "Item unavailable"
                  )}
                </h3>
                <p className="muted">
                  {v?.size} / {v?.color}
                </p>
                <p>{money(price)}</p>
                {stock < line.quantity && (
                  <p className="error">
                    Only {stock} available. Update your quantity.
                  </p>
                )}
                <div className="quantity">
                  <button
                    aria-label="Decrease quantity"
                    onClick={() => quantity(line.variant_id, line.quantity - 1)}
                  >
                    <Minus size={13} />
                  </button>
                  <span>{line.quantity}</span>
                  <button
                    aria-label="Increase quantity"
                    disabled={line.quantity >= stock}
                    onClick={() => quantity(line.variant_id, line.quantity + 1)}
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>
              <div className="bag-right">
                <strong>{money(price * line.quantity)}</strong>
                <button
                  className="icon"
                  aria-label="Remove item"
                  onClick={() => quantity(line.variant_id, 0)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <aside className="summary">
        <h2>Your bag, at a glance</h2>
        <div className="summary-row">
          <span>Subtotal</span>
          <strong>{money(subtotal)}</strong>
        </div>
        <p className="muted">
          Shipping and discounts are calculated securely at checkout.
        </p>
        {unavailable ? (
          <>
            <p className="error" role="status">
              Update or remove unavailable items to continue.
            </p>
            <button className="btn btn-primary" disabled>
              Continue to checkout
            </button>
          </>
        ) : (
          <Link className="btn btn-primary" href="/checkout">
            Continue to checkout →
          </Link>
        )}
        <p className="checkout-assurance">
          Cash on delivery · Guest checkout available
        </p>
        <Link className="text-link" href="/collections/all">
          Keep exploring
        </Link>
      </aside>
    </div>
  );
}
