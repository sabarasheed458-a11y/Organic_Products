"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { bulkStatus, editImage } from "@/actions/commerce";
import { actionRequest } from "@/lib/action-request";
export function BulkStatus({
  products,
}: {
  products: { id: string; name: string }[];
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <details className="record-editor">
      <summary>Bulk product status</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (!confirm("Apply this status to the selected products?")) return;
          setBusy(true);
          const r = await actionRequest(() =>
            bulkStatus({
              ids: f.getAll("ids"),
              status: f.get("status"),
            }),
          );
          setBusy(false);
          setMessage(r.ok ? `${r.data?.count} products updated.` : r.message);
          if (r.ok) router.refresh();
        }}
      >
        <div className="form-grid">
          {products.map((p) => (
            <label className="checkbox-row" key={p.id}>
              <input name="ids" type="checkbox" value={p.id} />
              {p.name}
            </label>
          ))}
        </div>
        <label>
          New status
          <select name="status">
            <option>draft</option>
            <option>published</option>
            <option>archived</option>
          </select>
        </label>
        <button className="btn btn-primary" disabled={busy}>
          Apply to selected
        </button>
        <p role="status">{message}</p>
      </form>
    </details>
  );
}
export function ImageFields({
  id,
  alt,
  position,
  view = null,
  color = null,
}: {
  id: string;
  alt: string;
  position: number;
  view?: string | null;
  color?: string | null;
}) {
  const pending = useRef(false);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (pending.current) return;
        pending.current = true;
        setBusy(true);
        const f = new FormData(e.currentTarget);
        const r = await actionRequest(() =>
          editImage({
            id,
            alt: f.get("alt"),
            position: Number(f.get("position")),
            view: f.get("view") || null,
            color: f.get("color") || null,
          }),
        );
        setBusy(false);
        pending.current = false;
        setMessage(r.message);
        if (r.ok) router.refresh();
      }}
    >
      <label>
        Alt text
        <input name="alt" defaultValue={alt} required maxLength={200} />
      </label>
      <label>
        View
        <select name="view" defaultValue={view ?? ""}>
          <option value="">Additional image</option>
          {["front", "back", "top", "bottom"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <label>
        Color (optional)
        <input name="color" defaultValue={color ?? ""} maxLength={40} />
      </label>
      <label>
        Display order
        <input name="position" type="number" min="0" defaultValue={position} />
      </label>
      <button className="btn btn-outline btn-sm" disabled={busy}>
        Save image details
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
