/** Normalize legacy Supabase product image URLs to the public Storage endpoint. */
export function getImageUrl(url: string | null | undefined): string {
  if (!url || !url.trim()) return "/placeholder.svg";
  if (
    /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/product-images\//.test(
      url,
    )
  ) {
    return url.replace(
      "/storage/v1/object/product-images/",
      "/storage/v1/object/public/product-images/",
    );
  }
  return url;
}
