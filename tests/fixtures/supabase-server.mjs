// Test-only REST gateway backed by the actual migrated PostgreSQL guest RPCs.
import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
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
const pid = "10000000-0000-4000-8000-000000000001";
const variants = [
  ["S", "Ivory", 10],
  ["M", "Ivory", 0],
  ["L", "Ivory", 10],
  ["S", "Blue", 10],
  ["M", "Blue", 10],
  ["L", "Blue", 10],
].map(([size, color, stock], i) => ({
  id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  product_id: pid,
  sku: `TEST-${size}-${color}`,
  size,
  color,
  price: null,
  active: true,
  inventory: { on_hand: stock, reserved: 0 },
}));
await db.query(
  "insert into products(id,name,slug,sku,price,sale_price,status,has_sizes) values($1,'Fixture garment','fixture-garment','FIXTURE',500000,400000,'published',true)",
  [pid],
);
for (const v of variants) {
  await db.query(
    "insert into product_variants(id,product_id,sku,size,color) values($1,$2,$3,$4,$5)",
    [v.id, pid, v.sku, v.size, v.color],
  );
  await db.query("insert into inventory(variant_id,on_hand) values($1,$2)", [
    v.id,
    v.inventory.on_hand,
  ]);
}
const product = {
  id: pid,
  name: "Fixture garment",
  slug: "fixture-garment",
  sku: "FIXTURE",
  description: "A fixture garment for feature acceptance.",
  price: 500000,
  sale_price: 400000,
  status: "published",
  has_sizes: true,
  tags: [],
  featured: true,
  category_id: null,
  created_at: new Date().toISOString(),
  categories: null,
  product_variants: variants,
  product_images: ["front", "back", "top", "bottom"].map((view, i) => ({
    id: String(i),
    view,
    color: null,
    url: `/fixture-${view}.svg`,
    alt: `${view} garment`,
    position: i,
  })),
};
const settings = (await db.query("select * from store_settings")).rows[0];
product.product_images.push({
  id: "blue-front",
  view: "front",
  color: "Blue",
  url: "/fixture-blue-front.svg",
  alt: "Blue front garment",
  position: 0,
});
const owner = "00000000-0000-4000-8000-000000000001";
const customer = "00000000-0000-4000-8000-000000000002";
await db.query("insert into auth.users(id) values($1)", [owner]);
await db.query("insert into auth.users(id) values($1)", [customer]);
await db.query("update profiles set role='owner' where id=$1", [owner]);
for (const image of product.product_images)
  await db.query(
    "insert into product_images(product_id,url,alt,position,view,color) values($1,$2,$3,$4,$5,$6)",
    [pid, image.url, image.alt, image.position, image.view, image.color],
  );
