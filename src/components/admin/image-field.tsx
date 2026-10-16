"use client";
import { useState } from "react";
import Image from "next/image";
import { uploadContentImage } from "@/actions/commerce";
import { actionRequest } from "@/lib/action-request";

export function ImageField({
  name,
  label,
  initialValue,
  target,
  onBusy,
}: {
  name: string;
  label: string;
  initialValue: string;
  target: "categories" | "banners" | "branding";
  onBusy: (busy: boolean) => void;
}) {
  const [url, setUrl] = useState(initialValue),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const preview = url.startsWith(
    process.env.NEXT_PUBLIC_SUPABASE_URL +
      "/storage/v1/object/public/product-images/",
  )
    ? url
    : null;
  return (
    <div className="span-2">
      <input type="hidden" name={name} value={url} />
      <label>
        {label}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            setBusy(true);
            onBusy(true);
            setMessage("");
            const form = new FormData();
            form.set("target", target);
            form.set("file", file);
            const result = await actionRequest(() => uploadContentImage(form));
            if (result.ok && typeof result.data?.url === "string") {
              setUrl(result.data.url);
              setMessage("Image uploaded. Save changes to apply it.");
            } else setMessage(result.message);
            setBusy(false);
            onBusy(false);
          }}
        />
      </label>
      <p className="muted">
        JPEG, PNG or WebP, up to 4 MB. Uploaded images are public.
      </p>
      {url && (
        <div>
          {preview && (
            <Image
              src={preview}
              alt={label}
              width={180}
              height={120}
              style={{ objectFit: "contain" }}
            />
          )}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={busy}
            onClick={() => setUrl("")}
          >
            Remove image from this section
          </button>
        </div>
      )}
      <details>
        <summary>Use an existing store image URL</summary>
        <label>
          Store image URL
          <input
            type="url"
            value={url}
            disabled={busy}
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
      </details>
      <p role="status">{busy ? "Uploading image…" : message}</p>
    </div>
  );
}
