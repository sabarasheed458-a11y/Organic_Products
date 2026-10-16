import type { MetadataRoute } from "next";
import { db, configured } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const routes = [
    "",
    "/collections/all",
    "/pages/about-us",
    "/pages/contact",
    "/pages/faq",
    "/policies/shipping",
    "/policies/returns",
    "/policies/privacy",
    "/policies/terms",
  ];
  if (configured()) {
    const client = await db();
    const [{ data: p }, { data: c }] = await Promise.all([
      client.from("products").select("slug").eq("status", "published"),
      client.from("categories").select("slug").eq("visible", true),
    ]);
    routes.push(
      ...(p ?? []).map((p) => "/products/" + p.slug),
      ...(c ?? []).map((c) => "/collections/" + c.slug),
    );
  }
  return routes.map((route) => ({
    url: base + route,
    changeFrequency: "weekly",
  }));
}
