import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  db: vi.fn(),
  currentUser: vi.fn(),
  staff: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/security/guest-checkout", () => ({
  guestToken: async () => "a".repeat(64),
}));
vi.mock("@/lib/supabase/server", () => ({ db: mocks.db }));
vi.mock("@/lib/auth", () => ({
  currentUser: mocks.currentUser,
  staff: mocks.staff,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
import {
  loadShopping,
  saveAddress,
  editImage,
  placeOrder,
  saveRecord,
  sendInquiry,
  uploadImage,
  uploadContentImage,
  saveProduct,
  saveVariant,
  removeImage,
  deleteProduct,
  inspectProductRemoval,
  removeVariant,
  inspectProductAsset,
  removeProductAsset,
  submitFeedback,
  moderateFeedback,
} from "@/actions/commerce";
import { authenticate } from "@/actions/auth";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthForm } from "@/components/account/auth-form";
const uid = "00000000-0000-4000-8000-000000000011",
  vid = "20000000-0000-4000-8000-000000000011";
const address = {
  full_name: "Audit Customer",
  phone: "03001234567",
  line1: "12 Audit Street",
  city: "Lahore",
  postal_code: "",
};
function client() {
  const chain = {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    neq: vi.fn(),
    single: vi
      .fn()
      .mockResolvedValue({ data: { id: uid, active: true }, error: null }),
  };
  for (const name of [
    "select",
    "update",
    "insert",
    "delete",
    "eq",
    "neq",
  ] as const)
    chain[name].mockReturnValue(chain);
  return {
    chain,
    from: vi.fn().mockReturnValue(chain),
    rpc: vi.fn().mockResolvedValue({ data: { id: uid }, error: null }),
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: uid } }, error: null }),
      signUp: vi.fn().mockResolvedValue({
        data: { user: { id: uid }, session: null },
        error: null,
      }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      signInWithPassword: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: uid } }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentUser.mockResolvedValue({
    id: uid,
    profile: { role: "customer", active: true },
  });
  mocks.staff.mockResolvedValue({
    id: uid,
    profile: { role: "owner", active: true },
  });
});
describe("Server Action security and failure handling (mocked transport)", () => {
  it("validates feedback and uses server-owned identity/capability, never browser approval fields", async () => {
    const c = client();
    mocks.db.mockResolvedValue(c);
    c.rpc.mockResolvedValue({ data: uid, error: null });
    expect(
      (
        await submitFeedback({
          order_id: uid,
          product_id: vid,
          rating: 4,
          content: "Verified feedback",
          approved: true,
          user_id: uid,
          p_token: "forged",
        })
      ).ok,
    ).toBe(true);
    expect(c.rpc).toHaveBeenLastCalledWith("submit_feedback", {
      p_order: uid,
      p_product: vid,
      p_rating: 4,
      p_content: "Verified feedback",
      p_token: "a".repeat(64),
    });
    expect(
      (
        await submitFeedback({
          order_id: uid,
          product_id: vid,
          rating: 6,
          content: "Bad rating",
        })
      ).ok,
    ).toBe(false);
    c.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "Order access required" },
    });
    expect(
      (
        await submitFeedback({
          order_id: uid,
          product_id: vid,
          rating: 5,
          content: "Denied review",
        })
      ).ok,
    ).toBe(false);
  });
  it("requires catalog authorization and confirmed database results for feedback moderation", async () => {
    const c = client();
    mocks.db.mockResolvedValue(c);
    c.rpc.mockResolvedValue({ data: uid, error: null });
    expect(
      (await moderateFeedback({ id: uid, approved: true, reply: "Thank you" }))
        .ok,
    ).toBe(true);
    expect(mocks.staff).toHaveBeenCalledWith("catalog");
    c.rpc.mockResolvedValue({ data: null, error: null });
    expect(
      (await moderateFeedback({ id: uid, approved: false, reply: "" })).ok,
    ).toBe(false);
    mocks.staff.mockRejectedValue(new Error("Denied"));
    expect(
      (await moderateFeedback({ id: uid, approved: true, reply: "" })).ok,
    ).toBe(false);
  });
  it("requires confirmed lifecycle results and never reports failed operations as success", async () => {
    const c = client();
    mocks.db.mockResolvedValue(c);
    expect((await deleteProduct(uid)).ok).toBe(false);
    c.rpc.mockResolvedValue({
      data: { id: uid, applied: true, outcome: "archived" },
      error: null,
    });
    const result = await deleteProduct(uid);
    expect(result.ok).toBe(true);
    expect(result.data?.outcome).toBe("archived");
    expect(c.rpc).toHaveBeenLastCalledWith("product_removal", {
      p_product: uid,
      p_apply: true,
      p_archive: false,
    });
    c.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "Product not found" },
    });
    expect((await deleteProduct(uid)).ok).toBe(false);
    expect((await removeVariant(vid)).ok).toBe(false);
    expect((await inspectProductRemoval(uid)).ok).toBe(false);
  });
  it("blocks unauthorized lifecycle and cleanup actions before database access", async () => {
    mocks.staff.mockRejectedValue(new Error("Forbidden"));
    const path = uid + "/" + vid + ".png";
    for (const operation of [
      () => deleteProduct(uid),
      () => removeVariant(vid),
      () => inspectProductRemoval(uid),
      () => inspectProductAsset(path),
      () => removeProductAsset(path),
    ]) {
      expect((await operation()).ok).toBe(false);
    }
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("removes only inspected product assets and verifies storage acknowledgement and database absence", async () => {
    const c = client(),
      path = uid + "/" + vid + ".png";
    const bucket = {
      remove: vi
        .fn()
        .mockResolvedValue({ data: [{ name: path }], error: null }),
    };
    mocks.db.mockResolvedValue({ ...c, storage: { from: () => bucket } });
    c.rpc.mockResolvedValue({
      data: { path, exists: true, referenced: true },
      error: null,
    });
    expect((await removeProductAsset(path)).ok).toBe(false);
    expect(bucket.remove).not.toHaveBeenCalled();
    c.rpc
      .mockResolvedValueOnce({
        data: { path, exists: true, referenced: false },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { path, exists: false, referenced: false },
        error: null,
      });
    expect((await removeProductAsset(path)).ok).toBe(true);
    expect(bucket.remove).toHaveBeenCalledWith([path]);
    c.rpc.mockResolvedValue({
      data: { path, exists: true, referenced: false },
      error: null,
    });
    bucket.remove.mockResolvedValue({ data: [], error: null });
    expect((await removeProductAsset(path)).ok).toBe(false);
    expect((await removeProductAsset("../branding/logo.png")).ok).toBe(false);
  });
  it("initializes missing shopping containers once and rereads existing items without saving an empty cart", async () => {
    const c = client();
    mocks.db.mockResolvedValue(c);
    c.chain.single
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST116" } })
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST116" } })
      .mockResolvedValueOnce({
        data: { id: uid, cart_items: [{ variant_id: vid, quantity: 2 }] },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: uid, wishlist_items: [] },
        error: null,
      });
    expect(await loadShopping()).toEqual({
      cart: [{ variant_id: vid, quantity: 2 }],
      wishlist: [],
    });
    expect(c.rpc).toHaveBeenCalledExactlyOnceWith("ensure_shopping_containers");
    expect(c.chain.eq).toHaveBeenCalledWith("user_id", uid);
  });
  it("does not retry shopping repair indefinitely when ownership reads stay unavailable", async () => {
    const c = client();
    mocks.db.mockResolvedValue(c);
    c.chain.single.mockResolvedValue({
      data: null,
      error: { code: "PGRST116" },
    });
    await expect(loadShopping()).rejects.toThrow(
      "Shopping data could not be loaded",
    );
    expect(c.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["invalid_credentials", 400, "Email or password is incorrect."],
    ["email_not_confirmed", 400, "Confirm your email"],
    ["email_provider_disabled", 422, "currently unavailable"],
    ["over_request_rate_limit", 429, "Too many attempts"],
    ["unexpected_failure", 503, "temporarily unavailable"],
  ])(
    "distinguishes safe login errors for %s",
    async (code, status, message) => {
      const c = client();
      c.auth.signInWithPassword.mockResolvedValue({
        data: { user: null },
        error: { code, status, message: "PRIVATE_INTERNAL" },
      });
      mocks.db.mockResolvedValue(c);
      const result = await authenticate("login", {
        email: "test@example.com",
        password: "wrong-test-password",
      });
      expect(result.ok).toBe(false);
      expect(result.message).toContain(message);
      expect(result.message).not.toContain("PRIVATE_INTERNAL");
      expect(c.auth.getUser).not.toHaveBeenCalled();
    },
  );
  it("normalizes email consistently without modifying password whitespace", async () => {
    const c = client();
    mocks.db.mockResolvedValue(c);
    const password = "  unchanged-password  ";
    expect(
      (await authenticate("login", { email: "  TEST@EXAMPLE.COM  ", password }))
        .ok,
    ).toBe(true);
    expect(c.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "test@example.com",
      password,
    });
  });
  it("preserves checkout in confirmation-required signup without claiming an authenticated session", async () => {
    const c = client();
    mocks.db.mockResolvedValue(c);
    const result = await authenticate(
      "register",
      {
        email: "test@example.com",
        password: "long-test-password",
        full_name: "Test Customer",
      },
      "/checkout",
    );
    expect(result).toMatchObject({ ok: true, data: { authenticated: false } });
    expect(c.auth.signUp.mock.calls[0][0].options.emailRedirectTo).toContain(
      "next=%2Fcheckout",
    );
    expect(c.auth.getUser).not.toHaveBeenCalled();
  });
  it("verifies immediate signup sessions before returning customers to checkout", async () => {
    const c = client();
    c.auth.signUp.mockResolvedValue({
      data: { user: { id: uid }, session: { user: { id: uid } } },
      error: null,
    });
    mocks.db.mockResolvedValue(c);
    expect(
      await authenticate(
        "register",
        {
          email: "test@example.com",
          password: "long-test-password",
          full_name: "Test Customer",
        },
        "/checkout",
      ),
    ).toMatchObject({ ok: true, data: { authenticated: true } });
    expect(c.auth.getUser).toHaveBeenCalled();
    expect(c.chain.eq).toHaveBeenCalledWith("id", uid);
  });
  it("does not report signup success for provider or profile-trigger failures", async () => {
    const c = client();
    c.auth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "unexpected_failure", status: 500 },
    });
    mocks.db.mockResolvedValue(c);
    expect(
      (
        await authenticate("register", {
          email: "test@example.com",
          password: "long-test-password",
          full_name: "Test Customer",
        })
      ).ok,
    ).toBe(false);
  });
  it("refuses an unverified login session and keeps password reset working", async () => {
    const c = client();
    mocks.db.mockResolvedValue(c);
    c.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect(
      (
        await authenticate("login", {
          email: "test@example.com",
          password: "long-test-password",
        })
      ).ok,
    ).toBe(false);
    expect(
      (await authenticate("reset", { password: "new-test-password" })).ok,
    ).toBe(true);
    expect(c.auth.updateUser).toHaveBeenCalledWith({
      password: "new-test-password",
    });
  });
  it("retains safe return links between login and registration", () => {
    const login = renderToStaticMarkup(
      createElement(AuthForm, { mode: "login", next: "/checkout" }),
    );
    const register = renderToStaticMarkup(
      createElement(AuthForm, { mode: "register", next: "/checkout" }),
    );
    expect(login).toContain("/register?next=%2Fcheckout");
    expect(register).toContain("/login?next=%2Fcheckout");
    expect(
      renderToStaticMarkup(
        createElement(AuthForm, {
          mode: "login",
          next: "https://evil.example",
        }),
      ),
    ).not.toContain("evil.example");
  });
  it.each(["categories", "banners", "branding"])(
    "uploads %s images under the correct staff scope",
    async (target) => {
      const c = client(),
        bucket = {
          upload: vi.fn().mockResolvedValue({ error: null }),
          getPublicUrl: vi.fn().mockReturnValue({
            data: {
              publicUrl:
                "https://test.supabase.co/storage/v1/object/public/product-images/example.png",
            },
          }),
        };
      mocks.db.mockResolvedValue({
        ...c,
        storage: { from: vi.fn().mockReturnValue(bucket) },
      });
      const form = new FormData();
      form.set("target", target);
      form.set(
        "file",
        new File(
          [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
          "test.png",
          { type: "image/png" },
        ),
      );
      expect((await uploadContentImage(form)).ok).toBe(true);
      expect(mocks.staff).toHaveBeenCalledWith(
        target === "categories" ? "catalog" : "settings",
      );
      expect(bucket.upload.mock.calls[0][0]).toMatch(
        new RegExp("^" + target + "/"),
      );
      expect(c.from).not.toHaveBeenCalled();
    },
  );
  it("rejects unsupported content upload targets and forbidden callers", async () => {
    const form = new FormData();
    form.set("target", "profiles");
    expect((await uploadContentImage(form)).ok).toBe(false);
    expect(mocks.db).not.toHaveBeenCalled();
    form.set("target", "branding");
    mocks.staff.mockRejectedValue(new Error("Forbidden"));
    expect((await uploadContentImage(form)).ok).toBe(false);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("persists product and variant changes through scoped actions", async () => {
    const c = client();
    mocks.db.mockResolvedValue(c);
    expect(
      (
        await saveProduct(null, {
          name: "Audit piece",
          slug: "audit-piece",
          sku: "AUDIT",
          price: 10000,
          sale_price: null,
          status: "draft",
          category_id: null,
          featured: false,
          tags: [],
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await saveVariant(null, {
          product_id: uid,
          sku: "AUDIT-M",
          size: "M",
          color: "Ivory",
          price: null,
          active: true,
        })
      ).ok,
    ).toBe(true);
    expect(mocks.staff).toHaveBeenCalledWith("catalog");
    expect(c.from).toHaveBeenCalledWith("products");
    expect(c.from).toHaveBeenCalledWith("product_variants");
  });
  it.each(["image/jpeg", "image/png", "image/webp"])(
    "uploads validated %s and stores its metadata (mocked Storage HTTP)",
    async (mime) => {
      const bytes =
        mime === "image/jpeg"
          ? [255, 216, 255, 0]
          : mime === "image/png"
            ? [137, 80, 78, 71, 13, 10, 26, 10]
            : [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80];
      const c = client();
      const bucket = {
        upload: vi.fn().mockResolvedValue({ error: null }),
        remove: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({
          data: {
            publicUrl:
              "https://test.supabase.co/storage/v1/object/public/product-images/audit.png",
          },
        }),
      };
      c.chain.insert.mockResolvedValue({ error: null });
      mocks.db.mockResolvedValue({
        ...c,
        storage: { from: vi.fn().mockReturnValue(bucket) },
      });
      const form = new FormData();
      form.set(
        "file",
        new File([new Uint8Array(bytes)], "audit", { type: mime }),
      );
      form.set("product_id", uid);
      form.set("alt", "Audit image");
      form.set("position", "0");
      expect((await uploadImage(form)).ok).toBe(true);
      expect(bucket.upload).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp("^" + uid + "/")),
        expect.any(Uint8Array),
        { contentType: mime, upsert: false },
      );
      expect(c.from).toHaveBeenCalledWith("product_images");
      form.set("view", "front");
      form.set("color", "Blue");
      expect((await uploadImage(form)).ok).toBe(true);
      expect(c.rpc).toHaveBeenLastCalledWith(
        "save_product_image",
        expect.objectContaining({
          p_product: uid,
          p_view: "front",
          p_color: "Blue",
        }),
      );
    },
  );
  it("rejects disguised and oversized images before Storage is called", async () => {
    const form = new FormData();
    form.set(
      "file",
      new File(["<svg></svg>"], "bad.png", { type: "image/png" }),
    );
    expect((await uploadImage(form)).ok).toBe(false);
    form.set(
      "file",
      new File([new Uint8Array(4194305)], "large.png", { type: "image/png" }),
    );
    expect((await uploadImage(form)).ok).toBe(false);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("cleans up an uploaded orphan if metadata insertion fails", async () => {
    const c = client();
    const bucket = {
      upload: vi.fn().mockResolvedValue({ error: null }),
      remove: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn().mockReturnValue({
        data: {
          publicUrl:
            "https://test.supabase.co/storage/v1/object/public/product-images/audit.png",
        },
      }),
    };
    c.chain.insert.mockResolvedValue({
      error: { code: "23503", message: "private" },
    });
    mocks.db.mockResolvedValue({
      ...c,
      storage: { from: vi.fn().mockReturnValue(bucket) },
    });
    const form = new FormData();
    form.set(
      "file",
      new File(
        [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
        "audit.png",
        { type: "image/png" },
      ),
    );
    form.set("product_id", uid);
    form.set("alt", "Audit image");
    form.set("position", "0");
    expect((await uploadImage(form)).ok).toBe(false);
    expect(bucket.remove).toHaveBeenCalledWith([
      bucket.upload.mock.calls[0][0],
    ]);
  });
  it("removes image metadata only through a catalog-scoped action", async () => {
    const c = client();
    mocks.db.mockResolvedValue(c);
    expect((await removeImage(uid)).ok).toBe(true);
    expect(mocks.staff).toHaveBeenCalledWith("catalog");
    expect(c.chain.delete).toHaveBeenCalled();
  });
  it("does not turn a failed shopping read into an empty cart", async () => {
    const c = client();
    c.chain.single.mockResolvedValue({
      data: null,
      error: { code: "503", message: "private internal message" },
    });
    mocks.db.mockResolvedValue(c);
    await expect(loadShopping()).rejects.toThrow(
      "Shopping data could not be loaded",
    );
    expect(c.rpc).not.toHaveBeenCalled();
  });
  it("fails no-op address/image saves instead of claiming success", async () => {
    const c = client();
    c.chain.single.mockResolvedValue({
      data: null,
      error: { code: "PGRST116", message: "internal" },
    });
    mocks.db.mockResolvedValue(c);
    expect((await saveAddress(uid, address)).ok).toBe(false);
    expect(
      (await editImage({ id: uid, alt: "Original photo", position: 0 })).ok,
    ).toBe(false);
    expect(c.chain.eq).toHaveBeenCalledWith("user_id", uid);
  });
  it("handles checkout and inquiry envelopes as errors", async () => {
    const c = client();
    c.rpc.mockResolvedValue({
      data: { error: "Please try again later" },
      error: null,
    });
    mocks.db.mockResolvedValue(c);
    const r = await placeOrder({
      items: [{ variant_id: vid, quantity: 1 }],
      address,
      coupon: "",
      notes: "",
      key: uid,
    });
    expect(r).toEqual({ ok: false, message: "Please try again later" });
    expect(
      (
        await sendInquiry({
          name: "Audit User",
          email: "test@example.com",
          message: "A test inquiry for the store.",
        })
      ).ok,
    ).toBe(false);
  });
  it("uses the existing checkout for members and the private server token for guests", async () => {
    const c = client();
    mocks.db.mockResolvedValue(c);
    const input = {
      items: [{ variant_id: vid, quantity: 1 }],
      address,
      key: uid,
      price: 1,
      user_id: uid,
    };
    expect((await placeOrder(input)).ok).toBe(true);
    expect(c.rpc).toHaveBeenLastCalledWith(
      "checkout",
      expect.not.objectContaining({ p_token: expect.anything() }),
    );
    mocks.currentUser.mockResolvedValue(null);
    const result = await placeOrder(input, true);
    expect(result.ok).toBe(true);
    expect(c.rpc).toHaveBeenLastCalledWith(
      "guest_checkout",
      expect.objectContaining({ p_token: "a".repeat(64), p_quote: true }),
    );
    expect(c.rpc.mock.calls.at(-1)?.[1]).not.toHaveProperty("price");
    expect(c.rpc.mock.calls.at(-1)?.[1]).not.toHaveProperty("user_id");
    expect(JSON.stringify(result)).not.toContain("a".repeat(64));
  });
  it("rejects prototype keys, invalid quote booleans and invalid guest checkout", async () => {
    const c = client();
    mocks.db.mockResolvedValue(c);
    expect((await saveRecord("__proto__", null, {})).ok).toBe(false);
    expect(
      (
        await placeOrder(
          { items: [{ variant_id: vid, quantity: 1 }], address, key: uid },
          "false" as unknown as boolean,
        )
      ).ok,
    ).toBe(false);
    mocks.currentUser.mockResolvedValue(null);
    expect((await placeOrder({})).ok).toBe(false);
    expect(c.rpc).not.toHaveBeenCalled();
  });
  it("redacts unexpected transport failures", async () => {
    mocks.db.mockRejectedValue(new Error("SECRET_TEST_ONLY"));
    const r = await saveAddress(null, address);
    expect(r.message).toBe("Unable to save. Please try again.");
  });
  it("filters the signed-in profile by its verified user ID and logs disabled accounts out", async () => {
    const c = client();
    mocks.db.mockResolvedValue(c);
    expect(
      (
        await authenticate("login", {
          email: "test@example.com",
          password: "long-test-password",
        })
      ).ok,
    ).toBe(true);
    expect(c.chain.eq).toHaveBeenCalledWith("id", uid);
    c.chain.single.mockResolvedValue({
      data: null,
      error: { code: "PGRST116" },
    });
    expect(
      (
        await authenticate("login", {
          email: "test@example.com",
          password: "long-test-password",
        })
      ).ok,
    ).toBe(false);
    expect(c.auth.signOut).toHaveBeenCalled();
    expect(c.rpc).not.toHaveBeenCalled();
  });
  it("does not claim recovery succeeded when the Auth transport failed", async () => {
    const c = client();
    c.auth.resetPasswordForEmail.mockResolvedValue({
      error: { message: "private SMTP error" },
    });
    mocks.db.mockResolvedValue(c);
    const r = await authenticate("forgot", { email: "test@example.com" });
    expect(r.ok).toBe(false);
    expect(r.message).not.toContain("SMTP");
  });
});
