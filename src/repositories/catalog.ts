import "server-only";
import { db, configured } from "@/lib/supabase/server";
import type { Product, Category, Settings } from "@/types";
import type { Feedback } from "@/types";
import { brandName } from "@/lib/branding";
export async function productFeedback(id: string): Promise<Feedback[]> {
  if (!configured()) return [];
  const { data, error } = await (
    await db()
  )
    .from("reviews")
    .select("id,product_id,rating,content,approved,admin_reply,created_at")
    .eq("product_id", id)
    .eq("approved", true)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error("Customer feedback could not be loaded.");
  return data ?? [];
}
export const productSelect =
  "*,product_images(*),product_variants(*,inventory(*)),categories(name,slug)";
export const defaultSettings: Settings = {
  id: "store",
  name: brandName,
  currency: "PKR",
  logo_url: null,
  footer_links: [],
  contact_email: "",
  contact_phone: "",
  announcement: "Pure Nature. Trusted Quality.",
  shipping_fee: 25000,
  free_shipping_threshold: 800000,
  cod_enabled: true,
  max_cod_total: 5000000,
  shipping_zones: [],
  homepage_sections: ["featured", "categories", "story"],
  navigation: [],
};
export async function settings(): Promise<Settings> {
  if (!configured()) return defaultSettings;
  const { data, error } = await (
    await db()
  )
    .from("store_settings")
    .select("*")
    .single();
  if (error) throw new Error("Store settings could not be loaded.");
  return data;
}
export async function categories(): Promise<Category[]> {
  if (!configured()) return [];
  const { data, error } = await (
    await db()
  )
    .from("categories")
    .select("*")
    .eq("visible", true)
    .order("position");
  if (error) throw new Error("Collections could not be loaded.");
  return data ?? [];
}
export async function catalog({
  q = "",
  category = "",
  sort = "newest",
  page = 1,
  min = 0,
  max = 100000000,
  featured = false,
}: {
  q?: string;
  category?: string;
  sort?: string;
  page?: number;
  min?: number;
  max?: number;
  featured?: boolean;
} = {}) {
  if (!configured()) return { products: [] as Product[], count: 0 };
  let query = (await db())
    .from("products")
    .select(productSelect, { count: "exact" })
    .eq("status", "published")
    .gte("effective_price", min)
    .lte("effective_price", max);
  if (q)
    query = query.ilike("name", `%${q.replace(/[%_\\]/g, "").slice(0, 100)}%`);
  if (category) {
    const { data, error } = await (
      await db()
    )
      .from("categories")
      .select("id")
      .eq("slug", category)
      .eq("visible", true)
      .maybeSingle();
    if (error) throw new Error("Collection could not be loaded.");
    if (!data) return { products: [] as Product[], count: 0 };
    query = query.eq("category_id", data.id);
  }
  if (featured) query = query.eq("featured", true);
  query = query
    .order(
      sort === "price-asc" || sort === "price-desc"
        ? "effective_price"
        : sort === "name"
          ? "name"
          : "created_at",
      { ascending: sort === "price-asc" || sort === "name" },
    )
    .order("id")
    .range((page - 1) * 12, page * 12 - 1);
  const { data, error, count } = await query;
  if (error) throw new Error("Products could not be loaded.");
  return { products: (data ?? []) as Product[], count: count ?? 0 };
}
export async function product(slug: string) {
  if (!configured()) return null;
  const { data, error } = await (
    await db()
  )
    .from("products")
    .select(productSelect)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error("Product could not be loaded.");
  return data as Product | null;
}
export async function banners() {
  if (!configured()) return [];
  const { data, error } = await (
    await db()
  )
    .from("banners")
    .select("*")
    .eq("active", true)
    .lte("starts_at", new Date().toISOString())
    .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`)
    .order("position");
  if (error) throw new Error("Banners could not be loaded.");
  return data ?? [];
}
export async function content(slug: string) {
  if (!configured()) return null;
  const { data, error } = await (
    await db()
  )
    .from("pages")
    .select("*")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (error) throw new Error("Page could not be loaded.");
  return data;
}