async function fixtureProduct(stock = 0) {
  const id = crypto.randomUUID(),
    variant = crypto.randomUUID();
  await db.query(
    "insert into products(id,name,slug,sku,price,status,has_sizes) values($1::uuid,'Lifecycle piece',$1::uuid::text,$1::uuid::text,100000,'draft',true)",
    [id],
  );
  await db.query(
    "insert into product_variants(id,product_id,sku,size,color) values($1::uuid,$2,$1::uuid::text,'S','Blue')",
    [variant, id],
  );
  await db.query("insert into inventory(variant_id,on_hand) values($1,$2)", [
    variant,
    stock,
  ]);
  await db.query(
    "insert into product_images(product_id,url,alt,position,view) values($1,'/fixture-front.svg','Original front',0,'front')",
    [id],
  );
  return { id, variant };
}
async function products(tx, url) {
  const rows = (await tx.query("select * from products order by created_at"))
    .rows;
  const selected = rows.filter(
    (p) =>
      (!url.searchParams.get("id") ||
        url.searchParams.get("id") === "eq." + p.id ||
        (url.searchParams.get("id").startsWith("in.(") &&
          url.searchParams.get("id").includes(p.id))) &&
      (!url.searchParams.get("slug") ||
        url.searchParams.get("slug") === "eq." + p.slug) &&
      (!url.searchParams.get("status") ||
        url.searchParams.get("status") === "eq." + p.status),
  );
  return Promise.all(
    selected.map(async (p) => ({
      ...p,
      categories: null,
      product_images: (
        await tx.query(
          "select * from product_images where product_id=$1 order by position",
          [p.id],
        )
      ).rows,
      product_variants: (
        await tx.query(
          "select v.*,row_to_json(i) inventory from product_variants v left join inventory i on i.variant_id=v.id where v.product_id=$1 order by v.sku",
          [p.id],
        )
      ).rows,
    })),
  );
}
const rpcArgs = {
  guest_checkout: [
    "p_items",
    "p_address",
    "p_coupon",
    "p_notes",
    "p_key",
    "p_token",
    "p_quote",
  ],
  guest_order: ["p_order", "p_token"],
  guest_order_by_reference: ["p_reference", "p_token"],
  checkout: ["p_items", "p_address", "p_coupon", "p_notes", "p_key", "p_quote"],
  order_progress: ["p_order", "p_token"],
  order_timeline: ["p_order"],
  transition_order: [
    "p_order",
    "p_status",
    "p_tracking",
    "p_courier",
    "p_reason",
  ],
  record_cod_payment: ["p_order", "p_status", "p_reason"],
  submit_feedback: ["p_order", "p_product", "p_rating", "p_content", "p_token"],
  moderate_feedback: ["p_review", "p_approved", "p_reply"],
  feedback_admin: ["p_page", "p_approved"],
  product_removal: ["p_product", "p_apply", "p_archive"],
  variant_removal: ["p_variant"],
  inspect_product_asset: ["p_name"],
  ensure_shopping_containers: [],
  save_shopping: ["p_items", "p_wishlist"],
  adjust_inventory: ["p_variant", "p_quantity", "p_mode", "p_reason"],
};
const server = createServer(async (req, res) => {
  const send = (data, status = 200) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Content-Range": "0-0/1",
    });
    res.end(JSON.stringify(data));
  };
  try {
    const url = new URL(req.url, "http://localhost");
    const table = url.pathname.split("/").pop();
    if (url.pathname === "/health") {
      send({ ok: true });
      return;
    }
    if (url.pathname === "/fixture/product" && req.method === "POST") {
      send(await fixtureProduct(url.searchParams.get("stock") === "2" ? 2 : 0));
      return;
    }
    let actor = null;
    try {
      const payload = JSON.parse(
        Buffer.from(
          (req.headers.authorization ?? "")
            .replace("Bearer ", "")
            .split(".")[1],
          "base64url",
        ).toString(),
      );
      if ([owner, customer].includes(payload.sub)) actor = payload.sub;
    } catch {
      /* Test JWT only. */
    }
    if (url.pathname === "/auth/v1/user") {
      send(
        actor
          ? {
              id: actor,
              aud: "authenticated",
              email:
                actor === owner
                  ? "owner@fixture.example"
                  : "customer@fixture.example",
              role: "authenticated",
              app_metadata: { provider: "email", providers: ["email"] },
              user_metadata: {},
              created_at: new Date().toISOString(),
            }
          : { message: "No fixture session" },
        actor ? 200 : 401,
      );
      return;
    }
    const single = req.headers.accept?.includes("vnd.pgrst.object");
    await db.transaction(async (tx) => {
      await tx.exec("set local role " + (actor ? "authenticated" : "anon"));
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
        actor ?? "",
      ]);
      let body = "";
      for await (const chunk of req) body += chunk;
      if (
        req.method === "POST" &&
        url.pathname.includes("/rpc/") &&
        Object.hasOwn(rpcArgs, table)
      ) {
        const p = JSON.parse(body),
          args = rpcArgs[table],
          values = args.map((key) =>
            ["p_items", "p_address", "p_cart", "p_wishlist"].includes(key)
              ? JSON.stringify(p[key])
              : p[key],
          );
        if (table === "order_timeline") {
          send(
            (await tx.query("select * from order_timeline($1)", [p.p_order]))
              .rows,
          );
          return;
        }
        const result = await tx.query(
          `select ${table}(${args.map((key, i) => "$" + (i + 1) + (["p_items", "p_address", "p_cart", "p_wishlist"].includes(key) ? "::jsonb" : "")).join(",")}) result`,
          values,
        );
        send(result.rows[0].result);
        return;
      }
      if (
        (req.method === "PATCH" || req.method === "POST") &&
        ["products", "product_variants"].includes(table)
      ) {
        const p = JSON.parse(body),
          allowed =
            table === "products"
              ? [
                  "name",
                  "slug",
                  "sku",
                  "description",
                  "price",
                  "sale_price",
                  "status",
                  "category_id",
                  "featured",
                  "has_sizes",
                  "tags",
                  "seo_title",
                  "seo_description",
                ]
              : ["product_id", "sku", "size", "color", "price", "active"];
        const keys = Object.keys(p).filter((k) => allowed.includes(k)),
          values = keys.map((k) => p[k]);
        let result;
        if (req.method === "PATCH") {
          values.push(url.searchParams.get("id")?.replace("eq.", ""));
          result = await tx.query(
            `update ${table} set ${keys.map((k, i) => k + "=$" + (i + 1)).join(",")} where id=$${values.length} returning id`,
            values,
          );
        } else
          result = await tx.query(
            `insert into ${table}(${keys.join(",")}) values(${keys.map((_, i) => "$" + (i + 1)).join(",")}) returning id`,
            values,
          );
        send(single ? result.rows[0] : result.rows);
        return;
      }
      if (table === "products") {
        const rows = await products(tx, url);
        send(single ? (rows[0] ?? null) : rows);
        return;
      }
      if (table === "orders") {
        const rows = (
          await tx.query("select * from orders order by created_at desc")
        ).rows.filter(
          (o) =>
            (!url.searchParams.get("id") ||
              url.searchParams.get("id") === "eq." + o.id) &&
            (!url.searchParams.get("reference") ||
              url.searchParams.get("reference") === "eq." + o.reference) &&
            (!url.searchParams.get("user_id") ||
              url.searchParams.get("user_id") === "eq." + o.user_id),
        );
        for (const o of rows)
          o.order_items = (
            await tx.query("select * from order_items where order_id=$1", [
              o.id,
            ])
          ).rows;
        send(single ? (rows[0] ?? null) : rows);
        return;
      }
      if (table === "reviews") {
        const rows = (
          await tx.query(
            "select id,product_id,rating,content,approved,admin_reply,created_at from reviews where approved=true order by created_at desc",
          )
        ).rows.filter(
          (r) =>
            !url.searchParams.get("product_id") ||
            url.searchParams.get("product_id") === "eq." + r.product_id,
        );
        send(rows);
        return;
      }
      if (table === "product_variants") {
        send(
          (await tx.query("select id,product_id from product_variants")).rows,
        );
        return;
      }
      if (table === "profiles") {
        const rows = (
          await tx.query("select * from profiles where id=$1", [actor])
        ).rows;
        send(single ? rows[0] : rows);
        return;
      }
      if (["carts", "wishlists"].includes(table)) {
        const itemTable = table === "carts" ? "cart_items" : "wishlist_items",
          fk = table === "carts" ? "cart_id" : "wishlist_id";
        const row = (
          await tx.query(`select * from ${table} where user_id=$1`, [actor])
        ).rows[0];
        if (row)
          row[itemTable] = (
            await tx.query(`select * from ${itemTable} where ${fk}=$1`, [
              row.id,
            ])
          ).rows;
        send(single ? row : row ? [row] : []);
        return;
      }
      if (table === "store_settings") {
        send(settings);
        return;
      }
      if (["categories", "banners", "pages", "addresses"].includes(table)) {
        send([]);
        return;
      }
      send({ message: "Fixture route unavailable" }, 404);
    });
  } catch {
    send({ message: "Fixture operation failed" }, 500);
  }
});
server.listen(4401, "127.0.0.1");
process.on("SIGTERM", () =>
  server.close(() => {
    void db.close().then(() => process.exit(0));
  }),
);
