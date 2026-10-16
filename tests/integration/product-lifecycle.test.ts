import { beforeAll, afterAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
let db: PGlite;
const owner = "00000000-0000-4000-8000-000000000001",
  customer = "00000000-0000-4000-8000-000000000002",
  catalog = "00000000-0000-4000-8000-000000000003",
  orders = "00000000-0000-4000-8000-000000000004";
async function actor(id: string | null, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id ?? "",
  ]);
  await db.exec("set role " + role);
}
async function seed(stock = 0, status = "draft") {
  await db.exec("reset role");
  const p = crypto.randomUUID(),
    v = crypto.randomUUID();
  await db.query(
    "insert into products(id,name,slug,sku,price,status,has_sizes) values($1::uuid,'Lifecycle piece',$1::uuid::text,$1::uuid::text,100000,$2,true)",
    [p, status],
  );
  await db.query(
    "insert into product_variants(id,product_id,sku,size,color) values($1::uuid,$2,$1::uuid::text,'S','Blue')",
    [v, p],
  );
  await db.query("insert into inventory(variant_id,on_hand) values($1,$2)", [
    v,
    stock,
  ]);
  await actor(owner);
  return { p, v };
}
async function removal(p: string, apply = false, archive = false) {
  return (
    await db.query<{ r: Record<string, unknown> }>(
      "select product_removal($1,$2,$3) r",
      [p, apply, archive],
    )
  ).rows[0].r;
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
    `insert into auth.users(id) values('${owner}'),('${customer}'),('${catalog}'),('${orders}');update profiles set role='owner' where id='${owner}';update profiles set role='catalog_manager' where id='${catalog}';update profiles set role='order_manager' where id='${orders}';`,
  );
});
afterAll(async () => {
  await db?.close();
});
it("updates the original product and preserves images, other variants and audited inventory", async () => {
  const { p, v } = await seed();
  const other = crypto.randomUUID();
  await db.query(
    "insert into product_variants(id,product_id,sku,size,color) values($1::uuid,$2,$1::uuid::text,'M','Blue')",
    [other, p],
  );
  await db.query(
    "select save_product_image($1,'https://test.example/front.png','Front',0,'front','Blue')",
    [p],
  );
  const images = (
    await db.query("select * from product_images where product_id=$1", [p])
  ).rows;
  await db.query(
    "update products set name='Edited piece',price=200000,sale_price=150000 where id=$1 returning id",
    [p],
  );
  await db.query(
    "update product_variants set sku='EDITED-S',size='L' where id=$1",
    [v],
  );
  await db.query("select adjust_inventory($1,5,'add','New stock')", [v]);
  expect(
    (
      await db.query("select name,price,sale_price from products where id=$1", [
        p,
      ])
    ).rows,
  ).toEqual([{ name: "Edited piece", price: 200000, sale_price: 150000 }]);
  expect(
    (await db.query("select * from product_images where product_id=$1", [p]))
      .rows,
  ).toEqual(images);
  expect(
    (
      await db.query<{ size: string }>(
        "select size from product_variants where id=$1",
        [other],
      )
    ).rows[0].size,
  ).toBe("M");
  expect(
    (
      await db.query<{ on_hand: number }>(
        "select on_hand from inventory where variant_id=$1",
        [v],
      )
    ).rows[0].on_hand,
  ).toBe(5);
});
it("permanently removes eligible drafts, retains stored files and records an audit", async () => {
  const { p } = await seed();
  const path = p + "/" + crypto.randomUUID() + ".png";
  await db.query(
    "insert into storage.objects(bucket_id,name) values('product-images',$1)",
    [path],
  );
  await db.query("select save_product_image($1,$2,'Front',0,'front',null)", [
    p,
    "https://test.supabase.co/storage/v1/object/public/product-images/" + path,
  ]);
  const plan = await removal(p);
  expect(plan.outcome).toBe("deleted");
  expect(plan.applied).toBe(false);
  expect((await removal(p, true)).outcome).toBe("deleted");
  expect(
    (await db.query("select * from products where id=$1", [p])).rows,
  ).toHaveLength(0);
  expect(
    (await db.query("select * from storage.objects where name=$1", [path]))
      .rows,
  ).toHaveLength(1);
  await db.exec("reset role");
  expect(
    (
      await db.query(
        "select * from admin_audit_logs where action='PRODUCT_REMOVAL' and entity_id=$1",
        [p],
      )
    ).rows,
  ).toHaveLength(1);
});
it("archives published products and rechecks dependencies added after inspection", async () => {
  const published = await seed(0, "published");
  expect((await removal(published.p, true)).outcome).toBe("archived");
  const { p, v } = await seed();
  expect((await removal(p)).outcome).toBe("deleted");
  await db.query("select adjust_inventory($1,1,'add','Received stock')", [v]);
  expect((await removal(p, true)).outcome).toBe("archived");
  await expect(
    db.query("delete from products where id=$1", [p]),
  ).rejects.toThrow("protected dependencies");
});
it("retains cart, wishlist and coupon targets instead of cascading them away", async () => {
  const { p, v } = await seed();
  await db.exec("reset role");
  await db.query(
    "insert into cart_items(cart_id,variant_id,quantity) select id,$1,1 from carts where user_id=$2",
    [v, customer],
  );
  await db.query(
    "insert into wishlist_items(wishlist_id,product_id) select id,$1 from wishlists where user_id=$2",
    [p, customer],
  );
  await db.query(
    "insert into coupons(code,kind,value,product_ids) values($1,'fixed',100,array[$2]::uuid[])",
    [("C-" + p).toUpperCase(), p],
  );
  await actor(catalog);
  const plan = await removal(p, true);
  expect(plan.outcome).toBe("archived");
  expect(plan.dependencies).toMatchObject({
    carts: 1,
    wishlists: 1,
    coupons: 1,
  });
  await db.exec("reset role");
  expect(
    (await db.query("select * from cart_items where variant_id=$1", [v])).rows,
  ).toHaveLength(1);
});
it("archives ordered products without changing snapshots, payments or inventory history and blocks new purchases", async () => {
  const { p, v } = await seed(3, "published");
  await actor(customer);
  const items = JSON.stringify([{ variant_id: v, quantity: 1 }]),
    address = JSON.stringify({
      full_name: "Test Customer",
      phone: "03001234567",
      line1: "12 Test Street",
      city: "Lahore",
      postal_code: "",
    });
  const order = (
    await db.query<{ r: { id: string } }>(
      "select checkout($1::jsonb,$2::jsonb,'','',$3,false) r",
      [items, address, crypto.randomUUID()],
    )
  ).rows[0].r;
  const snapshot = (
    await db.query("select * from order_items where order_id=$1", [order.id])
  ).rows;
  await actor(owner);
  expect((await removal(p, true)).outcome).toBe("archived");
  await expect(
    db.query("delete from products where id=$1", [p]),
  ).rejects.toThrow();
  expect(
    (
      await db.query<{ r: { outcome: string } }>(
        "select variant_removal($1) r",
        [v],
      )
    ).rows[0].r.outcome,
  ).toBe("deactivated");
  await actor(customer);
  expect(
    (await db.query("select * from order_items where order_id=$1", [order.id]))
      .rows,
  ).toEqual(snapshot);
  expect(
    (await db.query("select * from payments where order_id=$1", [order.id]))
      .rows,
  ).toHaveLength(1);
  expect(
    (
      await db.query<{ r: { error: string } }>(
        "select checkout($1::jsonb,$2::jsonb,'','',$3,false) r",
        [items, address, crypto.randomUUID()],
      )
    ).rows[0].r.error,
  ).toContain("unavailable");
  expect(
    (await db.query("select * from products where id=$1", [p])).rows,
  ).toHaveLength(0);
});
it("removes only unused zero-stock variants and preserves the last image-associated color", async () => {
  const unused = await seed();
  expect(
    (
      await db.query<{ r: { outcome: string } }>(
        "select variant_removal($1) r",
        [unused.v],
      )
    ).rows[0].r.outcome,
  ).toBe("deleted");
  const { p, v } = await seed();
  await db.query(
    "select save_product_image($1,'https://test.example/blue.png','Blue',0,'front','Blue')",
    [p],
  );
  expect(
    (
      await db.query<{ r: { outcome: string } }>(
        "select variant_removal($1) r",
        [v],
      )
    ).rows[0].r.outcome,
  ).toBe("deactivated");
  await expect(
    db.query("delete from product_variants where id=$1", [v]),
  ).rejects.toThrow("referenced");
});
it("prevents customers, order managers and anonymous callers from lifecycle operations", async () => {
  const { p, v } = await seed();
  for (const [id, role] of [
    [customer, "authenticated"],
    [orders, "authenticated"],
    [null, "anon"],
  ] as const) {
    await actor(id, role);
    await expect(removal(p, true)).rejects.toThrow();
    await expect(db.query("select variant_removal($1)", [v])).rejects.toThrow();
    await expect(
      db.query("select inspect_product_asset($1)", [
        p + "/" + crypto.randomUUID() + ".png",
      ]),
    ).rejects.toThrow();
    if (role === "anon")
      await expect(
        db.query(
          "update products set name='Unauthorized' where id=$1 returning id",
          [p],
        ),
      ).rejects.toThrow();
    else
      expect(
        (
          await db.query(
            "update products set name='Unauthorized' where id=$1 returning id",
            [p],
          )
        ).rows,
      ).toHaveLength(0);
  }
});
it("protects shared images and page references, audits verified orphan deletion and blocks dangling reattachment", async () => {
  const { p } = await seed();
  const path = p + "/" + crypto.randomUUID() + ".png",
    url =
      "https://test.supabase.co/storage/v1/object/public/product-images/" +
      path;
  await db.query(
    "insert into storage.objects(bucket_id,name) values('product-images',$1)",
    [path],
  );
  const image = (
    await db.query<{ id: string }>(
      "select save_product_image($1,$2,'Front',0,'front',null) id",
      [p, url],
    )
  ).rows[0].id;
  const duplicate = (
    await db.query<{ id: string }>("select duplicate_product($1) id", [p])
  ).rows[0].id;
  await db.query("delete from product_images where id=$1", [image]);
  expect(
    (
      await db.query<{ r: { referenced: boolean } }>(
        "select inspect_product_asset($1) r",
        [path],
      )
    ).rows[0].r.referenced,
  ).toBe(true);
  expect(
    (
      await db.query("delete from storage.objects where name=$1 returning id", [
        path,
      ])
    ).rows,
  ).toHaveLength(0);
  await db.query("delete from product_images where product_id=$1", [duplicate]);
  const slug = crypto.randomUUID();
  await db.query(
    "insert into pages(slug,title,content) values($1,'Photo page',$2)",
    [slug, "![Photo](" + url + ")"],
  );
  expect(
    (
      await db.query<{ r: { referenced: boolean } }>(
        "select inspect_product_asset($1) r",
        [path],
      )
    ).rows[0].r.referenced,
  ).toBe(true);
  await db.query("update pages set content='No photo' where slug=$1", [slug]);
  expect(
    (
      await db.query("delete from storage.objects where name=$1 returning id", [
        path,
      ])
    ).rows,
  ).toHaveLength(1);
  await expect(
    db.query("select save_product_image($1,$2,'Deleted file',0,'front',null)", [
      p,
      url,
    ]),
  ).rejects.toThrow("removed");
  await db.exec("reset role");
  expect(
    (
      await db.query(
        "select * from admin_audit_logs where action='PRODUCT_ASSET_DELETE' and details->>'path'=$1",
        [path],
      )
    ).rows,
  ).toHaveLength(1);
});
