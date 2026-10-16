"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteProduct,
  inspectProductRemoval,
  removeProductAsset,
  inspectProductAsset,
} from "@/actions/commerce";
import { actionRequest } from "@/lib/action-request";
import type { ActionResult } from "@/types";

export function ProductLifecycle({ id, name }: { id: string; name: string }) {
  const router = useRouter(),
    dialog = useRef<HTMLDialogElement>(null),
    pending = useRef(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [plan, setPlan] = useState<Record<string, unknown> | null>(null),
    [archive, setArchive] = useState(false);
  useEffect(() => {
    if (plan) dialog.current?.showModal();
  }, [plan]);
  async function inspect(forceArchive: boolean) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const r = await actionRequest(() => inspectProductRemoval(id));
      if (r.ok && r.data) {
        setArchive(forceArchive);
        setPlan(r.data);
        setMessage("");
      } else setMessage(r.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function apply() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const r = await actionRequest(() => deleteProduct(id, archive));
      if (!r.ok) {
        setMessage(r.message);
        return;
      }
      setMessage(
        r.data?.outcome === "deleted"
          ? "Product permanently deleted. Image files were retained."
          : "Product archived. Existing orders and records were retained.",
      );
      dialog.current?.close();
      setPlan(null);
      if (r.data?.outcome === "deleted") router.push("/admin/products");
      router.refresh();
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const willArchive = archive || plan?.outcome === "archived";
  return (
    <section className="panel">
      <h2>Product lifecycle</h2>
      <div className="button-row">
        <button
          type="button"
          className="btn btn-outline"
          disabled={busy}
          onClick={() => inspect(true)}
        >
          Archive product
        </button>
        <button
          type="button"
          className="btn btn-outline"
          disabled={busy}
          onClick={() => inspect(false)}
        >
          Delete product
        </button>
      </div>
      <p role="status">{message}</p>
      {plan && (
        <dialog
          ref={dialog}
          className="panel lifecycle-dialog"
          aria-labelledby="product-removal-title"
          onCancel={(e) => {
            if (pending.current) e.preventDefault();
          }}
          onClose={() => setPlan(null)}
        >
          <h2 id="product-removal-title">
            {willArchive ? "Archive" : "Permanently delete"}{" "}
            {String(plan.name ?? name)}?
          </h2>
          <p>
            {willArchive
              ? "This product will be removed from the public catalog and new purchases. Its variants, photos and historical records will be retained."
              : "This permanently removes the eligible product, its variants, zero-stock inventory rows and image references. Uploaded image files are retained."}
          </p>
          <p>Dependencies checked again when you confirm:</p>
          <dl>
            {Object.entries(
              (plan.dependencies ?? {}) as Record<string, unknown>,
            ).map(([label, count]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{String(count)}</dd>
              </div>
            ))}
          </dl>
          <p>
            If dependencies change, deletion becomes archival. Orders, payments,
            customers and audit logs are never removed.
          </p>
          <div className="button-row">
            <button
              type="button"
              className="btn btn-outline"
              disabled={busy}
              autoFocus
              onClick={() => dialog.current?.close()}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={apply}
            >
              {willArchive ? "Confirm archive" : "Confirm deletion"}
            </button>
          </div>
          <p role="alert">{message}</p>
        </dialog>
      )}
    </section>
  );
}

export function ProductAssetCleanup() {
  const pending = useRef(false),
    [busy, setBusy] = useState(false),
    [path, setPath] = useState(""),
    [message, setMessage] = useState(""),
    [inspection, setInspection] = useState<ActionResult["data"]>(undefined);
  async function run(remove = false) {
    if (pending.current) return;
    if (
      remove &&
      !confirm(
        `Permanently delete image file ${path}? This only removes an unreferenced file. This cannot be undone.`,
      )
    )
      return;
    pending.current = true;
    setBusy(true);
    try {
      const r = await actionRequest(() =>
        remove ? removeProductAsset(path) : inspectProductAsset(path),
      );
      if (!r.ok) {
        setMessage(r.message);
        setInspection(undefined);
        return;
      }
      if (remove) {
        setMessage("Image file removal confirmed.");
        setInspection(undefined);
      } else {
        setInspection(r.data);
        setMessage(
          r.data?.exists !== true
            ? "File does not exist."
            : r.data.referenced
              ? "File is referenced and cannot be removed."
              : "No references found. You may explicitly delete this file.",
        );
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <details className="panel">
      <summary>Clean up orphaned product image files</summary>
      <p>
        Removing an image reference does not delete its file. Copy the product
        file path from Supabase Storage and inspect it first. Shared photos and
        photos used in content remain protected.
      </p>
      <label>
        Product file path
        <input
          value={path}
          disabled={busy}
          placeholder="product-id/file-id.webp"
          onChange={(e) => {
            setPath(e.target.value);
            setInspection(undefined);
            setMessage("");
          }}
        />
      </label>
      <div className="button-row">
        <button
          type="button"
          className="btn btn-outline"
          disabled={busy || !path}
          onClick={() => run()}
        >
          Inspect file
        </button>
        <button
          type="button"
          className="btn btn-outline"
          disabled={
            busy ||
            inspection?.exists !== true ||
            inspection?.referenced !== false
          }
          onClick={() => run(true)}
        >
          Delete unreferenced file
        </button>
      </div>
      <p role="status">{message}</p>
    </details>
  );
}
