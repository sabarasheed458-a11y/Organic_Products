"use server";
import {
  PublicError,
  safeErrorMessage,
  rpcPayload,
} from "@/lib/security/errors";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/supabase/server";
import { staff, currentUser } from "@/lib/auth";
import {
  addressSchema,
  cartSchema,
  checkoutSchema,
  inquirySchema,
  productSchema,
  variantSchema,
  imageSchema,
  validImageSignature,
} from "@/lib/validation";
import type { ActionResult } from "@/types";
import { guestToken } from "@/lib/security/guest-checkout";
async function authenticatedUser() {
  const user = await currentUser();
  if (!user) throw new PublicError("Please sign in to continue.");
  return user;
}
async function result(
  fn: () => Promise<Record<string, unknown> | void>,
): Promise<ActionResult> {
  try {
    const data = await fn();
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: "Saved successfully.",
      ...(data ? { data } : {}),
    };
  } catch (e) {
    const msg =
      e instanceof z.ZodError
        ? e.issues.map((i) => i.message).join(". ")
        : safeErrorMessage(e, "Unable to save. Please try again.");
    return { ok: false, message: msg };
  }
}
function fail(error: { message: string; code?: string } | null) {
  if (error)
    throw new PublicError(
      error.code === "PGRST116"
        ? "Record not found or no longer available."
        : error.code === "23505"
          ? "This slug, SKU, or code is already in use."
          : error.code === "23503"
            ? "This record is referenced elsewhere. Archive it instead."
            : error.code === "42501"
              ? "You do not have permission."
              : error.code === "P0001"
                ? error.message
                : "The database rejected this change. Check the supplied values.",
    );
}
export async function saveProduct(id: string | null, input: unknown) {
  return result(async () => {
    await staff("catalog");
    const values = productSchema.parse(input);
    const client = await db();
    const q = id
      ? client.from("products").update(values).eq("id", z.guid().parse(id))
      : client.from("products").insert(values);
    const { data, error } = await q.select("id").single();
    fail(error);
    return { id: data!.id };
  });
}
export async function saveVariant(id: string | null, input: unknown) {
  return result(async () => {
    await staff("catalog");
    const values = variantSchema.parse(input);
    const client = await db();
    const { data, error } = await (
      id
        ? client
            .from("product_variants")
            .update(values)
            .eq("id", z.guid().parse(id))
        : client.from("product_variants").insert(values)
    )
      .select("id")
      .single();
    fail(error);
    return { id: data!.id };
  });
}
export async function duplicateProduct(id: string) {
  return result(async () => {
    await staff("catalog");
    const { data, error } = await (
      await db()
    ).rpc("duplicate_product", { p_product: z.guid().parse(id) });
    fail(error);
    return { id: data };
  });
}
export async function bulkStatus(input: unknown) {
  return result(async () => {
    await staff("catalog");
    const p = z
      .object({
        ids: z.array(z.guid()).min(1).max(100),
        status: z.enum(["draft", "published", "archived"]),
      })
      .parse(input);
    const { data, error } = await (
      await db()
    ).rpc("bulk_product_status", { p_ids: p.ids, p_status: p.status });
    fail(error);
    return { count: data };
  });
}
export async function editImage(input: unknown) {
  return result(async () => {
    await staff("catalog");
    const p = z
      .object({
        id: z.guid(),
        alt: z.string().trim().min(1).max(200),
        position: z.number().int().nonnegative(),
        view: z.enum(["front", "back", "top", "bottom"]).nullable().optional(),
        color: z.string().trim().min(1).max(40).nullable().optional(),
      })
      .parse(input);
    const { error } = await (
      await db()
    )
      .from("product_images")
      .update({
        alt: p.alt,
        position: p.position,
        ...(p.view !== undefined ? { view: p.view } : {}),
        ...(p.color !== undefined ? { color: p.color } : {}),
      })
      .eq("id", p.id)
      .select("id")
      .single();
    fail(error);
  });
}
export async function inspectProductRemoval(id: string) {
  return result(async () => {
    await staff("catalog");
    const { data, error } = await (
      await db()
    ).rpc("product_removal", {
      p_product: z.guid().parse(id),
      p_apply: false,
      p_archive: false,
    });
    fail(error);
    if (
      !data?.id ||
      !data?.name ||
      !["archived", "deleted"].includes(data.outcome)
    )
      throw new PublicError("Product inspection was not confirmed.");
    return data;
  });
}
export async function deleteProduct(id: string, archive = false) {
  return result(async () => {
    await staff("catalog");
    const productId = z.guid().parse(id);
    const { data, error } = await (
      await db()
    ).rpc("product_removal", {
      p_product: productId,
      p_apply: true,
      p_archive: z.boolean().parse(archive),
    });
    fail(error);
    if (
      data?.id !== productId ||
      data?.applied !== true ||
      !["archived", "deleted"].includes(data?.outcome)
    )
      throw new PublicError("Product operation was not confirmed.");
    return data;
  });
}
export async function removeVariant(id: string) {
  return result(async () => {
    await staff("catalog");
    const variantId = z.guid().parse(id);
    const { data, error } = await (
      await db()
    ).rpc("variant_removal", { p_variant: variantId });
    fail(error);
    if (
      data?.id !== variantId ||
      !["deleted", "deactivated"].includes(data?.outcome)
    )
      throw new PublicError("Variant operation was not confirmed.");
    return data;
  });
}
const productAssetPath = z
  .string()
  .regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/);
