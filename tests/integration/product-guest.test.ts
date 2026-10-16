import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
let db: PGlite;
const owner = "00000000-0000-4000-8000-000000000001",
  customer = "00000000-0000-4000-8000-000000000002";
const product = "10000000-0000-4000-8000-000000000001",
  variant = "a0000001-0000-0000-0000-000000000000";
const address = {
  full_name: "Guest Test",
  phone: "03001234567",
  line1: "12 Test Street",
  city: "Lahore",
  postal_code: "",
  email: "guest@example.com",
};
const token = () =>
  crypto.randomUUID().replaceAll("-", "") +
  crypto.randomUUID().replaceAll("-", "");
async function asUser(id: string | null, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id ?? "",
  ]);
  await db.exec("set role " + role);
}
async function guest(
  access: string,
  key = crypto.randomUUID(),
  quantity = 1,
  coupon = "",
  quote = false,
  delivery = address,
) {
  const r = await db.query<{ result: Record<string, unknown> }>(
    "select guest_checkout($1::jsonb,$2::jsonb,$3,'',$4,$5,$6) result",
    [
      JSON.stringify([{ variant_id: variant, quantity }]),
      JSON.stringify(delivery),
      coupon,
      key,
      access,
      quote,
    ],
  );
  return r.rows[0].result;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets,name text);alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;grant select on storage.objects to anon;grant select,insert,update,delete on storage.objects to authenticated;",
  );
  for (const file of readdirSync("supabase/migrations").sort())
    await db.exec(
      readFileSync("supabase/migrations/" + file, "utf8").replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
  await db.exec(
    `insert into auth.users(id) values('${owner}'),('${customer}');update profiles set role='owner' where id='${owner}';insert into products(id,name,slug,sku,price,sale_price,status,has_sizes) values('${product}','Test garment','test-garment','TEST',500000,400000,'published',true);insert into product_variants(id,product_id,sku,size,color) values('${variant}','${product}','TEST-S','S','Ivory');insert into inventory(variant_id,on_hand) values('${variant}',50);`,
  );
});
afterAll(async () => {
  await db?.close();
});
describe.sequential("Designated views and private guest orders", () => {
  it("upserts designated view/color photos, preserves other images, and rejects duplicate combinations", async () => {
    await asUser(owner);
    const first = await db.query<{ id: string }>(
      "select save_product_image($1,$2,'Front',0,'front',null) id",
      [product, "https://test.supabase.co/front.png"],
    );
    const replacement = await db.query<{ id: string }>(
      "select save_product_image($1,$2,'New front',0,'front',null) id",
      [product, "https://test.supabase.co/new-front.png"],
    );
    expect(replacement.rows[0].id).toBe(first.rows[0].id);
    await db.query("select save_product_image($1,$2,'Back',1,'back','Ivory')", [
      product,
      "https://test.supabase.co/back.png",
    ]);
    expect(
      (
        await db.query("select * from product_images where product_id=$1", [
          product,
        ])
      ).rows,
    ).toHaveLength(2);
    await expect(
      db.query(
        "insert into product_images(product_id,url,alt,view,color) values($1,'https://test.supabase.co/duplicate.png','Duplicate','back','ivory')",
        [product],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "select save_product_image($1,'https://test.supabase.co/bad.png','Bad',0,'front','Unknown')",
        [product],
      ),
    ).rejects.toThrow("existing product color");
    await asUser(customer);
    await expect(
      db.query(
        "select save_product_image($1,'https://test.supabase.co/bad.png','Bad',0,'front',null)",
        [product],
      ),
    ).rejects.toThrow("Forbidden");
  });
  it("copies sizing/view/color metadata without copying stock", async () => {
    await asUser(owner);
    const copy = (
      await db.query<{ id: string }>("select duplicate_product($1) id", [
        product,
      ])
    ).rows[0].id;
    expect(
      (
        await db.query<{ has_sizes: boolean }>(
          "select has_sizes from products where id=$1",
          [copy],
        )
      ).rows[0].has_sizes,
    ).toBe(true);
    expect(
      (
        await db.query(
          "select view,color from product_images where product_id=$1",
          [copy],
        )
      ).rows,
    ).toHaveLength(2);
  });
  it("creates a guest COD order with immutable variant snapshots and idempotent retries, without Auth users", async () => {
    await asUser(null, "anon");
    const access = token(),
      key = crypto.randomUUID();
    const order = await guest(access, key);
    expect(order.error).toBeUndefined();
    expect(order.subtotal).toBe(400000);
    expect(order.total).toBe(425000);
    const retry = await guest(access, key);
    expect(retry.id).toBe(order.id);
    const own = (
      await db.query<{ result: Record<string, unknown> }>(
        "select guest_order($1,$2) result",
        [order.id, access],
      )
    ).rows[0].result;
    expect(own.user_id).toBeNull();
    expect(own.address).toMatchObject({ email: "guest@example.com" });
    expect(own.order_items).toMatchObject([
      { size: "S", color: "Ivory", unit_price: 400000, quantity: 1 },
    ]);
    expect(own.guest_access_hash).toBeUndefined();
    expect(own.request_hash).toBeUndefined();
    expect(
      (
        await db.query<{ result: unknown }>(
          "select guest_order($1,$2) result",
          [order.id, token()],
        )
      ).rows[0].result,
    ).toBeNull();
    await expect(db.query("select * from orders")).rejects.toThrow();
    await expect(
      db.query("select checkout('[]','{}','','',$1,false)", [
        crypto.randomUUID(),
      ]),
    ).rejects.toThrow();
    await expect(
      db.query("select checkout_engine('[]','{}','','',$1,false,$2)", [
        crypto.randomUUID(),
        access,
      ]),
    ).rejects.toThrow();
    await asUser(customer);
    expect((await db.query("select * from orders")).rows).toHaveLength(0);
    await db.exec("reset role");
    expect((await db.query("select * from auth.users")).rows).toHaveLength(2);
    expect(
      (
        await db.query<{ on_hand: number }>(
          "select on_hand from inventory where variant_id=$1",
          [variant],
        )
      ).rows[0].on_hand,
    ).toBe(49);
  });
  it("rejects changed retries, malformed input and overselling without partial orders", async () => {
    await asUser(null, "anon");
    const access = token(),
      key = crypto.randomUUID();
    const first = await guest(access, key);
    expect(first.error).toBeUndefined();
    expect((await guest(access, key, 2)).error).toBe(
      "Checkout key already used",
    );
    expect((await guest(token(), crypto.randomUUID(), 99)).error).toContain(
      "insufficient stock",
    );
    expect(
      (
        await guest(token(), crypto.randomUUID(), 1, "", false, {
          ...address,
          email: "invalid",
        })
      ).error,
    ).toBe("Invalid email");
  });
  it("preserves guest coupon restrictions, quote semantics and per-guest limits", async () => {
    await asUser(owner);
    await db.exec(
      `insert into coupons(code,kind,value,starts_at,customer_ids) values('GUEST-OK','percentage',10,'2020-01-01','{}'),('MEMBERS','percentage',10,'2020-01-01',array['${customer}']::uuid[])`,
    );
    await asUser(null, "anon");
    const access = token();
    const quote = await guest(access, crypto.randomUUID(), 1, "GUEST-OK", true);
    expect(quote.discount).toBe(40000);
    expect(
      (await guest(access, crypto.randomUUID(), 1, "MEMBERS", true)).error,
    ).toBe("Coupon is unavailable");
    expect(
      (await guest(access, crypto.randomUUID(), 1, "GUEST-OK")).error,
    ).toBeUndefined();
    expect(
      (await guest(access, crypto.randomUUID(), 1, "GUEST-OK")).error,
    ).toBe("Coupon usage limit reached");
  });
  it("allows staff to manage guest fulfillment, payments and stock with existing RPCs", async () => {
    await asUser(null, "anon");
    const access = token();
    const order = await guest(access);
    expect(order.error).toBeUndefined();
    await asUser(owner);
    for (const status of [
      "confirmed",
      "processing",
      "packed",
      "shipped",
      "out_for_delivery",
      "delivered",
    ])
      await db.query(
        "select transition_order($1,$2,'GUEST-TRACK','Courier','Guest fulfillment test')",
        [order.id, status],
      );
    await db.query(
      "select record_cod_payment($1,'paid','Collected guest COD')",
      [order.id],
    );
    expect(
      (
        await db.query<{ payment_status: string }>(
          "select payment_status from orders where id=$1",
          [order.id],
        )
      ).rows[0].payment_status,
    ).toBe("paid");
  });
});
