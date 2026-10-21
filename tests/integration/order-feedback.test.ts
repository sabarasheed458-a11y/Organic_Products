import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
let db: PGlite;
const owner = "00000000-0000-4000-8000-000000000001",
  customer = "00000000-0000-4000-8000-000000000002",
  other = "00000000-0000-4000-8000-000000000003",
  catalog = "00000000-0000-4000-8000-000000000004",
  orders = "00000000-0000-4000-8000-000000000005",
  product = "10000000-0000-4000-8000-000000000001";
const variants = [
  "20000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
  "20000000-0000-4000-8000-000000000003",
];
const stages = [
  "confirmed",
  "processing",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
];
async function actor(id: string | null, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id ?? "",
  ]);
  await db.exec("set role " + role);
}
async function place(size = 0, guest = false) {
  await actor(guest ? null : customer, guest ? "anon" : "authenticated");
  const token = "a".repeat(32) + crypto.randomUUID().replaceAll("-", "");
  const args = [
    JSON.stringify([{ variant_id: variants[size], quantity: 1 }]),
    JSON.stringify({
      full_name: "Order Test",
      phone: "03001234567",
      line1: "12 Test Street",
      city: "Lahore",
      postal_code: "",
    }),
    crypto.randomUUID(),
  ];
  const r = guest
    ? await db.query<{ r: { id: string } }>(
        "select guest_checkout($1::jsonb,$2::jsonb,'','',$3,$4,false) r",
        [...args, token],
      )
    : await db.query<{ r: { id: string } }>(
        "select checkout($1::jsonb,$2::jsonb,'','',$3,false) r",
        args,
      );
  return { id: r.rows[0].r.id, token };
}
async function advance(id: string, status: string) {
  await db.query(
    "select transition_order($1,$2,'TRACK-TEST','Test courier','Internal staff note')",
    [id, status],
  );
}
async function delivered(guest = false) {
  const o = await place(1, guest);
  await actor(owner);
  for (const s of stages) await advance(o.id, s);
  return o;
}
async function progress(id: string, token: string | null = null) {
  return (
    await db.query<{ r: Record<string, unknown> | null }>(
      "select order_progress($1,$2) r",
      [id, token],
    )
  ).rows[0].r;
}
async function feedback(
  id: string,
  token: string | null = null,
  content = "Lovely product",
  rating = 5,
  p = product,
) {
  return (
    await db.query<{ id: string }>(
      "select submit_feedback($1,$2,$3,$4,$5) id",
      [id, p, rating, content, token],
    )
  ).rows[0].id;
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
    `insert into auth.users(id) values('${owner}'),('${customer}'),('${other}'),('${catalog}'),('${orders}');update profiles set role='owner' where id='${owner}';update profiles set role='catalog_manager' where id='${catalog}';update profiles set role='order_manager' where id='${orders}';insert into products(id,name,slug,sku,price,status,has_sizes) values('${product}','Sized piece','sized-piece','SIZED',100000,'published',true);`,
  );
  for (let i = 0; i < 3; i++) {
    await db.query(
      "insert into product_variants(id,product_id,sku,size,color) values($1,$2,$3,$4,'Blue')",
      [variants[i], product, "SIZE-" + i, ["S", "M", "L"][i]],
    );
    await db.query("insert into inventory(variant_id,on_hand) values($1,100)", [
      variants[i],
    ]);
  }
});
afterAll(async () => {
  await db?.close();
});
it("preserves S/M/L identity and deducts independent size stock for guest and registered orders", async () => {
  const guest = await place(0, true),
    member = await place(1);
  await actor(owner);
  const rows = (
    await db.query<{ size: string }>(
      "select size from order_items where order_id in($1,$2) order by size",
      [guest.id, member.id],
    )
  ).rows;
  expect(rows.map((r) => r.size)).toEqual(["M", "S"]);
  expect(
    (
      await db.query<{ on_hand: number }>(
        "select on_hand from inventory order by variant_id",
      )
    ).rows.map((r) => r.on_hand),
  ).toEqual([99, 99, 100]);
  await expect(
    db.query(
      "insert into product_variants(product_id,sku,size,color) values($1,'DUP-S','S','Blue')",
      [product],
    ),
  ).rejects.toThrow();
});
it("records every stage, refuses invalid/backward/repeated transitions and leaves payment and stock independent", async () => {
  const o = await place(2);
  await expect(advance(o.id, "confirmed")).rejects.toThrow("Forbidden");
  await actor(orders);
  await expect(advance(o.id, "returned")).rejects.toThrow(
    "Invalid order transition",
  );
  for (const s of stages) await advance(o.id, s);
  await expect(advance(o.id, "processing")).rejects.toThrow(
    "Invalid order transition",
  );
  await expect(advance(o.id, "delivered")).rejects.toThrow(
    "Invalid order transition",
  );
  const p = await progress(o.id);
  expect((p?.history as { status: string }[]).map((e) => e.status)).toEqual(
    stages,
  );
  expect(p?.history).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        actor_id: orders,
        reason: "Internal staff note",
      }),
    ]),
  );
  expect(
    (
      await db.query<{ on_hand: number }>(
        "select on_hand from inventory where variant_id=$1",
        [variants[2]],
      )
    ).rows[0].on_hand,
  ).toBe(99);
  expect(
    (
      await db.query<{ payment_status: string }>(
        "select payment_status from orders where id=$1",
        [o.id],
      )
    ).rows[0].payment_status,
  ).toBe("unpaid");
  await actor(customer);
  expect(JSON.stringify(await progress(o.id))).not.toContain(
    "Internal staff note",
  );
  await actor(other);
  expect(await progress(o.id)).toBeNull();
});
it("restores only the cancelled size once, including packed cancellation, and refuses shipped cancellation", async () => {
  await actor(owner);
  const before = (
    await db.query<{ on_hand: number }>(
      "select on_hand from inventory where variant_id=$1",
      [variants[0]],
    )
  ).rows[0].on_hand;
  const o = await place();
  await actor(owner);
  for (const s of ["confirmed", "processing", "packed"]) await advance(o.id, s);
  await advance(o.id, "cancelled");
  await expect(advance(o.id, "cancelled")).rejects.toThrow();
  await expect(advance(o.id, "shipped")).rejects.toThrow();
  expect(
    (
      await db.query<{ on_hand: number }>(
        "select on_hand from inventory where variant_id=$1",
        [variants[0]],
      )
    ).rows[0].on_hand,
  ).toBe(before);
  const shipped = await place();
  await actor(owner);
  for (const s of ["confirmed", "processing", "packed", "shipped"])
    await advance(shipped.id, s);
  await expect(advance(shipped.id, "cancelled")).rejects.toThrow();
});
it("preserves legacy shipped orders and rejects missing/null/incorrect guest capabilities for progress and feedback", async () => {
  const o = await place(0, true);
  await db.exec("reset role");
  await db.query("update orders set status='shipped' where id=$1", [o.id]);
  await actor(owner);
  await advance(o.id, "out_for_delivery");
  await advance(o.id, "delivered");
  await actor(null, "anon");
  for (const token of [null, "", "bad", "b".repeat(64)]) {
    expect(await progress(o.id, token)).toBeNull();
    await expect(feedback(o.id, token)).rejects.toThrow(
      "Order access required",
    );
  }
  expect((await progress(o.id, o.token))?.status).toBe("delivered");
  const reference = (
    await db.query<{ r: { reference: string } }>(
      "select guest_order($1,$2) r",
      [o.id, o.token],
    )
  ).rows[0].r.reference;
  expect(
    (
      await db.query<{ r: unknown }>(
        "select guest_order_by_reference($1,null) r",
        [reference],
      )
    ).rows[0].r,
  ).toBeNull();
  expect(
    (
      await db.query<{ r: { id: string } }>(
        "select guest_order_by_reference($1,$2) r",
        [reference, o.token],
      )
    ).rows[0].r.id,
  ).toBe(o.id);
  await actor(other);
  expect(await progress(o.id)).toBeNull();
});
it("requires delivered ownership and a purchased product, and validates rating/content", async () => {
  const pending = await place();
  await expect(feedback(pending.id)).rejects.toThrow("after delivery");
  const o = await delivered();
  await expect(feedback(o.id)).rejects.toThrow("Order access required");
  await actor(customer);
  await expect(feedback(o.id, null, "bad", 6)).rejects.toThrow("rating");
  await expect(feedback(o.id, null, "x")).rejects.toThrow("feedback");
  await expect(
    feedback(o.id, null, "Fine", 5, crypto.randomUUID()),
  ).rejects.toThrow("does not belong");
  await actor(other);
  await expect(feedback(o.id)).rejects.toThrow("Order access required");
});
it("keeps guest feedback private until moderation and never exposes order linkage publicly", async () => {
  const o = await delivered(true);
  await actor(null, "anon");
  const id = await feedback(o.id, o.token, "Guest feedback");
  expect(await feedback(o.id, o.token, "Updated guest feedback")).toBe(id);
  expect(
    (await db.query("select id,content from reviews where id=$1", [id])).rows,
  ).toHaveLength(0);
  await expect(db.query("select order_id from reviews")).rejects.toThrow();
  expect((await progress(o.id, o.token))?.feedback).toEqual(
    expect.arrayContaining([expect.objectContaining({ id, approved: false })]),
  );
  await actor(catalog);
  await db.query("select moderate_feedback($1,true,$2)", [
    id,
    "Thank you for sharing",
  ]);
  await actor(null, "anon");
  expect(
    (
      await db.query<{ content: string; admin_reply: string }>(
        "select content,admin_reply from reviews where id=$1",
        [id],
      )
    ).rows,
  ).toEqual([
    { content: "Updated guest feedback", admin_reply: "Thank you for sharing" },
  ]);
  expect(await progress(o.id)).toBeNull();
});
it("lets customers update only their own review and restricts admin approval/replies to catalog permissions", async () => {
  const o = await delivered();
  await actor(customer);
  const id = await feedback(o.id, null, "Registered feedback");
  await expect(
    db.query("select moderate_feedback($1,true,'Fake reply')", [id]),
  ).rejects.toThrow("Forbidden");
  await expect(
    db.query("update reviews set approved=true where id=$1", [id]),
  ).rejects.toThrow();
  await actor(orders);
  await expect(db.query("select feedback_admin(1,null)")).rejects.toThrow(
    "Forbidden",
  );
  await actor(owner);
  await db.query("select moderate_feedback($1,true,'Store reply')", [id]);
  await actor(customer);
  expect(await feedback(o.id, null, "Changed feedback")).toBe(id);
  expect(
    (
      await db.query<{ approved: boolean; admin_reply: string }>(
        "select approved,admin_reply from reviews where id=$1",
        [id],
      )
    ).rows,
  ).toEqual([{ approved: false, admin_reply: "" }]);
  await actor(owner);
  expect(
    (await db.query<{ r: unknown[] }>("select feedback_admin(1,false) r"))
      .rows[0].r.length,
  ).toBeGreaterThan(0);
  await db.exec("reset role");
  expect(
    (
      await db.query(
        "select * from admin_audit_logs where action='FEEDBACK_MODERATION' and entity_id=$1",
        [id],
      )
    ).rows.length,
  ).toBeGreaterThan(0);
});

it("allows direct forward fulfillment updates and still requires delivery details", async () => {
  const o = await place(1);
  await actor(orders);
  await advance(o.id, "confirmed");
  await expect(
    db.query(
      "select transition_order($1,'delivered','','','Direct delivery')",
      [o.id],
    ),
  ).rejects.toThrow("Courier and tracking required");
  await advance(o.id, "delivered");
  expect((await progress(o.id))?.status).toBe("delivered");
  await expect(advance(o.id, "packed")).rejects.toThrow(
    "Invalid order transition",
  );
});
