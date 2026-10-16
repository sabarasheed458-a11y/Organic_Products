import { z } from "zod";
export const addressSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^[+\d ()-]{7,25}$/, "Enter a valid phone number"),
  line1: z.string().trim().min(5).max(300),
  city: z.string().trim().min(2).max(120),
  postal_code: z.string().trim().max(20).default(""),
});
export const cartSchema = z
  .array(
    z.object({
      variant_id: z.guid().transform((id) => id.toLowerCase()),
      quantity: z.number().int().min(1).max(99),
    }),
  )
  .min(1)
  .max(50)
  .refine(
    (items) => new Set(items.map((i) => i.variant_id)).size === items.length,
    "Duplicate variants",
  );
export const checkoutSchema = z.object({
  items: cartSchema,
  address: addressSchema.extend({
    email: z
      .union([z.string().trim().toLowerCase().pipe(z.email()), z.literal("")])
      .optional(),
  }),
  coupon: z.string().trim().max(40).default(""),
  notes: z.string().trim().max(1000).default(""),
  key: z.uuid(),
});
export const authSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(10).max(128),
  full_name: z.string().trim().max(120).optional(),
});
export const productSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(200),
    sku: z.string().trim().min(2).max(100),
    description: z.string().max(10000).default(""),
    price: z.number().int().nonnegative(),
    sale_price: z.number().int().nonnegative().nullable(),
    status: z.enum(["draft", "published", "archived"]),
    category_id: z.guid().nullable(),
    featured: z.boolean(),
    has_sizes: z.boolean().optional(),
    tags: z.array(z.string().max(40)).max(20),
    seo_title: z.string().max(200).nullable().optional(),
    seo_description: z.string().max(300).nullable().optional(),
  })
  .refine(
    (p) => p.sale_price === null || p.sale_price <= p.price,
    "Sale price cannot exceed regular price",
  );
export const variantSchema = z.object({
  product_id: z.guid(),
  sku: z.string().trim().min(2).max(100),
  size: z.string().trim().min(1).max(40),
  color: z.string().trim().min(1).max(40),
  price: z.number().int().nonnegative().nullable(),
  active: z.boolean(),
});
export const inquirySchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  message: z.string().trim().min(10).max(3000),
});
export const imageSchema = z.object({
  view: z.enum(["front", "back", "top", "bottom"]).nullable().optional(),
  color: z.string().trim().min(1).max(40).nullable().optional(),
  product_id: z.guid(),
  url: z.url(),
  alt: z.string().trim().min(1).max(200),
  position: z.number().int().nonnegative(),
});
export function validImageSignature(bytes: Uint8Array, mime: string) {
  return mime === "image/jpeg"
    ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : mime === "image/png"
      ? bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10"
      : mime === "image/webp"
        ? String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
          String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
        : false;
}
