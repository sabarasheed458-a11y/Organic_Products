import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
let db: PGlite;
const owner = "00000000-0000-4000-8000-000000000001",
  customer = "00000000-0000-4000-8000-000000000002",
  other = "00000000-0000-4000-8000-000000000003",
  catalog = "00000000-0000-4000-8000-000000000004",
  orderManager = "00000000-0000-4000-8000-000000000005";
const pid = "10000000-0000-4000-8000-000000000001",
  vid = "20000000-0000-4000-8000-000000000001";
const address = {
  full_name: "Ayesha Khan",
  phone: "03001234567",
  line1: "12 Garden Road",
  city: "Lahore",
  postal_code: "54000",
};
async function asUser(id: string | null, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id ?? "",
  ]);
  await db.exec("set role " + role);
}
async function privileged(sql: string) {
  await db.exec("reset role");
  return db.exec(sql);
}
async function checkout(
  qty = 1,
  key = crypto.randomUUID(),
  coupon = "",
  quote = false,
) {
  const result = await db.query<{ result: Record<string, unknown> }>(
    "select public.checkout($1::jsonb,$2::jsonb,$3,$4,$5::uuid,$6) result",
    [
      JSON.stringify([{ variant_id: vid, quantity: qty }]),
      JSON.stringify(address),
      coupon,
      "",
      key,
      quote,
    ],
  );
  const value = result.rows[0].result;
  if (value.error) throw new Error(String(value.error));
  return value;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
  );
  // PGlite includes gen_random_uuid; pgcrypto extension loading is excluded only in this harness.
  await db.exec(
    readFileSync(
      "supabase/migrations/202610120001_commerce.sql",
      "utf8",
    ).replace("create extension if not exists pgcrypto;", ""),
  );
  await db.exec(
    readFileSync("supabase/migrations/202610120003_shopping.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/202610120004_admin_tools.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/202610120005_branding.sql", "utf8"),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/202610120006_catalog_pricing.sql",
      "utf8",
    ),
  );
  await db.exec(
    `create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets,name text);alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;grant select on storage.objects to anon;grant select,insert,update,delete on storage.objects to authenticated;`,
  );
  await db.exec(
    readFileSync("supabase/migrations/202610120002_storage.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/202610120007_security_audit.sql", "utf8"),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/202610120008_configuration_integrity.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/202610120009_content_image_uploads.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/202610120010_shopping_containers.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/202610140011_product_options.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync("supabase/migrations/202610140012_guest_checkout.sql", "utf8"),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/202610140013_product_lifecycle.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/202610140014_order_progress_feedback.sql",
      "utf8",
    ),
  );
  await privileged(
    `insert into auth.users(id) values('${owner}'),('${customer}'),('${other}'),('${catalog}'),('${orderManager}');update profiles set role='owner' where id='${owner}';update profiles set role='catalog_manager' where id='${catalog}';update profiles set role='order_manager' where id='${orderManager}';insert into products(id,name,slug,sku,price,sale_price,status) values('${pid}','Soft robe','soft-robe','MM-ROBE',500000,400000,'published');insert into product_variants(id,product_id,sku,size,color) values('${vid}','${pid}','MM-ROBE-M','M','Ivory');insert into inventory(variant_id,on_hand) values('${vid}',10);`,
  );
});
afterAll(async () => {
  await db?.close();
});
describe.sequential(
  "PostgreSQL migrations, RLS and commerce transactions",
  () => {
    it("rejects explicit nulls at the direct RPC boundary", async () => {
      await asUser(customer);
      const invalid = await db.query<{ checkout: { error: string } }>(
        "select checkout(null,$1::jsonb,'','',$2,false)",
        [JSON.stringify(address), crypto.randomUUID()],
      );
      expect(invalid.rows[0].checkout.error).toBe("Invalid cart");
      const mode = await db.query<{ checkout: { error: string } }>(
        "select checkout($1::jsonb,'{}'::jsonb,'','',$2,null)",
        [
          JSON.stringify([{ variant_id: vid, quantity: 1 }]),
          crypto.randomUUID(),
        ],
      );
      expect(mode.rows[0].checkout.error).toBe("Invalid checkout mode");
      await expect(
        db.query("select save_shopping(null,'[]'::jsonb)"),
      ).rejects.toThrow("Invalid shopping data");
    });
    it("creates profiles as customers regardless of signup metadata", async () => {
      const uid = crypto.randomUUID();
      await privileged(
        `insert into auth.users(id,raw_user_meta_data) values('${uid}','{"role":"owner"}');`,
      );
      const r = await db.query<{ role: string }>(
        "select role from profiles where id=$1",
        [uid],
      );
      expect(r.rows[0].role).toBe("customer");
    });
    it("permits public published catalog but denies private records", async () => {
      await asUser(null, "anon");
      expect((await db.query("select * from products")).rows).toHaveLength(1);
      await expect(db.query("select * from orders")).rejects.toThrow();
      await privileged(
        "insert into products(name,slug,sku,price,status) values('Hidden','hidden','HIDDEN',1,'draft')",
      );
      await asUser(null, "anon");
      expect((await db.query("select * from products")).rows).toHaveLength(1);
    });
    it("prevents self promotion and direct stock or order writes", async () => {
      await asUser(customer);
      await expect(
        db.query("update profiles set role='owner' where id=$1", [customer]),
      ).rejects.toThrow();
      await expect(
        db.query("update inventory set on_hand=999"),
      ).rejects.toThrow();
      await expect(db.query("delete from orders")).rejects.toThrow();
      await expect(
        db.query("select adjust_inventory($1,99,'set','Unauthorized')", [vid]),
      ).rejects.toThrow("Forbidden");
    });
    it("records reasoned stock adjustments and rejects negative stock", async () => {
      await asUser(catalog);
      await db.query("select adjust_inventory($1,10,'set','Initial stock')", [
        vid,
      ]);
      await expect(
        db.query("select adjust_inventory($1,11,'subtract','Stock error')", [
          vid,
        ]),
      ).rejects.toThrow();
      const r = await db.query<{ on_hand: number }>(
        "select on_hand from inventory where variant_id=$1",
        [vid],
      );
      expect(r.rows[0].on_hand).toBe(10);
      expect(
        (await db.query("select * from inventory_movements")).rows.length,
      ).toBeGreaterThan(0);
    });
    it("calculates authoritative prices, deducts correct stock and retries idempotently", async () => {
      await asUser(customer);
      const key = crypto.randomUUID();
      const order = await checkout(2, key);
      expect(order.subtotal).toBe(800000);
      expect(order.total).toBe(800000);
      const retry = await checkout(2, key);
      expect(retry.id).toBe(order.id);
      expect(
        (
          await db.query<{ on_hand: number }>(
            "select on_hand from inventory where variant_id=$1",
            [vid],
          )
        ).rows[0].on_hand,
      ).toBe(8);
      await expect(checkout(1, key)).rejects.toThrow(
        "Checkout key already used",
      );
    });
    it("preserves immutable snapshots after catalog price changes and isolates customers", async () => {
      await privileged(
        `update products set sale_price=300000 where id='${pid}'`,
      );
      await asUser(customer);
      const r = await db.query<{ unit_price: number }>(
        "select unit_price from order_items",
      );
      expect(r.rows[0].unit_price).toBe(400000);
      await privileged("");
      await expect(
        db.exec("update order_items set unit_price=1"),
      ).rejects.toThrow("immutable");
      await asUser(other);
      expect((await db.query("select * from orders")).rows).toHaveLength(0);
      expect((await db.query("select * from order_items")).rows).toHaveLength(
        0,
      );
    });
    it("rejects overselling and unpublished variants without partial orders", async () => {
      await asUser(customer);
      const count = (await db.query("select * from orders")).rows.length;
      await expect(checkout(9)).rejects.toThrow("insufficient stock");
      expect((await db.query("select * from orders")).rows).toHaveLength(count);
      await privileged(`update products set status='draft' where id='${pid}'`);
      await asUser(customer);
      await expect(checkout()).rejects.toThrow("unavailable");
      await privileged(
        `update products set status='published' where id='${pid}'`,
      );
    });
    it("serializes competing purchases of the last unit", async () => {
      await asUser(owner);
      await db.query("select adjust_inventory($1,1,'set','Last-unit test')", [
        vid,
      ]);
      await asUser(customer);
      const results = await Promise.allSettled([checkout(), checkout()]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
      expect(
        (
          await db.query<{ on_hand: number }>(
            "select on_hand from inventory where variant_id=$1",
            [vid],
          )
        ).rows[0].on_hand,
      ).toBe(0);
    });
    it("restores cancelled inventory once and rejects illegal transitions", async () => {
      await asUser(owner);
      const { rows } = await db.query<{ id: string }>(
        "select id from orders order by created_at desc limit 1",
      );
      const id = rows[0].id;
      await expect(
        db.query(
          "select transition_order($1,'delivered','','','Bad transition')",
          [id],
        ),
      ).rejects.toThrow("Invalid order transition");
      await db.query(
        "select transition_order($1,'cancelled','','','Customer cancellation')",
        [id],
      );
      await expect(
        db.query(
          "select transition_order($1,'cancelled','','','Repeated cancellation')",
          [id],
        ),
      ).rejects.toThrow();
      expect(
        (
          await db.query<{ on_hand: number }>(
            "select on_hand from inventory where variant_id=$1",
            [vid],
          )
        ).rows[0].on_hand,
      ).toBe(1);
    });
    it("validates coupons, does not redeem quotes, and limits redemptions", async () => {
      await privileged(
        "insert into coupons(code,kind,value,minimum,usage_limit) values('WELCOME','percentage',10,10000,1)",
      );
      await asUser(owner);
      await db.query("select adjust_inventory($1,10,'set','Coupon testing')", [
        vid,
      ]);
      await asUser(customer);
      const quote = await checkout(1, crypto.randomUUID(), "WELCOME", true);
      expect(quote.discount).toBe(30000);
      expect(
        (await db.query("select * from coupon_redemptions")).rows,
      ).toHaveLength(0);
      const order = await checkout(1, crypto.randomUUID(), "WELCOME");
      expect(order.total).toBe(295000);
      await expect(checkout(1, crypto.randomUUID(), "WELCOME")).rejects.toThrow(
        "usage limit",
      );
    });
    it("enforces staff scopes and maintains account-scoped order timelines", async () => {
      await asUser(catalog);
      expect((await db.query("select * from orders")).rows).toHaveLength(0);
      await expect(
        db.query("select set_staff($1,'owner',true)", [catalog]),
      ).rejects.toThrow("Owner permission");
      await asUser(orderManager);
      expect(
        (await db.query("select * from orders")).rows.length,
      ).toBeGreaterThan(0);
      await expect(
        db.query("select adjust_inventory($1,100,'set','Wrong scope')", [vid]),
      ).rejects.toThrow("Forbidden");
    });
    it("saves carts and wishlists atomically and rejects another customer access", async () => {
      await asUser(customer);
      await db.query("select save_shopping($1::jsonb,$2::jsonb)", [
        JSON.stringify([{ variant_id: vid, quantity: 2 }]),
        JSON.stringify([pid]),
      ]);
      expect((await db.query("select * from cart_items")).rows).toHaveLength(1);
      await expect(
        db.query("select save_shopping($1::jsonb,$2::jsonb)", [
          JSON.stringify([{ variant_id: vid, quantity: -1 }]),
          "[]",
        ]),
      ).rejects.toThrow();
      expect((await db.query("select * from cart_items")).rows).toHaveLength(1);
      await asUser(other);
      expect((await db.query("select * from cart_items")).rows).toHaveLength(0);
      expect(
        (await db.query("select * from wishlist_items")).rows,
      ).toHaveLength(0);
    });
    it("persists content edits and rejects customer CMS changes", async () => {
      await asUser(owner);
      await db.exec(
        "insert into pages(slug,title,content) values('about-us','Our story','Persisted story')",
      );
      await asUser(null, "anon");
      expect(
        (
          await db.query<{ content: string }>(
            "select content from pages where slug='about-us'",
          )
        ).rows[0].content,
      ).toBe("Persisted story");
      await asUser(customer);
      const r = await db.query(
        "update pages set content='Hacked' where slug='about-us' returning id",
      );
      expect(r.rows).toHaveLength(0);
    });
    it("validates COD collection, returns, refunds and timeline entries", async () => {
      await asUser(customer);
      const o = await checkout();
      await asUser(orderManager);
      await expect(
        db.query(
          "select record_cod_payment($1,'paid','Attempt before delivery')",
          [o.id],
        ),
      ).rejects.toThrow("Invalid payment");
      for (const status of [
        "confirmed",
        "processing",
        "packed",
        "shipped",
        "out_for_delivery",
        "delivered",
      ])
        await db.query(
          "select transition_order($1,$2,'TRACK-123','Manual courier','Fulfillment test')",
          [o.id, status],
        );
      await db.query(
        "select record_cod_payment($1,'paid','Courier collection confirmed')",
        [o.id],
      );
      await db.query(
        "select transition_order($1,'returned','','','Returned parcel inspected')",
        [o.id],
      );
      await db.query(
        "select record_cod_payment($1,'refunded','Refund transfer confirmed')",
        [o.id],
      );
      const result = await db.query<{ payment_status: string }>(
        "select payment_status from orders where id=$1",
        [o.id],
      );
      expect(result.rows[0].payment_status).toBe("refunded");
      expect(
        (await db.query("select * from order_timeline($1)", [o.id])).rows
          .length,
      ).toBeGreaterThan(3);
      await asUser(other);
      expect(
        (await db.query("select * from order_timeline($1)", [o.id])).rows,
      ).toHaveLength(0);
    });
    it("duplicates products safely with zero copied stock and bulk updates are role checked", async () => {
      await asUser(catalog);
      const { rows } = await db.query<{ id: string }>(
        "select duplicate_product($1) id",
        [pid],
      );
      const copy = rows[0].id;
      const p = await db.query<{ status: string }>(
        "select status from products where id=$1",
        [copy],
      );
      expect(p.rows[0].status).toBe("draft");
      const stock = await db.query<{ on_hand: number }>(
        "select i.on_hand from inventory i join product_variants v on v.id=i.variant_id where v.product_id=$1",
        [copy],
      );
      expect(stock.rows[0].on_hand).toBe(0);
      await db.query("select bulk_product_status($1::uuid[],'archived')", [
        [copy],
      ]);
      await asUser(customer);
      await expect(
        db.query("select bulk_product_status($1::uuid[],'published')", [
          [copy],
        ]),
      ).rejects.toThrow("Forbidden");
    });
    it("allows public product-image reads but denies customer uploads and private bucket writes", async () => {
      await asUser(catalog);
      await db.exec(
        "insert into storage.objects(bucket_id,name) values('product-images','10000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001.webp')",
      );
      await expect(
        db.exec(
          "insert into storage.objects(bucket_id,name) values('private','secret.webp')",
        ),
      ).rejects.toThrow();
      await asUser(customer);
      await expect(
        db.exec(
          "insert into storage.objects(bucket_id,name) values('product-images','customer.webp')",
        ),
      ).rejects.toThrow();
      await asUser(null, "anon");
      expect(
        (await db.query("select * from storage.objects")).rows,
      ).toHaveLength(1);
    });
    it.each(["confirmed", "processing"])(
      "cancels a %s order and restores stock exactly once",
      async (stage) => {
        await asUser(catalog);
        await db.query(
          "select adjust_inventory($1,10,'set','Cancellation stage test')",
          [vid],
        );
        await asUser(customer);
        const order = await checkout();
        await asUser(orderManager);
        await db.query(
          "select transition_order($1,'confirmed','','','Confirmed customer order')",
          [order.id],
        );
        if (stage === "processing")
          await db.query(
            "select transition_order($1,'processing','','','Processing customer order')",
            [order.id],
          );
        await db.query(
          "select transition_order($1,'cancelled','','','Confirmed cancellation')",
          [order.id],
        );
        await expect(
          db.query(
            "select transition_order($1,'cancelled','','','Repeated cancellation')",
            [order.id],
          ),
        ).rejects.toThrow();
        await asUser(catalog);
        expect(
          (
            await db.query<{ on_hand: number }>(
              "select on_hand from inventory where variant_id=$1",
              [vid],
            )
          ).rows[0].on_hand,
        ).toBe(10);
      },
    );
    it("adds and subtracts ledgered stock while preserving reserved quantities", async () => {
      await asUser(catalog);
      const initial = (
        await db.query<{ on_hand: number }>(
          "select on_hand from inventory where variant_id=$1",
          [vid],
        )
      ).rows[0].on_hand;
      await db.query(
        "select adjust_inventory($1,3,'add','Received audit shipment')",
        [vid],
      );
      await db.query(
        "select adjust_inventory($1,2,'subtract','Inspected damaged stock')",
        [vid],
      );
      expect(
        (
          await db.query<{ on_hand: number }>(
            "select on_hand from inventory where variant_id=$1",
            [vid],
          )
        ).rows[0].on_hand,
      ).toBe(initial + 1);
      await privileged(
        `update inventory set reserved=1 where variant_id='${vid}'`,
      );
      await asUser(catalog);
      await expect(
        db.query(
          "select adjust_inventory($1,0,'set','Invalid reserved stock')",
          [vid],
        ),
      ).rejects.toThrow();
      expect(
        (
          await db.query<{ on_hand: number }>(
            "select on_hand from inventory where variant_id=$1",
            [vid],
          )
        ).rows[0].on_hand,
      ).toBe(initial + 1);
      await privileged(
        `update inventory set reserved=0 where variant_id='${vid}'`,
      );
    });
    it("inactive users cannot use owner-only functions", async () => {
      await privileged(`update profiles set active=false where id='${other}'`);
      await asUser(other);
      await expect(
        db.query("select set_staff($1,'owner',true)", [other]),
      ).rejects.toThrow("Owner permission");
      await expect(checkout()).rejects.toThrow("Authentication required");
    });
    it("creates, updates, publishes, archives and deletes an unused product with variants", async () => {
      const product = crypto.randomUUID(),
        variant = crypto.randomUUID();
      await asUser(catalog);
      await db.query(
        "insert into products(id,name,slug,sku,price) values($1,'CRUD piece',$2,$3,100000)",
        [product, "crud-" + product, "CRUD-" + product],
      );
      await db.query(
        "insert into product_variants(id,product_id,sku,size,color) values($1,$2,$3,'M','Ivory')",
        [variant, product, "V-" + variant],
      );
      // Stock is initialized by the first reasoned adjustment, not variant creation.
      expect(
        (
          await db.query("select * from inventory where variant_id=$1", [
            variant,
          ])
        ).rows,
      ).toHaveLength(0);
      await db.query(
        "update products set name='Updated CRUD piece',price=200000,sale_price=150000,status='published' where id=$1",
        [product],
      );
      await db.query(
        "update product_variants set price=175000,active=false where id=$1",
        [variant],
      );
      await asUser(null, "anon");
      expect(
        (await db.query("select name from products where id=$1", [product]))
          .rows[0],
      ).toEqual({ name: "Updated CRUD piece" });
      expect(
        (
          await db.query("select * from product_variants where id=$1", [
            variant,
          ])
        ).rows,
      ).toHaveLength(0);
      await asUser(catalog);
      expect(
        (
          await db.query("delete from products where id=$1 returning id", [
            product,
          ])
        ).rows,
      ).toHaveLength(0);
      await db.query("update products set status='archived' where id=$1", [
        product,
      ]);
      expect(
        (
          await db.query("delete from products where id=$1 returning id", [
            product,
          ])
        ).rows,
      ).toHaveLength(1);
      expect(
        (
          await db.query("select * from inventory where variant_id=$1", [
            variant,
          ])
        ).rows,
      ).toHaveLength(0);
    });
    it("rejects duplicate SKUs and invalid sale prices without corrupting the catalog", async () => {
      await asUser(catalog);
      await expect(
        db.query(
          "insert into products(name,slug,sku,price) values('Duplicate','duplicate-crud','MM-ROBE',100)",
        ),
      ).rejects.toThrow();
      await expect(
        db.query("update products set sale_price=price+1 where id=$1", [pid]),
      ).rejects.toThrow();
      await expect(
        db.query(
          "insert into product_variants(product_id,sku,size,color) values($1,'DUP-V','M','Ivory')",
          [pid],
        ),
      ).rejects.toThrow();
    });
    it("persists every content section and keeps drafts and future banners private", async () => {
      await asUser(owner);
      await db.exec(
        "insert into banners(title,subtitle,link,starts_at) values('Live audit banner','Edited subtitle','/collections/all',now()-interval '1 day'),('Future audit banner','','/collections/all',now()+interval '1 day'); insert into pages(slug,title,content,published) values('audit-draft','Draft policy','Unpublished text',false); insert into promotions(name,description,active) values('Audit promotion','Administrative promotion',true); update store_settings set name='Audit store',announcement='Edited announcement',contact_email='support@example.com',contact_phone='03001234567',navigation='[{\"label\":\"Shop\",\"href\":\"/collections/all\"}]',footer_links='[{\"label\":\"Story\",\"href\":\"/pages/about-us\"}]',homepage_sections='[\"story\",\"categories\",\"featured\"]' where id='store';",
      );
      await asUser(null, "anon");
      expect(
        (
          await db.query(
            "select title from banners where title like '%audit banner'",
          )
        ).rows,
      ).toEqual([{ title: "Live audit banner" }]);
      expect(
        (await db.query("select * from pages where slug='audit-draft'")).rows,
      ).toHaveLength(0);
      expect(
        (await db.query<{ name: string }>("select name from store_settings"))
          .rows[0].name,
      ).toBe("Audit store");
      await asUser(customer);
      expect(
        (
          await db.query(
            "update banners set subtitle='Unauthorized' returning id",
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await db.query(
            "update store_settings set announcement='Unauthorized' returning id",
          )
        ).rows,
      ).toHaveLength(0);
    });
    it("calculates fixed and quantity coupons and fails closed for shipping and COD limits", async () => {
      await asUser(catalog);
      await db.query(
        "select adjust_inventory($1,20,'set','Audit coupon stock')",
        [vid],
      );
      await asUser(owner);
      await db.exec(
        "insert into coupons(code,kind,value,min_quantity,starts_at) values('AUDIT-FIXED','fixed',10000,1,now()-interval '1 day'),('AUDIT-BUNDLE','quantity',20,2,now()-interval '1 day'); update store_settings set shipping_zones='[{\"city\":\"Lahore\",\"fee\":35000}]',free_shipping_threshold=999999999 where id='store';",
      );
      await asUser(customer);
      const fixed = await checkout(1, crypto.randomUUID(), "AUDIT-FIXED", true);
      expect(fixed.discount).toBe(10000);
      expect(fixed.shipping).toBe(35000);
      await expect(
        checkout(1, crypto.randomUUID(), "AUDIT-BUNDLE", true),
      ).rejects.toThrow();
      const bundle = await checkout(
        2,
        crypto.randomUUID(),
        "AUDIT-BUNDLE",
        true,
      );
      expect(bundle.discount).toBe(Number(bundle.subtotal) * 0.2);
      await asUser(owner);
      await db.exec(
        'update store_settings set shipping_zones=\'[{"city":"Karachi","fee":35000}]\' where id=\'store\'',
      );
      await asUser(customer);
      await expect(
        checkout(1, crypto.randomUUID(), "", true),
      ).rejects.toThrow();
      await asUser(owner);
      await db.exec(
        "update store_settings set shipping_zones='[]',cod_enabled=false where id='store'",
      );
      await asUser(customer);
      await expect(checkout()).rejects.toThrow();
      await asUser(owner);
      await db.exec(
        "update store_settings set cod_enabled=true,max_cod_total=1 where id='store'",
      );
      await asUser(customer);
      await expect(checkout()).rejects.toThrow();
      await asUser(owner);
      await db.exec(
        "update store_settings set max_cod_total=5000000 where id='store'",
      );
    });
    it.each([
      "expired",
      "future",
      "disabled",
      "customer",
      "product",
      "category",
      "minimum",
    ])(
      "rejects a %s coupon without order or redemption writes",
      async (restriction) => {
        const code = "AUDIT-" + restriction.toUpperCase(),
          user = crypto.randomUUID();
        await privileged(`insert into auth.users(id) values('${user}')`);
        await asUser(owner);
        const excludedProduct = crypto.randomUUID();
        if (restriction === "product")
          await db.query(
            "insert into products(id,name,slug,sku,price) values($1,'Excluded coupon target',$2,$2,100000)",
            [excludedProduct, "excluded-" + excludedProduct],
          );
        await db.query(
          "insert into coupons(code,kind,value,starts_at,ends_at,active,customer_ids,product_ids,category_ids,minimum) values($1,'percentage',10,$2,$3,$4,$5::uuid[],$6::uuid[],$7::uuid[],$8)",
          [
            code,
            restriction === "future"
              ? "2099-01-01T00:00:00Z"
              : "2020-01-01T00:00:00Z",
            restriction === "expired" ? "2021-01-01T00:00:00Z" : null,
            restriction !== "disabled",
            restriction === "customer" ? [owner] : [],
            restriction === "product" ? [excludedProduct] : [],
            restriction === "category" ? [crypto.randomUUID()] : [],
            restriction === "minimum" ? 999999999 : 0,
          ],
        );
        await asUser(user);
        await expect(checkout(1, crypto.randomUUID(), code)).rejects.toThrow(
          /Coupon/,
        );
        expect((await db.query("select * from orders")).rows).toHaveLength(0);
        expect(
          (await db.query("select * from coupon_redemptions")).rows,
        ).toHaveLength(0);
      },
    );
    it("enforces a per-customer coupon limit independently of its global limit", async () => {
      const user = crypto.randomUUID();
      await privileged(`insert into auth.users(id) values('${user}')`);
      await asUser(owner);
      await db.exec(
        "insert into coupons(code,kind,value,usage_limit,per_customer_limit,starts_at) values('AUDIT-PER-USER','percentage',10,null,1,'2020-01-01T00:00:00Z')",
      );
      await asUser(user);
      await checkout(1, crypto.randomUUID(), "AUDIT-PER-USER");
      await expect(
        checkout(1, crypto.randomUUID(), "AUDIT-PER-USER"),
      ).rejects.toThrow("Coupon usage limit reached");
      expect(
        (await db.query("select * from coupon_redemptions")).rows,
      ).toHaveLength(1);
    });
    it("reconciles late COD collection after return without restoring stock twice", async () => {
      await asUser(customer);
      const o = await checkout();
      await asUser(orderManager);
      for (const status of [
        "confirmed",
        "processing",
        "packed",
        "shipped",
        "out_for_delivery",
        "delivered",
        "returned",
      ])
        await db.query(
          "select transition_order($1,$2,'AUDIT-TRACK','Audit courier','Inspected fulfillment')",
          [o.id, status],
        );
      await db.query(
        "select record_cod_payment($1,'paid','Late courier remittance confirmed')",
        [o.id],
      );
      await db.query(
        "select record_cod_payment($1,'refunded','Confirmed customer refund')",
        [o.id],
      );
      const stock = (
        await db.query<{ on_hand: number }>(
          "select on_hand from inventory where variant_id=$1",
          [vid],
        )
      ).rows[0].on_hand;
      await expect(
        db.query(
          "select transition_order($1,'returned','','','Repeated return')",
          [o.id],
        ),
      ).rejects.toThrow();
      expect(
        (
          await db.query<{ on_hand: number }>(
            "select on_hand from inventory where variant_id=$1",
            [vid],
          )
        ).rows[0].on_hand,
      ).toBe(stock);
      expect(
        (
          await db.query<{ status: string }>(
            "select status from payments where order_id=$1",
            [o.id],
          )
        ).rows[0].status,
      ).toBe("refunded");
    });
  },
);
