"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { getImageUrl } from "@/lib/images";
import { ImageFields } from "./bulk-status";
import {
  saveProduct,
  saveVariant,
  adjustStock,
  uploadImage,
  removeImage,
  removeVariant,
  duplicateProduct,
} from "@/actions/commerce";
import type { Product, Category, Variant, ActionResult } from "@/types";
import { imageViews } from "@/lib/product-options";
import { actionRequest } from "@/lib/action-request";
import { ProductLifecycle, ProductAssetCleanup } from "./product-lifecycle";
export function ProductEditor({
  product,
  categories,
}: {
  product: Product | null;
  categories: Category[];
}) {
  const router = useRouter();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function run(fn: () => Promise<ActionResult>) {
    if (pending.current)
      return {
        ok: false,
        message: "An operation is already in progress.",
      } as ActionResult;
    pending.current = true;
    setBusy(true);
    const r = await actionRequest(fn);
    setBusy(false);
    pending.current = false;
    setMessage(r.message);
    if (r.ok) {
      if (r.data?.id && !product) router.push("/admin/products/" + r.data.id);
      router.refresh();
    }
    return r;
  }
  return (
    <div className="product-admin-editor">
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(() =>
            saveProduct(product?.id ?? null, {
              name: f.get("name"),
              slug: f.get("slug"),
              sku: f.get("sku"),
              description: f.get("description"),
              price: Math.round(Number(f.get("price")) * 100),
              sale_price: f.get("sale_price")
                ? Math.round(Number(f.get("sale_price")) * 100)
                : null,
              status: f.get("status"),
              category_id: f.get("category_id") || null,
              featured: f.get("featured") === "on",
              has_sizes: f.get("has_sizes") === "on",
              tags: String(f.get("tags"))
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
              seo_title: String(f.get("seo_title")) || null,
              seo_description: String(f.get("seo_description")) || null,
            }),
          );
        }}
      >
        <h2>{product ? "Edit product" : "Create a product"}</h2>
        <div className="form-grid">
          {[
            ["name", "Product name"],
            ["slug", "Slug"],
            ["sku", "SKU"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                name={key}
                required
                defaultValue={product?.[key as "name" | "slug" | "sku"]}
              />
            </label>
          ))}
          <label>
            Category
            <select
              name="category_id"
              defaultValue={product?.category_id ?? ""}
            >
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Regular price (PKR)
            <input
              name="price"
              type="number"
              min="0"
              step="0.01"
              required
              defaultValue={(product?.price ?? 0) / 100}
            />
          </label>
          <label>
            Sale price (PKR)
            <input
              name="sale_price"
              type="number"
              min="0"
              step="0.01"
              defaultValue={
                product?.sale_price != null ? product.sale_price / 100 : ""
              }
            />
          </label>
          <label>
            Status
            <select name="status" defaultValue={product?.status ?? "draft"}>
              <option>draft</option>
              <option>published</option>
              <option>archived</option>
            </select>
          </label>
          <label>
            Tags, separated by commas
            <input name="tags" defaultValue={product?.tags.join(", ")} />
          </label>
          <label className="span-2">
            Description
            <textarea
              name="description"
              rows={6}
              defaultValue={product?.description}
            />
          </label>
          <label>
            SEO title
            <input
              name="seo_title"
              maxLength={200}
              defaultValue={
                (product as unknown as Record<string, string>)?.seo_title ?? ""
              }
            />
          </label>
          <label>
            SEO description
            <input
              name="seo_description"
              maxLength={300}
              defaultValue={
                (product as unknown as Record<string, string>)
                  ?.seo_description ?? ""
              }
            />
          </label>
          <label className="checkbox-row">
            <input
              name="has_sizes"
              type="checkbox"
              defaultChecked={product?.has_sizes ?? false}
            />
            Enable size selection (S, M, L)
          </label>
          <label className="checkbox-row">
            <input
              name="featured"
              type="checkbox"
              defaultChecked={product?.featured}
            />
            Featured on homepage
          </label>
        </div>
        <button className="btn btn-primary" disabled={busy}>
          Save product
        </button>
        <p role="status">{message}</p>
      </form>
      {product && (
        <>
          <div className="button-row">
            <button
              className="btn btn-outline"
              disabled={busy}
              onClick={() =>
                run(() => duplicateProduct(product.id)).then((r) => {
                  if (r.ok && r.data?.id)
                    router.push("/admin/products/" + r.data.id);
                })
              }
            >
              Duplicate as draft
            </button>
          </div>
          <ProductLifecycle id={product.id} name={product.name} />
          <h2>Variants & inventory</h2>
          {product.product_variants.map((v) => (
            <VariantEditor
              key={v.id}
              variant={v}
              productId={product.id}
              hasSizes={product.has_sizes ?? false}
            />
          ))}
          <VariantEditor
            productId={product.id}
            hasSizes={product.has_sizes ?? false}
          />
          <p className="muted">
            Deactivate variants to remove sizes or colors from sale. Existing
            order records are retained.
          </p>
          <h2>Product images</h2>
          <div className="image-management">
            {[...product.product_images]
              .sort((a, b) => a.position - b.position)
              .map((im) => (
                <div key={im.id}>
                  <Image
                    src={getImageUrl(im.url)}
                    alt={im.alt}
                    width={100}
                    height={130}
                  />
                  <p>
                    {im.view ?? "Additional image"}
                    {im.color ? ` ? ${im.color}` : " ? All colors"}
                  </p>
                  <ImageFields
                    id={im.id}
                    alt={im.alt}
                    position={im.position}
                    view={im.view ?? null}
                    color={im.color ?? null}
                  />
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={busy}
                    onClick={() =>
                      confirm("Remove this image from the product?") &&
                      run(() => removeImage(im.id))
                    }
                  >
                    Remove image reference
                  </button>
                </div>
              ))}
          </div>
          <form
            className="panel"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => uploadImage(new FormData(e.currentTarget)));
            }}
          >
            <input type="hidden" name="product_id" value={product.id} />
            <p className="muted">
              Uploaded images are public, including images for draft products.
              Upload only photography you are ready to share.
            </p>
            <label>
              Product view
              <select name="view" defaultValue="front">
                {imageViews.map((view) => (
                  <option key={view} value={view}>
                    {view}
                  </option>
                ))}
                <option value="">Additional image</option>
              </select>
            </label>
            <label>
              Color (optional)
              <select name="color">
                <option value="">All colors</option>
                {[...new Set(product.product_variants.map((v) => v.color))].map(
                  (color) => (
                    <option key={color}>{color}</option>
                  ),
                )}
              </select>
            </label>
            <p className="muted">
              Uploading the same designated view and color replaces its photo.
              Other images remain unchanged.
            </p>
            <label>
              Image (JPEG, PNG, WebP; max 4 MB)
              <input
                name="file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
              />
            </label>
            <label>
              Alt text
              <input name="alt" required maxLength={200} />
            </label>
            <label>
              Display order
              <input
                name="position"
                type="number"
                min="0"
                defaultValue={product.product_images.length}
              />
            </label>
            <button disabled={busy} className="btn btn-primary">
              Upload image
            </button>
          </form>
        </>
      )}
      <ProductAssetCleanup />
    </div>
  );
}
export function VariantEditor({
  variant,
  productId,
  hasSizes = true,
}: {
  hasSizes?: boolean;
  variant?: Variant;
  productId: string;
}) {
  const router = useRouter();
  const pending = useRef(false);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <details className="record-editor" open={!variant}>
      <summary>
        {variant
          ? `${variant.size} / ${variant.color} · ${variant.sku} · Stock ${variant.inventory?.on_hand ?? 0}`
          : "Add variant"}
      </summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (pending.current) return;
          pending.current = true;
          setBusy(true);
          const f = new FormData(e.currentTarget);
          const r = await actionRequest(() =>
            saveVariant(variant?.id ?? null, {
              product_id: productId,
              sku: f.get("sku"),
              size: f.get("size"),
              color: f.get("color"),
              price: f.get("price")
                ? Math.round(Number(f.get("price")) * 100)
                : null,
              active: f.get("active") === "on",
            }),
          );
          setBusy(false);
          pending.current = false;
          setMessage(r.message);
          if (r.ok) router.refresh();
        }}
      >
        <div className="form-grid">
          <label>
            SKU
            <input name="sku" required defaultValue={variant?.sku} />
          </label>
          <label>
            Size
            <select
              name="size"
              defaultValue={variant?.size ?? (hasSizes ? "S" : "One size")}
            >
              {[
                ...new Set([
                  ...(hasSizes ? ["S", "M", "L"] : ["One size"]),
                  ...(variant ? [variant.size] : []),
                ]),
              ].map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </label>
          <label>
            Colour
            <input
              name="color"
              required
              defaultValue={variant?.color ?? "Natural"}
            />
          </label>
          <label>
            Override price (PKR, optional)
            <input
              name="price"
              type="number"
              min="0"
              step="0.01"
              defaultValue={variant?.price != null ? variant.price / 100 : ""}
            />
          </label>
          <label>
            <input
              name="active"
              type="checkbox"
              defaultChecked={variant?.active ?? true}
            />{" "}
            Active
          </label>
        </div>
        <button className="btn btn-primary" disabled={busy}>
          Save variant
        </button>
        <p role="status">{message}</p>
      </form>
      {variant && (
        <>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={busy}
            onClick={async () => {
              if (
                pending.current ||
                !confirm(
                  `Remove variant ${variant.sku}? Referenced variants will be deactivated. Only unused variants with no stock or history will be permanently deleted.`,
                )
              )
                return;
              pending.current = true;
              setBusy(true);
              const r = await actionRequest(() => removeVariant(variant.id));
              pending.current = false;
              setBusy(false);
              setMessage(
                r.ok
                  ? r.data?.outcome === "deleted"
                    ? "Unused variant deleted."
                    : "Variant deactivated; dependent records retained."
                  : r.message,
              );
              if (r.ok) router.refresh();
            }}
          >
            Remove variant
          </button>
          <StockForm
            variantId={variant.id}
            onHand={variant.inventory?.on_hand ?? 0}
            reserved={variant.inventory?.reserved ?? 0}
          />
        </>
      )}
    </details>
  );
}
export function StockForm({
  variantId,
  onHand,
  reserved,
}: {
  variantId: string;
  onHand: number;
  reserved: number;
}) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  return (
    <form
      className="stock-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (pending.current) return;
        pending.current = true;
        setBusy(true);
        const f = new FormData(e.currentTarget);
        const r = await actionRequest(() =>
          adjustStock({
            variant: variantId,
            quantity: Number(f.get("quantity")),
            mode: f.get("mode"),
            reason: f.get("reason"),
          }),
        );
        setBusy(false);
        pending.current = false;
        setMessage(
          r.ok ? `Confirmed on-hand stock: ${r.data?.stock}` : r.message,
        );
        if (r.ok) router.refresh();
      }}
    >
      <p>
        On hand: <strong>{onHand}</strong> · Reserved: {reserved} · Available:{" "}
        {onHand - reserved}
      </p>
      <div className="form-grid">
        <label>
          Operation
          <select name="mode">
            <option value="add">Increase</option>
            <option value="subtract">Decrease</option>
            <option value="set">Set stock</option>
          </select>
        </label>
        <label>
          Quantity
          <input name="quantity" type="number" min="0" max="1000000" required />
        </label>
        <label className="span-2">
          Reason
          <input
            name="reason"
            minLength={3}
            maxLength={500}
            required
            placeholder="e.g. Received shipment #104"
          />
        </label>
      </div>
      <button className="btn btn-outline" disabled={busy}>
        Adjust inventory
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