export async function inspectProductAsset(path: string) {
  return result(async () => {
    await staff("catalog");
    const name = productAssetPath.parse(path);
    const { data, error } = await (
      await db()
    ).rpc("inspect_product_asset", { p_name: name });
    fail(error);
    if (
      data?.path !== name ||
      typeof data.exists !== "boolean" ||
      typeof data.referenced !== "boolean"
    )
      throw new PublicError("Image inspection was not confirmed.");
    return data;
  });
}
export async function removeProductAsset(path: string) {
  return result(async () => {
    await staff("catalog");
    const name = productAssetPath.parse(path),
      client = await db();
    const { data, error } = await client.rpc("inspect_product_asset", {
      p_name: name,
    });
    fail(error);
    if (
      data?.path !== name ||
      data.exists !== true ||
      data.referenced !== false
    )
      throw new PublicError(
        "File is missing or still referenced. No file was removed.",
      );
    const bucket = client.storage.from("product-images");
    const removal = await bucket.remove([name]);
    fail(removal.error);
    if (!removal.data?.some((file) => file.name === name))
      throw new PublicError(
        "Storage did not confirm removal. Refresh and inspect the file again.",
      );
    const verify = await client.rpc("inspect_product_asset", { p_name: name });
    fail(verify.error);
    if (verify.data?.path !== name || verify.data.exists !== false)
      throw new PublicError(
        "File removal could not be verified. Refresh and inspect it again.",
      );
    return { path: name, outcome: "deleted" };
  });
}
export async function adjustStock(input: unknown) {
  return result(async () => {
    await staff("catalog");
    const p = z
      .object({
        variant: z.guid(),
        quantity: z.number().int().min(0).max(1000000),
        mode: z.enum(["set", "add", "subtract"]),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(input);
    const { data, error } = await (
      await db()
    ).rpc("adjust_inventory", {
      p_variant: p.variant,
      p_quantity: p.quantity,
      p_mode: p.mode,
      p_reason: p.reason,
    });
    fail(error);
    return { stock: data };
  });
}
export async function placeOrder(input: unknown, quote = false) {
  return result(async () => {
    const user = await currentUser();
    const p = checkoutSchema.parse(input);
    const quoteMode = z.boolean().parse(quote);
    const { data, error } = await (
      await db()
    ).rpc(user ? "checkout" : "guest_checkout", {
      p_items: p.items,
      p_address: p.address,
      p_coupon: p.coupon,
      p_notes: p.notes,
      p_key: p.key,
      p_quote: quoteMode,
      ...(!user ? { p_token: await guestToken(true) } : {}),
    });
    fail(error);
    rpcPayload(data);
    return data;
  });
}
export async function updateOrder(input: unknown) {
  return result(async () => {
    await staff("orders");
    const p = z
      .object({
        id: z.guid(),
        status: z.enum([
          "confirmed",
          "processing",
          "packed",
          "shipped",
          "out_for_delivery",
          "delivered",
          "cancelled",
          "returned",
        ]),
        tracking: z.string().max(120),
        courier: z.string().max(120),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(input);
    const { error } = await (
      await db()
    ).rpc("transition_order", {
      p_order: p.id,
      p_status: p.status,
      p_tracking: p.tracking,
      p_courier: p.courier,
      p_reason: p.reason,
    });
    fail(error);
  });
}
export async function recordPayment(input: unknown) {
  return result(async () => {
    await staff("orders");
    const p = z
      .object({
        id: z.guid(),
        status: z.enum(["paid", "refunded"]),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(input);
    const { error } = await (
      await db()
    ).rpc("record_cod_payment", {
      p_order: p.id,
      p_status: p.status,
      p_reason: p.reason,
    });
    fail(error);
  });
}
export async function submitFeedback(input: unknown) {
  return result(async () => {
    const p = z
      .object({
        order_id: z.guid(),
        product_id: z.guid(),
        rating: z.number().int().min(1).max(5),
        content: z.string().trim().min(3).max(3000),
      })
      .parse(input);
    const { data, error } = await (
      await db()
    ).rpc("submit_feedback", {
      p_order: p.order_id,
      p_product: p.product_id,
      p_rating: p.rating,
      p_content: p.content,
      p_token: await guestToken(),
    });
    fail(error);
    return { id: z.guid().parse(data) };
  });
}
export async function moderateFeedback(input: unknown) {
  return result(async () => {
    await staff("catalog");
    const p = z
      .object({
        id: z.guid(),
        approved: z.boolean(),
        reply: z.string().trim().max(2000),
      })
      .parse(input);
    const { data, error } = await (
      await db()
    ).rpc("moderate_feedback", {
      p_review: p.id,
      p_approved: p.approved,
      p_reply: p.reply,
    });
    fail(error);
    if (data !== p.id)
      throw new PublicError("Feedback moderation was not confirmed.");
    return { id: data };
  });
}
export async function saveAddress(id: string | null, input: unknown) {
  return result(async () => {
    const user = await authenticatedUser();
    const values = addressSchema.parse(input);
    const client = await db();
    const { error } = await (
      id
        ? client
            .from("addresses")
            .update(values)
            .eq("id", z.guid().parse(id))
            .eq("user_id", user.id)
        : client.from("addresses").insert({ ...values, user_id: user.id })
    )
      .select("id")
      .single();
    fail(error);
  });
}
export async function deleteAddress(id: string) {
  return result(async () => {
    const user = await authenticatedUser();
    const { error } = await (
      await db()
    )
      .from("addresses")
      .delete()
      .eq("id", z.guid().parse(id))
      .eq("user_id", user.id)
      .select("id")
      .single();
    fail(error);
  });
}
export async function saveProfile(input: unknown) {
  return result(async () => {
    const user = await authenticatedUser();
    const p = z
      .object({
        full_name: z.string().trim().min(2).max(120),
        phone: z.string().trim().max(25),
      })
      .parse(input);
    const { error } = await (
      await db()
    )
      .from("profiles")
      .update(p)
      .eq("id", user.id)
      .select("id")
      .single();
    fail(error);
  });
}
export async function sendInquiry(input: unknown) {
  return result(async () => {
    const p = inquirySchema.parse(input);
    const { data, error } = await (
      await db()
    ).rpc("submit_inquiry", {
      p_name: p.name,
      p_email: p.email,
      p_message: p.message,
    });
    fail(error);
    rpcPayload(data);
  });
}
export async function loadShopping() {
  const user = await authenticatedUser();
  const client = await db();
  const read = () =>
    Promise.all([
      client
        .from("carts")
        .select("id,cart_items(variant_id,quantity)")
        .eq("user_id", user.id)
        .single(),
      client
        .from("wishlists")
        .select("id,wishlist_items(product_id)")
        .eq("user_id", user.id)
        .single(),
    ]);
  let responses = await read();
  const missing = responses.some(
    (r) => r.error?.code === "PGRST116" || (!r.error && !r.data),
  );
  const unexpected = responses.some(
    (r) => r.error && r.error.code !== "PGRST116",
  );
  if (missing && !unexpected) {
    const { error } = await client.rpc("ensure_shopping_containers");
    if (error)
      throw new PublicError(
        error.code === "PGRST202"
          ? "Shopping setup requires migration 010. Please contact the store."
          : "Shopping data could not be initialized. Please refresh.",
      );
    responses = await read();
  }
  const [
    { data: cart, error: cartError },
    { data: wishlist, error: wishlistError },
  ] = responses;
  if (cartError || wishlistError || !cart || !wishlist) {
    const safeCode = (error: { code?: string } | null) =>
      error?.code && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(error.code)
        ? error.code
        : error
          ? "database_error"
          : null;
    console.warn("Shopping read failed", {
      cartCode: safeCode(cartError),
      wishlistCode: safeCode(wishlistError),
      cartMissing: !cart,
      wishlistMissing: !wishlist,
    });
    throw new PublicError("Shopping data could not be loaded. Please refresh.");
  }
  return {
    cart: cart?.cart_items ?? [],
    wishlist: wishlist?.wishlist_items.map((i) => i.product_id) ?? [],
  };
}
export async function saveShopping(items: unknown, wishlist: unknown) {
  return result(async () => {
    await authenticatedUser();
    const lines = z
      .array(
        z.object({
          variant_id: z.guid(),
          quantity: z.number().int().min(1).max(99),
        }),
      )
      .max(50)
      .parse(items);
    if (lines.length) cartSchema.parse(lines);
    const ids = z.array(z.guid()).max(100).parse(wishlist);
    const { error } = await (
      await db()
    ).rpc("save_shopping", { p_items: lines, p_wishlist: [...new Set(ids)] });
    fail(error);
  });
}
async function imageUploadBytes(file: FormDataEntryValue | null) {
  if (
    !(file instanceof File) ||
    file.size === 0 ||
    file.size > 4194304 ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  )
    throw new PublicError("Use a JPEG, PNG or WebP image under 4 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!validImageSignature(bytes, file.type))
    throw new PublicError("The image contents do not match its format.");
  return {
    bytes,
    contentType: file.type,
    extension: {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    }[file.type],
  };
}
export async function uploadContentImage(form: FormData) {
  return result(async () => {
    const target = z
      .enum(["categories", "banners", "branding"])
      .parse(form.get("target"));
    await staff(target === "categories" ? "catalog" : "settings");
    const { bytes, contentType, extension } = await imageUploadBytes(
      form.get("file"),
    );
    const client = await db();
    const path = `${target}/${crypto.randomUUID()}.${extension}`;
    const bucket = client.storage.from("product-images");
    const { error } = await bucket.upload(path, bytes, {
      contentType,
      upsert: false,
    });
    fail(error);
    return { url: bucket.getPublicUrl(path).data.publicUrl };
  });
}
export async function uploadImage(form: FormData) {
  return result(async () => {
    await staff("catalog");
    const { bytes, contentType, extension } = await imageUploadBytes(
      form.get("file"),
    );
    const imageFields = imageSchema.omit({ url: true }).parse({
      product_id: form.get("product_id"),
      alt: form.get("alt"),
      position: Number(form.get("position") ?? 0),
      view: form.get("view") || null,
      color: form.get("color") || null,
    });
    const product_id = imageFields.product_id;
    const client = await db();
    const path = product_id + "/" + crypto.randomUUID() + "." + extension;
    const { error } = await client.storage
      .from("product-images")
      .upload(path, bytes, { contentType, upsert: false });
    fail(error);
    const { data } = client.storage.from("product-images").getPublicUrl(path);
    const p = imageSchema.parse({
      ...imageFields,
      url: data.publicUrl,
    });
    const { error: insertError } = p.view
      ? await client.rpc("save_product_image", {
          p_product: p.product_id,
          p_url: p.url,
          p_alt: p.alt,
          p_position: p.position,
          p_view: p.view,
          p_color: p.color ?? null,
        })
      : await client.from("product_images").insert(p);
    if (insertError) {
      await client.storage.from("product-images").remove([path]);
      fail(insertError);
    }
    return { url: data.publicUrl };
  });
}
export async function removeImage(id: string) {
  return result(async () => {
    await staff("catalog");
    const { error } = await (
      await db()
    )
      .from("product_images")
      .delete()
      .eq("id", z.guid().parse(id))
      .select("id")
      .single();
    fail(error);
  });
}

const nullableText = z.string().max(300).nullable().optional();
const genericSchemas = {
  categories: z.object({
    name: z.string().trim().min(2).max(120),
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(120),
    description: z.string().max(3000),
    position: z.number().int().min(0),
    visible: z.boolean(),
    image_url: z
      .url()
      .nullable()
      .refine(
        (u) =>
          !u ||
          u.startsWith(
            process.env.NEXT_PUBLIC_SUPABASE_URL +
              "/storage/v1/object/public/product-images/",
          ),
        "Use an uploaded store image",
      ),
    parent_id: z.guid().nullable(),
    seo_title: nullableText,
    seo_description: nullableText,
  }),
  coupons: z
    .object({
      code: z
        .string()
        .trim()
        .regex(/^[A-Z0-9_-]{3,40}$/),
      kind: z.enum(["percentage", "fixed", "quantity"]),
      value: z.number().int().positive(),
      minimum: z.number().int().nonnegative(),
      min_quantity: z.number().int().positive(),
      starts_at: z.iso.datetime({ offset: true }),
      ends_at: z.iso.datetime({ offset: true }).nullable(),
      usage_limit: z.number().int().positive().nullable(),
      per_customer_limit: z.number().int().positive(),
      active: z.boolean(),
      product_ids: z.array(z.guid()),
      category_ids: z.array(z.guid()),
      customer_ids: z.array(z.guid()),
    })
    .refine(
      (p) => p.kind === "fixed" || p.value <= 100,
      "Percentage must be at most 100",
    ),
  promotions: z.object({
    name: z.string().min(2).max(120),
    coupon_id: z.guid().nullable(),
    description: z.string().max(2000),
    active: z.boolean(),
  }),
  banners: z.object({
    title: z.string().min(2).max(200),
    subtitle: z.string().max(500),
    image_url: z
      .url()
      .nullable()
      .refine(
        (u) =>
          !u ||
          u.startsWith(
            process.env.NEXT_PUBLIC_SUPABASE_URL +
              "/storage/v1/object/public/product-images/",
          ),
        "Use an image uploaded to this store",
      ),
    link: z.string().regex(/^\/(?!\/)[a-zA-Z0-9/?=&_-]*$/),
    position: z.number().int().nonnegative(),
    active: z.boolean(),
    starts_at: z.iso.datetime({ offset: true }),
    ends_at: z.iso.datetime({ offset: true }).nullable(),
  }),
  pages: z.object({
    title: z.string().min(2).max(200),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    content: z.string().max(30000),
    published: z.boolean(),
  }),
  store_settings: z.object({
    logo_url: z
      .url()
      .nullable()
      .refine(
        (u) =>
          !u ||
          u.startsWith(
            process.env.NEXT_PUBLIC_SUPABASE_URL +
              "/storage/v1/object/public/product-images/",
          ),
        "Use an uploaded store logo",
      ),
    footer_links: z
      .array(
        z.object({
          label: z.string().min(1).max(40),
          href: z.string().regex(/^\/(?!\/)[a-zA-Z0-9/?=&_-]*$/),
        }),
      )
      .max(12),
    name: z.string().min(2).max(120),
    contact_email: z.union([z.email(), z.literal("")]),
    contact_phone: z.string().max(25),
    announcement: z.string().max(300),
    shipping_fee: z.number().int().nonnegative(),
    free_shipping_threshold: z.number().int().nonnegative(),
    cod_enabled: z.boolean(),
    max_cod_total: z.number().int().positive(),
    shipping_zones: z
      .array(
        z.object({
          city: z.string().min(2).max(120),
          fee: z.number().int().nonnegative(),
        }),
      )
      .max(100),
    homepage_sections: z
      .array(z.enum(["featured", "categories", "story"]))
      .max(3),
    navigation: z
      .array(
        z.object({
          label: z.string().min(1).max(40),
          href: z.string().regex(/^\/(?!\/)[a-zA-Z0-9/?=&_-]*$/),
        }),
      )
      .max(12),
  }),
  contact_inquiries: z.object({ status: z.enum(["open", "resolved"]) }),
};
export async function saveRecord(
  table: string,
  id: string | null,
  input: unknown,
) {
  return result(async () => {
    if (!Object.hasOwn(genericSchemas, table))
      throw new PublicError("Unsupported operation");
    await staff(
      table === "categories"
        ? "catalog"
        : table === "contact_inquiries"
          ? "orders"
          : "settings",
    );
    const values: Record<string, unknown> =
      genericSchemas[table as keyof typeof genericSchemas].parse(input);
    const client = await db();
    if (table === "store_settings" && id !== "store")
      throw new PublicError("Invalid store");
    const key = id
      ? table === "store_settings"
        ? id
        : z.guid().parse(id)
      : null;
    const { error } = await (
      key
        ? client.from(table).update(values).eq("id", key)
        : client.from(table).insert(values)
    )
      .select("id")
      .single();
    fail(error);
  });
}
export async function updateStaff(input: unknown) {
  return result(async () => {
    const user = await staff("settings");
    if (user.profile.role !== "owner")
      throw new PublicError("Only the owner can manage roles");
    const p = z
      .object({
        id: z.guid(),
        role: z.enum([
          "customer",
          "owner",
          "manager",
          "catalog_manager",
          "order_manager",
        ]),
        active: z.boolean(),
      })
      .parse(input);
    const { error } = await (
      await db()
    ).rpc("set_staff", { p_user: p.id, p_role: p.role, p_active: p.active });
    fail(error);
  });
}
