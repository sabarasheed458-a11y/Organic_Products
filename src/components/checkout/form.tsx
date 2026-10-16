"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useBagProducts } from "@/components/cart/bag";
import { checkoutSchema } from "@/lib/validation";
import { useShopping } from "@/components/storefront/shopping-provider";
import { placeOrder } from "@/actions/commerce";
import { money } from "@/lib/utils";
import { checkoutAttempt } from "@/lib/checkout-attempt";
import type { Address } from "@/types";
const checkoutAddress = checkoutSchema.shape.address;
type Values = z.input<typeof checkoutAddress>;
export function CheckoutForm({ addresses }: { addresses: Address[] }) {
  const { cart, ready, clear } = useShopping();
  const router = useRouter();
  const {
    products,
    loading: loadingItems,
    error: itemsError,
  } = useBagProducts();
  const [coupon, setCoupon] = useState(""),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [quote, setQuote] = useState<Record<string, unknown> | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(checkoutAddress),
    defaultValues: addresses[0] ?? {
      full_name: "",
      phone: "",
      line1: "",
      city: "",
      postal_code: "",
    },
  });
  async function submit(values: Values, preview = false) {
    setBusy(true);
    setMessage("");
    try {
      const fingerprint = JSON.stringify({ cart, values, coupon, notes });
      let checkoutKey: string;
      try {
        checkoutKey = checkoutAttempt(sessionStorage, fingerprint);
      } catch {
        setMessage(
          "Your browser could not save this checkout attempt. Enable site storage and try again.",
        );
        return;
      }
      const r = await placeOrder(
        { items: cart, address: values, coupon, notes, key: checkoutKey },
        preview,
      );
      if (!r.ok) {
        setMessage(r.message);
        return;
      }
      if (preview) {
        setQuote(r.data ?? null);
        setMessage("Totals confirmed. Place your order to reserve stock.");
      } else if (r.data?.id) {
        try {
          sessionStorage.removeItem("mira-checkout");
        } catch {}
        clear();
        router.push("/order-confirmation/" + r.data.id);
        router.refresh();
      }
    } catch {
      setMessage(
        "The connection was interrupted. Retry with the same details; your checkout reference has been saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!ready) return <div className="skeleton" />;
  if (!cart.length)
    return (
      <div className="empty">
        Your bag is empty.{" "}
        <Link href="/collections/all">Explore the collection →</Link>
      </div>
    );
  return (
    <form
      className="checkout-grid"
      onSubmit={handleSubmit((v) => submit(v))}
      onChange={() => {
        setQuote(null);
      }}
    >
      <fieldset className="panel checkout-fields" disabled={busy}>
        <h2>Where shall we send it?</h2>
        {addresses.length > 0 && (
          <label>
            Saved address
            <select
              defaultValue="0"
              onChange={(e) => reset(addresses[Number(e.target.value)])}
            >
              {addresses.map((a, i) => (
                <option key={a.id} value={i}>
                  {a.line1}, {a.city}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="form-grid">
          {(
            [
              "full_name",
              "phone",
              "line1",
              "city",
              "postal_code",
              "email",
            ] as const
          ).map((name) => (
            <label className={name === "line1" ? "span-2" : ""} key={name}>
              {
                {
                  full_name: "Full name",
                  phone: "Phone number",
                  line1: "Street address",
                  city: "City",
                  postal_code: "Postal code (optional)",
                  email: "Email (optional)",
                }[name]
              }
              <input
                {...register(name)}
                autoComplete={
                  {
                    full_name: "name",
                    phone: "tel",
                    line1: "street-address",
                    city: "address-level2",
                    postal_code: "postal-code",
                    email: "email",
                  }[name]
                }
              />
              {errors[name] && (
                <span className="error">{errors[name]?.message}</span>
              )}
            </label>
          ))}
        </div>
        <label>
          Order notes (optional)
          <textarea
            value={notes}
            maxLength={1000}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </label>
        <h3>Payment method</h3>
        <p className="payment-option">
          ◉ Cash on delivery <span>Pay when your parcel arrives</span>
        </p>
      </fieldset>
      <aside className="summary">
        <h2>Your order</h2>
        <Link href="/cart" className="text-link">
          Edit your bag
        </Link>
        <div className="checkout-items">
          {itemsError ? (
            <p role="alert" className="error">
              {itemsError}
            </p>
          ) : loadingItems ? (
            <p className="muted">Loading your products...</p>
          ) : (
            cart.map((line) => {
              const product = products.find((p) =>
                  p.product_variants.some((v) => v.id === line.variant_id),
                ),
                variant = product?.product_variants.find(
                  (v) => v.id === line.variant_id,
                );
              return (
                <div className="checkout-item" key={line.variant_id}>
                  <div>
                    <strong>{product?.name ?? "Unavailable item"}</strong>
                    <small>
                      {variant?.size} / {variant?.color} · Qty {line.quantity}
                    </small>
                  </div>
                  <span>
                    {money(
                      (variant?.price ??
                        product?.sale_price ??
                        product?.price ??
                        0) * line.quantity,
                    )}
                  </span>
                </div>
              );
            })
          )}
        </div>
        <p>{cart.reduce((s, l) => s + l.quantity, 0)} products in your bag</p>
        <label>
          Coupon code
          <input
            value={coupon}
            disabled={busy}
            maxLength={40}
            onChange={(e) => setCoupon(e.target.value.toUpperCase())}
          />
        </label>
        <button
          type="button"
          className="btn btn-outline"
          disabled={busy}
          onClick={handleSubmit((v) => submit(v, true))}
        >
          {busy ? "Checking…" : "Confirm totals / apply coupon"}
        </button>
        {quote && (
          <>
            {[
              ["Subtotal", "subtotal"],
              ["Discount", "discount"],
              ["Delivery", "shipping"],
              ["Total", "total"],
            ].map(([label, key]) => (
              <div className="summary-row" key={key}>
                <span>{label}</span>
                <strong>{money(Number(quote[key]))}</strong>
              </div>
            ))}
          </>
        )}
        <p className="muted">
          Prices, discounts, delivery charges, and available stock are checked
          again when you place your order.
        </p>
        <button className="btn btn-primary" disabled={busy}>
          {busy
            ? "Processing…"
            : quote
              ? `Place COD order · ${money(Number(quote.total))}`
              : "Place COD order"}
        </button>
        <p className="muted">
          By placing an order, you agree to our{" "}
          <Link href="/policies/terms">terms</Link> and{" "}
          <Link href="/policies/returns">returns policy</Link>.
        </p>
        {message && (
          <p role="status" className="form-message">
            {message}
          </p>
        )}
      </aside>
    </form>
  );
}
