"use client";
import { useEffect, useState } from "react";
import { useShopping } from "./shopping-provider";
import { ProductCard } from "./product-card";
import type { Product } from "@/types";
export function SavedProducts({ recent = false }: { recent?: boolean }) {
  const { wishlist, ready } = useShopping();
  const [products, setProducts] = useState<Product[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let ids = wishlist;
    if (recent) {
      try {
        ids = JSON.parse(localStorage.getItem("mira-viewed") ?? "[]");
      } catch {
        ids = [];
      }
    }
    let active = true;
    if (!ready) return;
    fetch("/api/catalog?ids=" + ids.join(","))
      .then((r) => {
        if (!r.ok) throw new Error("Could not load saved products.");
        return r.json();
      })
      .then((data) => {
        if (active) setProducts(data.products);
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [wishlist, ready, recent]);
  if (error) return <p role="alert">{error}</p>;
  if (!ready) return <div className="skeleton" />;
  return products.length ? (
    <div className="product-grid">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  ) : (
    <div className="empty">
      {recent
        ? "Your recently viewed products will appear here."
        : "Save products you like with the heart on each card."}
    </div>
  );
}
