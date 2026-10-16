"use client";
import { useState } from "react";
import Image from "next/image";
import type { ComponentProps } from "react";
import { getImageUrl } from "@/lib/images";
export function ProductImage(props: ComponentProps<typeof Image>) {
  return <LoadedImage key={String(props.src)} {...props} />;
}
function LoadedImage(props: ComponentProps<typeof Image>) {
  const src =
    typeof props.src === "string" ? getImageUrl(props.src) : props.src;
  const [failed, setFailed] = useState(false);
  let allowed = typeof src !== "string";
  if (typeof src === "string") {
    allowed = src.startsWith("/") && !src.startsWith("//");
    try {
      const url = new URL(src);
      allowed =
        url.protocol === "https:" &&
        !url.port &&
        ((url.hostname === "images.unsplash.com" &&
          url.pathname.startsWith("/photo-")) ||
          (url.hostname.endsWith(".supabase.co") &&
            url.pathname.startsWith(
              "/storage/v1/object/public/product-images/",
            )));
    } catch {
      /* Local paths are already checked. */
    }
  }
  return failed || !allowed ? (
    <span role="img" aria-label="Product image unavailable">
      Image unavailable
    </span>
  ) : (
    <Image
      {...props}
      src={src}
      alt={props.alt}
      onError={() => setFailed(true)}
    />
  );
}
