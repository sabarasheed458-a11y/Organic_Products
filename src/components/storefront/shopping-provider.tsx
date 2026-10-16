"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { loadShopping, saveShopping } from "@/actions/commerce";
import { z } from "zod";
import type { CartLine } from "@/types";
const savedSchema = z.object({
  cart: z
    .array(
      z.object({
        variant_id: z.guid(),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .max(50)
    .default([]),
  wishlist: z.array(z.guid()).max(100).default([]),
});
type Shopping = {
  cart: CartLine[];
  wishlist: string[];
  ready: boolean;
  notice: string;
  add: (id: string, qty: number) => void;
  quantity: (id: string, qty: number) => void;
  toggle: (id: string) => void;
  clear: () => void;
};
const Context = createContext<Shopping | null>(null);
function read(key: string) {
  try {
    return savedSchema.parse(JSON.parse(localStorage.getItem(key) ?? "{}"));
  } catch {
    return { cart: [], wishlist: [] };
  }
}
export function ShoppingProvider({
  children,
  userId,
}: {
  children: ReactNode;
  userId: string | null;
}) {
  const [cart, setCart] = useState<CartLine[]>([]),
    [wishlist, setWishlist] = useState<string[]>([]),
    [ready, setReady] = useState(false),
    [notice, setNotice] = useState("");
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    let alive = true;
    async function hydrate() {
      const saved = read("mira-shopping-" + (userId ?? "guest"));
      let data = saved;
      if (userId) {
        try {
          const remote = await loadShopping(),
            guest = read("mira-shopping-guest");
          const merged = new Map<string, CartLine>();
          [...remote.cart, ...guest.cart].forEach((l) =>
            merged.set(l.variant_id, l),
          );
          data = {
            cart: [...merged.values()].slice(0, 50),
            wishlist: [
              ...new Set([...remote.wishlist, ...guest.wishlist]),
            ].slice(0, 100),
          };
          if (alive && (guest.cart.length || guest.wishlist.length)) {
            const persisted = await saveShopping(data.cart, data.wishlist);
            if (alive && persisted.ok)
              localStorage.removeItem("mira-shopping-guest");
            else if (alive)
              setNotice(
                "Your guest bag is preserved. Account sync failed; refresh to retry.",
              );
          }
        } catch {
          if (alive)
            setNotice(
              "Account shopping data could not be loaded. Refresh to retry.",
            );
          return;
        }
      }
      if (alive) {
        setCart(data.cart);
        setWishlist(data.wishlist);
        setReady(true);
      }
    }
    void hydrate();
    return () => {
      alive = false;
    };
  }, [userId]);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(
        "mira-shopping-" + (userId ?? "guest"),
        JSON.stringify({ cart, wishlist }),
      );
    } catch {
      setTimeout(
        () => setNotice("Your browser could not save shopping data."),
        0,
      );
    }
    if (!userId) return;
    const timer = setTimeout(() => {
      queue.current = queue.current
        .then(async () => {
          const r = await saveShopping(cart, wishlist);
          if (!r.ok) setNotice(r.message);
        })
        .catch(() =>
          setNotice("Shopping data could not be synced. Please refresh."),
        );
    }, 500);
    return () => clearTimeout(timer);
  }, [cart, wishlist, ready, userId]);
  const add = useCallback((id: string, qty: number) => {
    setCart((items) => {
      const existing = items.find((l) => l.variant_id === id);
      return existing
        ? items.map((l) =>
            l.variant_id === id
              ? { ...l, quantity: Math.min(99, l.quantity + qty) }
              : l,
          )
        : [...items, { variant_id: id, quantity: qty }].slice(0, 50);
    });
    setNotice("Added to your bag.");
  }, []);
  return (
    <Context.Provider
      value={{
        cart,
        wishlist,
        ready,
        notice,
        add,
        quantity: (id, qty) =>
          setCart((items) =>
            qty <= 0
              ? items.filter((l) => l.variant_id !== id)
              : items.map((l) =>
                  l.variant_id === id
                    ? { ...l, quantity: Math.min(99, qty) }
                    : l,
                ),
          ),
        toggle: (id) =>
          setWishlist((items) =>
            items.includes(id)
              ? items.filter((i) => i !== id)
              : [...items, id].slice(0, 100),
          ),
        clear: () => setCart([]),
      }}
    >
      {children}
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
export function useShopping() {
  const context = useContext(Context);
  if (!context) throw new Error("Shopping context missing");
  return context;
}
