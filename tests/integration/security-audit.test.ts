import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
const alice = "00000000-0000-4000-8000-000000000011",
  bob = "00000000-0000-4000-8000-000000000012",
  owner = "00000000-0000-4000-8000-000000000013",
  catalog = "00000000-0000-4000-8000-000000000014",
  orders = "00000000-0000-4000-8000-000000000015",
  manager = "00000000-0000-4000-8000-000000000016";
const pid = "10000000-0000-4000-8000-000000000011",
  draft = "10000000-0000-4000-8000-000000000012",
  vid = "20000000-0000-4000-8000-000000000011";
const address = {
  full_name: "Audit Customer",
  phone: "03001234567",
  line1: "12 Audit Street",
  city: "Lahore",
  postal_code: "",
};
const migrationCustomer = "00000000-0000-4000-8000-000000000017";
async function setup(hardened: boolean) {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets,name text);alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;grant select on storage.objects to anon;grant select,insert,update,delete on storage.objects to authenticated;`,
  );
  // Emulate Supabase's permissive default grants on future objects, not only vanilla PostgreSQL defaults.
  await db.exec(
    "alter default privileges in schema public grant all on tables to anon,authenticated;alter default privileges in schema public grant execute on functions to anon,authenticated;",
  );
  for (const name of readdirSync("supabase/migrations").sort()) {
    if (!hardened && name > "202610120006_catalog_pricing.sql") continue;
    await db.exec(
      readFileSync("supabase/migrations/" + name, "utf8").replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
    if (name === "202610120009_content_image_uploads.sql") {
      await db.query("insert into auth.users(id) values($1)", [
        migrationCustomer,
      ]);
      await db.query("delete from carts where user_id=$1", [migrationCustomer]);
      await db.query("delete from wishlists where user_id=$1", [
        migrationCustomer,
      ]);
    }
    if (name === "202610120006_catalog_pricing.sql")
      await db.query(
        "insert into public.coupons(code,kind,value,customer_ids) values('LEGACY-NULL','percentage',10,$1::uuid[])",
        [[bob, null]],
      );
  }
  await db.exec(
    `insert into auth.users(id) values('${alice}'),('${bob}'),('${owner}'),('${catalog}'),('${orders}');update public.profiles set role='owner' where id='${owner}';update public.profiles set role='catalog_manager' where id='${catalog}';update public.profiles set role='order_manager' where id='${orders}';insert into public.products(id,name,slug,sku,price,status) values('${pid}','Published','audit-published','AUDIT-P',100000,'published'),('${draft}','Private draft','audit-draft','AUDIT-D',100000,'draft');insert into public.product_variants(id,product_id,sku) values('${vid}','${pid}','AUDIT-V');insert into public.inventory(variant_id,on_hand) values('${vid}',50);insert into public.addresses(user_id,full_name,phone,line1,city) values('${alice}','Alice','03001234567','12 Audit Street','Lahore');insert into public.reviews(product_id,user_id,rating,content,approved) values('${draft}','${alice}',5,'Draft review secret',true);`,
  );
  await db.query("insert into auth.users(id) values($1)", [manager]);
  await db.query("update public.profiles set role='manager' where id=$1", [
    manager,
  ]);
  return db;
}
async function asUser(db: PGlite, id: string | null, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id ?? "",
  ]);
  await db.exec("set role " + role);
}
async function order(
  db: PGlite,
  notes = "",
  coupon = "",
  key = crypto.randomUUID(),
) {
  const result = await db.query<{ result: Record<string, unknown> }>(
    "select public.checkout($1::jsonb,$2::jsonb,$3,$4,$5::uuid,false) result",
    [
      JSON.stringify([{ variant_id: vid, quantity: 1 }]),
      JSON.stringify(address),
      coupon,
      notes,
      key,
    ],
  );
  return result.rows[0].result;
}
let legacy: PGlite, secure: PGlite;
beforeAll(async () => {
  legacy = await setup(false);
  secure = await setup(true);
});
afterAll(async () => {
  await legacy?.close();
  await secure?.close();
});
describe.sequential(
  "Legacy evidence and additive migration protections",
  () => {
    it("backfills missing containers and safely repairs only the active caller without clearing items", async () => {
      await asUser(secure, migrationCustomer);
      expect((await secure.query("select * from carts")).rows).toHaveLength(1);
      expect((await secure.query("select * from wishlists")).rows).toHaveLength(
        1,
      );
      await secure.query("select save_shopping($1::jsonb,'[]'::jsonb)", [
        JSON.stringify([{ variant_id: vid, quantity: 2 }]),
      ]);
      await secure.exec("reset role");
      await secure.query("delete from wishlists where user_id=$1", [
        migrationCustomer,
      ]);
      await asUser(secure, migrationCustomer);
      await secure.query("select ensure_shopping_containers()");
      await secure.query("select ensure_shopping_containers()");
      expect(
        (
          await secure.query<{ quantity: number }>(
            "select quantity from cart_items",
          )
        ).rows[0].quantity,
      ).toBe(2);
      expect((await secure.query("select * from carts")).rows).toHaveLength(1);
      expect((await secure.query("select * from wishlists")).rows).toHaveLength(
        1,
      );
      await secure.exec("reset role");
      await secure.query("update profiles set active=false where id=$1", [
        migrationCustomer,
      ]);
      await asUser(secure, migrationCustomer);
      await expect(
        secure.query("select ensure_shopping_containers()"),
      ).rejects.toThrow("Authentication required");
      await asUser(secure, null, "anon");
      await expect(
        secure.query("select ensure_shopping_containers()"),
      ).rejects.toThrow();
    });
    it("scopes category/banner/logo uploads and protects referenced content images", async () => {
      const categoryPath = `categories/${crypto.randomUUID()}.png`,
        bannerPath = `banners/${crypto.randomUUID()}.webp`;
      await asUser(secure, catalog);
      await secure.query(
        "insert into storage.objects(bucket_id,name) values('product-images',$1)",
        [categoryPath],
      );
      await expect(
        secure.query(
          "insert into storage.objects(bucket_id,name) values('product-images',$1)",
          [bannerPath],
        ),
      ).rejects.toThrow();
      await asUser(secure, owner);
      await secure.query(
        "insert into storage.objects(bucket_id,name) values('product-images',$1)",
        [bannerPath],
      );
      await secure.query(
        "insert into storage.objects(bucket_id,name) values('product-images',$1)",
        [`branding/${crypto.randomUUID()}.jpg`],
      );
      await asUser(secure, catalog);
      expect(
        (
          await secure.query(
            "delete from storage.objects where name=$1 returning id",
            [bannerPath],
          )
        ).rows,
      ).toHaveLength(0);
      await asUser(secure, owner);
      await secure.query(
        "insert into banners(title,image_url) values('Referenced banner',$1)",
        [
          "https://test.supabase.co/storage/v1/object/public/product-images/" +
            bannerPath,
        ],
      );
      expect(
        (
          await secure.query(
            "delete from storage.objects where name=$1 returning id",
            [bannerPath],
          )
        ).rows,
      ).toHaveLength(0);
      await asUser(secure, alice);
      await expect(
        secure.query(
          "insert into storage.objects(bucket_id,name) values('product-images',$1)",
          [`categories/${crypto.randomUUID()}.png`],
        ),
      ).rejects.toThrow();
      await asUser(secure, orders);
      await expect(
        secure.query(
          "insert into storage.objects(bucket_id,name) values('product-images',$1)",
          [`branding/${crypto.randomUUID()}.jpg`],
        ),
      ).rejects.toThrow();
      await asUser(secure, null, "anon");
      await expect(
        secure.query(
          "insert into storage.objects(bucket_id,name) values('product-images',$1)",
          [`banners/${crypto.randomUUID()}.png`],
        ),
      ).rejects.toThrow();
    });
    it("rejects malformed public settings, ambiguous shipping zones, unsafe navigation and category cycles", async () => {
      await asUser(secure, owner);
      for (const zones of [
        { city: "Lahore", fee: 0 },
        [{ city: "Lahore", fee: -1 }],
        [
          { city: "Lahore", fee: 100 },
          { city: "lahore", fee: 200 },
        ],
      ])
        await expect(
          secure.query(
            "update public.store_settings set shipping_zones=$1::jsonb",
            [JSON.stringify(zones)],
          ),
        ).rejects.toThrow();
      await expect(
        secure.query("update public.store_settings set navigation=$1::jsonb", [
          JSON.stringify([{ label: "Bad link", href: "javascript:alert(1)" }]),
        ]),
      ).rejects.toThrow();
      const parent = crypto.randomUUID(),
        child = crypto.randomUUID();
      await secure.query(
        "insert into public.categories(id,name,slug) values($1,'Parent','audit-parent')",
        [parent],
      );
      await secure.query(
        "insert into public.categories(id,name,slug,parent_id) values($1,'Child','audit-child',$2)",
        [child, parent],
      );
      await expect(
        secure.query("update public.categories set parent_id=$1 where id=$2", [
          child,
          parent,
        ]),
      ).rejects.toThrow("cycle");
    });
    it("commits rejected contact counters and ignores spoofed visitor headers", async () => {
      await asUser(secure, null, "anon");
      for (let i = 0; i < 6; i++) {
        await secure.query("select set_config('request.headers',$1,false)", [
          JSON.stringify({ "x-real-ip": "spoof-" + i }),
        ]);
        await secure.query("select public.submit_inquiry('a','bad','tiny')");
      }
      await secure.exec("reset role");
      expect(
        (
          await secure.query<{ hits: number }>(
            "select hits from public.rate_limits where key='contact:anonymous'",
          )
        ).rows[0].hits,
      ).toBe(6);
      expect(
        (await secure.query("select * from public.contact_inquiries")).rows,
      ).toHaveLength(0);
    });
    it("accepts valid anonymous inquiries but protects their contents", async () => {
      await secure.exec("reset role");
      await secure.exec(
        "delete from public.rate_limits where key='contact:anonymous'",
      );
      await asUser(secure, null, "anon");
      const r = await secure.query<{ result: { ok: boolean } }>(
        "select public.submit_inquiry('Audit Visitor','audit@example.com','A valid inquiry sent for testing.') result",
      );
      expect(r.rows[0].result.ok).toBe(true);
      await expect(
        secure.query("select * from public.contact_inquiries"),
      ).rejects.toThrow();
      await asUser(secure, alice);
      expect(
        (await secure.query("select * from public.contact_inquiries")).rows,
      ).toHaveLength(0);
      await asUser(secure, orders);
      expect(
        (await secure.query("select * from public.contact_inquiries")).rows,
      ).toHaveLength(1);
    });
    it("reproduces legacy draft-review disclosure and closes it", async () => {
      await asUser(legacy, null, "anon");
      expect(
        (
          await legacy.query(
            "select * from public.reviews where content='Draft review secret'",
          )
        ).rows,
      ).toHaveLength(1);
      await asUser(secure, null, "anon");
      expect(
        (await secure.query("select id,content from public.reviews")).rows,
      ).toHaveLength(0);
    });
    it("reproduces inactive-user private reads and closes them across ownership tables", async () => {
      for (const db of [legacy, secure]) {
        await asUser(db, alice);
        await order(db);
        await db.exec("reset role");
        await db.query("update public.profiles set active=false where id=$1", [
          alice,
        ]);
        await asUser(db, alice);
      }
      expect(
        (await legacy.query("select * from public.orders")).rows,
      ).toHaveLength(1);
      expect(
        (await legacy.query("select * from public.addresses")).rows,
      ).toHaveLength(0);
      for (const table of [
        "profiles",
        "addresses",
        "carts",
        "cart_items",
        "wishlists",
        "wishlist_items",
        "orders",
        "order_items",
        "payments",
        "coupon_redemptions",
      ])
        expect(
          (await secure.query("select * from public." + table)).rows,
        ).toHaveLength(0);
      for (const db of [legacy, secure]) {
        await db.exec("reset role");
        await db.query("update public.profiles set active=true where id=$1", [
          alice,
        ]);
      }
    });
    it("reproduces temporary-table role shadowing and hardens definer search paths", async () => {
      for (const db of [legacy, secure]) {
        await asUser(db, bob);
        await db.exec(
          `create temporary table profiles(id uuid,role text,active boolean);insert into pg_temp.profiles values('${bob}','owner',true);`,
        );
      }
      expect(
        (
          await legacy.query<{ allowed: boolean }>(
            "select public.can_manage('catalog') allowed",
          )
        ).rows[0].allowed,
      ).toBe(true);
      expect(
        (
          await secure.query<{ allowed: boolean }>(
            "select public.can_manage('catalog') allowed",
          )
        ).rows[0].allowed,
      ).toBe(false);
      for (const db of [legacy, secure])
        await db.exec("drop table pg_temp.profiles");
    });
    it("reproduces rolled-back coupon counters and persists rejected attempts", async () => {
      await asUser(legacy, bob);
      await expect(order(legacy, "", "BAD")).rejects.toThrow();
      await legacy.exec("reset role");
      expect(
        (
          await legacy.query("select * from public.rate_limits where key=$1", [
            "checkout:" + bob,
          ])
        ).rows,
      ).toHaveLength(0);
      await asUser(secure, bob);
      for (let i = 0; i < 21; i++) await order(secure, "", "BAD");
      await secure.exec("reset role");
      const counters = await secure.query<{ hits: number }>(
        "select hits from public.rate_limits where key=$1",
        ["checkout:" + bob],
      );
      expect(counters.rows[0].hits).toBe(21);
      await asUser(secure, bob);
      expect((await order(secure, "", "BAD")).error).toBe(
        "Please try again later",
      );
      await secure.exec("reset role");
      await secure.exec("delete from public.rate_limits");
    });
    it("keeps anonymous callers out of every private table and internal RPC", async () => {
      await asUser(secure, null, "anon");
      for (const table of [
        "profiles",
        "addresses",
        "carts",
        "cart_items",
        "wishlists",
        "wishlist_items",
        "orders",
        "order_items",
        "payments",
        "coupons",
        "coupon_redemptions",
        "promotions",
        "inventory_movements",
        "admin_audit_logs",
        "contact_inquiries",
        "rate_limits",
      ])
        await expect(
          secure.query("select * from public." + table),
        ).rejects.toThrow();
      for (const sql of [
        "select public.request_gate('auth')",
        "select public.consume_rate_limit('fake',100,600)",
        "select public.checkout_internal('[]','{}','','',gen_random_uuid(),false)",
        "select public.adjust_inventory($1,10,'set','Forbidden')",
      ]) {
        await expect(
          secure.query(sql, sql.includes("$1") ? [vid] : []),
        ).rejects.toThrow();
      }
    });
    it("enforces customer isolation, direct mutation revocations and staff scopes", async () => {
      await asUser(secure, bob);
      expect(
        (await secure.query("select * from public.orders")).rows,
      ).toHaveLength(0);
      await expect(
        secure.exec("update public.profiles set role='owner'"),
      ).rejects.toThrow();
      await expect(
        secure.exec("delete from public.cart_items"),
      ).rejects.toThrow();
      await expect(
        secure.query(
          "select public.adjust_inventory($1,100,'set','Forbidden')",
          [vid],
        ),
      ).rejects.toThrow();
      await asUser(secure, catalog);
      await expect(
        secure.query(
          "select public.record_cod_payment((select id from public.orders limit 1),'paid','Forbidden')",
        ),
      ).rejects.toThrow();
      await asUser(secure, orders);
      await expect(
        secure.query(
          "select public.adjust_inventory($1,100,'set','Wrong scope')",
          [vid],
        ),
      ).rejects.toThrow();
      await asUser(secure, owner);
      expect(
        (await secure.query("select * from public.orders")).rows.length,
      ).toBeGreaterThan(0);
    });
    it("rejects malformed direct checkout JSON and idempotency ambiguity", async () => {
      await asUser(secure, alice);
      const bad = await secure.query<{ result: { error: string } }>(
        "select public.checkout($1::jsonb,$2::jsonb,'','',gen_random_uuid(),false) result",
        [
          JSON.stringify([{ variant_id: vid, quantity: 1.5 }]),
          JSON.stringify(address),
        ],
      );
      expect(bad.rows[0].result.error).toBeTruthy();
      const key = crypto.randomUUID();
      const placed = await order(secure, "abcd", "", key);
      const replay = await order(secure, "abcd", "", key);
      expect(replay.id).toBe(placed.id);
      expect((await order(secure, "different", "", key)).error).toBe(
        "Checkout key already used",
      );
    });
    it("does not leak internal order reasons in the customer timeline", async () => {
      await asUser(secure, owner);
      const { rows } = await secure.query<{ id: string }>(
        "select id from public.orders where user_id=$1 and status='pending' limit 1",
        [alice],
      );
      await secure.query(
        "select public.transition_order($1,'confirmed','','','Internal fraud-screening note')",
        [rows[0].id],
      );
      await asUser(secure, alice);
      expect(
        JSON.stringify(
          (
            await secure.query("select * from public.order_timeline($1)", [
              rows[0].id,
            ])
          ).rows,
        ),
      ).not.toContain("fraud-screening");
      await asUser(secure, orders);
      expect(
        JSON.stringify(
          (
            await secure.query("select * from public.order_timeline($1)", [
              rows[0].id,
            ])
          ).rows,
        ),
      ).toContain("fraud-screening");
    });
    it("prevents duplicate payment records and preserves financial identity", async () => {
      await secure.exec("reset role");
      const { rows } = await secure.query<{ id: string }>(
        "select id from public.orders limit 1",
      );
      await expect(
        secure.query(
          "insert into public.payments(order_id,amount) values($1,1)",
          [rows[0].id],
        ),
      ).rejects.toThrow();
      await expect(
        secure.query("update public.payments set amount=1 where order_id=$1", [
          rows[0].id,
        ]),
      ).rejects.toThrow("immutable");
    });
    it("records role transitions and keeps managers out of owner-only promotions", async () => {
      await asUser(secure, owner);
      await secure.query("select public.set_staff($1,'catalog_manager',true)", [
        catalog,
      ]);
      expect(
        (
          await secure.query(
            "select * from public.admin_audit_logs where action='ROLE_CHANGE' and entity_id=$1",
            [catalog],
          )
        ).rows,
      ).toHaveLength(1);
      await expect(
        secure.query("select public.set_staff($1,'manager',true)", [owner]),
      ).rejects.toThrow("own role");
    });
    it("reproduces nullable customer-target eligibility bypass and fails closed for legacy rows", async () => {
      await asUser(legacy, alice);
      expect((await order(legacy, "", "LEGACY-NULL")).discount).toBe(10000);
      await asUser(secure, alice);
      expect((await order(secure, "", "LEGACY-NULL")).error).toBe(
        "Coupon is unavailable",
      );
    });
    it("permits manager operations but refuses owner-only role changes", async () => {
      await asUser(secure, manager);
      expect(
        (
          await secure.query<{ ok: boolean }>(
            "select public.can_manage('settings') ok",
          )
        ).rows[0].ok,
      ).toBe(true);
      expect(
        (await secure.query("select * from public.orders")).rows.length,
      ).toBeGreaterThan(0);
      await expect(
        secure.query("select public.set_staff($1,'owner',true)", [manager]),
      ).rejects.toThrow("Owner permission");
    });
    it("executes the read-only migration preflight successfully", async () => {
      await secure.exec("reset role");
      const reports = await secure.exec(
        readFileSync("scripts/security-preflight.sql", "utf8"),
      );
      expect(reports.length).toBeGreaterThan(5);
    });
    it("rejects null coupon targets and null staff mutation reasons", async () => {
      await asUser(secure, owner);
      await expect(
        secure.exec(
          "insert into public.coupons(code,kind,value,customer_ids) values('NULL-TARGET','percentage',10,array[null]::uuid[])",
        ),
      ).rejects.toThrow();
      await expect(
        secure.query("select public.adjust_inventory($1,1,'add',null)", [vid]),
      ).rejects.toThrow();
      const { rows } = await secure.query<{ id: string }>(
        "select id from public.orders limit 1",
      );
      await expect(
        secure.query(
          "select public.transition_order($1,'confirmed','','',null)",
          [rows[0].id],
        ),
      ).rejects.toThrow();
    });
    it("requires a real affected record and refuses published-product deletion/reparenting", async () => {
      await asUser(secure, catalog);
      expect(
        (
          await secure.query(
            "delete from public.products where id=$1 returning id",
            [pid],
          )
        ).rows,
      ).toHaveLength(0);
      await expect(
        secure.query(
          "update public.product_variants set product_id=$1 where id=$2",
          [draft, vid],
        ),
      ).rejects.toThrow("Variant product cannot be changed");
    });
    it("preserves audit history while allowing removal of users without orders", async () => {
      await asUser(secure, bob);
      await secure.exec("update public.profiles set full_name='Changed name'");
      await secure.exec("reset role");
      await secure.query("delete from auth.users where id=$1", [bob]);
      expect(
        (
          await secure.query(
            "select * from public.admin_audit_logs where entity_id=$1",
            [bob],
          )
        ).rows.length,
      ).toBeGreaterThan(0);
    });
    it("locks referenced product images and rejects unscoped product uploads", async () => {
      const name = pid + "/" + crypto.randomUUID() + ".webp";
      await asUser(secure, catalog);
      await secure.query(
        "insert into storage.objects(bucket_id,name) values('product-images',$1)",
        [name],
      );
      await secure.query(
        "insert into public.product_images(product_id,url,alt) values($1,$2,'Audit image')",
        [
          pid,
          "https://example.supabase.co/storage/v1/object/public/product-images/" +
            name,
        ],
      );
      expect(
        (
          await secure.query(
            "delete from storage.objects where name=$1 returning id",
            [name],
          )
        ).rows,
      ).toHaveLength(0);
      await expect(
        secure.query(
          "insert into storage.objects(bucket_id,name) values('product-images','unscoped.webp')",
        ),
      ).rejects.toThrow();
      await asUser(secure, alice);
      await expect(
        secure.query(
          "insert into storage.objects(bucket_id,name) values('product-images',$1)",
          [pid + "/" + crypto.randomUUID() + ".webp"],
        ),
      ).rejects.toThrow();
      await asUser(secure, null, "anon");
      expect(
        (
          await secure.query(
            "select * from storage.objects where name like $1",
            [pid + "/%"],
          )
        ).rows,
      ).toHaveLength(1);
    });
    it("has RLS on every application table and safe definer paths/private helper grants", async () => {
      await secure.exec("reset role");
      const tables = await secure.query<{
        relname: string;
        relrowsecurity: boolean;
      }>(
        "select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'",
      );
      expect(tables.rows.length).toBe(25);
      expect(tables.rows.every((t) => t.relrowsecurity)).toBe(true);
      const functions = await secure.query<{
        proname: string;
        proconfig: string[];
      }>(
        "select proname,proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and prosecdef",
      );
      expect(
        functions.rows.every((f) =>
          f.proconfig?.includes("search_path=public, pg_temp"),
        ),
      ).toBe(true);
    });
  },
);
