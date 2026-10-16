import { test, expect } from "@playwright/test";
const productFixture = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Test-only lounge piece",
  slug: "test-only-piece",
  price: 500000,
  sale_price: null,
  featured: true,
  categories: { name: "Test collection" },
  product_images: [],
  product_variants: [
    {
      id: "20000000-0000-4000-8000-000000000001",
      size: "M",
      color: "Ivory",
      price: null,
      inventory: { on_hand: 3, reserved: 0 },
    },
  ],
};
test("guest checkout retains its bag and return destination across login/register links", async ({
  page,
}) => {
  await page.route("**/api/variants?*", (route) =>
    route.fulfill({ json: { products: [productFixture] } }),
  );
  await page.goto("/");
  await page.waitForFunction(
    () => localStorage.getItem("mira-shopping-guest") !== null,
  );
  await page.evaluate(() =>
    localStorage.setItem(
      "mira-shopping-guest",
      JSON.stringify({
        cart: [
          { variant_id: "20000000-0000-4000-8000-000000000001", quantity: 2 },
        ],
        wishlist: [],
      }),
    ),
  );
  await page.goto("/cart");
  await expect(page.locator(".quantity span")).toHaveText("2");
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(
    page.getByText("Continue as Guest", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/checkout");
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/register\?next=/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/checkout");
  await page.getByRole("link", { name: "Back to sign in" }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/checkout");
  await page.goto("/cart");
  await expect(page.locator(".quantity span")).toHaveText("2");
});
test("guest bag quantities and wishlist persist (mocked catalog responses)", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.route("**/api/variants?*", (route) =>
    route.fulfill({ json: { products: [productFixture] } }),
  );
  await page.route("**/api/catalog?*", (route) =>
    route.fulfill({
      json: {
        products: new URL(route.request().url()).searchParams.get("ids")
          ? [productFixture]
          : [],
      },
    }),
  );
  await page.goto("/");
  await page.waitForFunction(
    () => localStorage.getItem("mira-shopping-guest") !== null,
  );
  await page.evaluate(() =>
    localStorage.setItem(
      "mira-shopping-guest",
      JSON.stringify({
        cart: [
          { variant_id: "20000000-0000-4000-8000-000000000001", quantity: 1 },
        ],
        wishlist: ["10000000-0000-4000-8000-000000000001"],
      }),
    ),
  );
  await page.goto("/cart");
  await expect(
    page.getByRole("heading", { name: "Test-only lounge piece" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await page.reload();
  await expect(page.locator(".quantity span")).toHaveText("2");
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await expect(
    page.getByRole("button", { name: "Increase quantity" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Remove item" }).click();
  await page.reload();
  await expect(page.getByText("Your shopping bag is empty.")).toBeVisible();
  await page.goto("/wishlist");
  await expect(
    page.getByRole("heading", { name: "Test-only lounge piece" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove from wishlist" }).click();
  await page.reload();
  await expect(page.getByText("Save products you like")).toBeVisible();
});
test("product cards replace unavailable photos with a branded placeholder", async ({
  page,
}) => {
  const productWithImage = {
    ...productFixture,
    product_images: [
      {
        id: "30000000-0000-4000-8000-000000000001",
        url: "https://images.unsplash.com/photo-1234567890123",
        alt: "Product photo",
        position: 0,
      },
    ],
  };
  await page.route("**/api/catalog?*", (route) =>
    route.fulfill({ json: { products: [productWithImage] } }),
  );
  await page.route("**/_next/image?**", (route) =>
    route.fulfill({ status: 404, body: "Image unavailable" }),
  );
  await page.addInitScript(() =>
    localStorage.setItem(
      "mira-shopping-guest",
      JSON.stringify({
        cart: [],
        wishlist: ["10000000-0000-4000-8000-000000000001"],
      }),
    ),
  );
  await page.goto("/wishlist", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Product image unavailable")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: productFixture.name }),
  ).toBeVisible();
});
test("mobile menu restores account access, search supports Escape, and narrow layouts fit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Toggle menu" }).click();
  await expect(
    page
      .locator("#store-navigation")
      .getByRole("link", { name: "Your account", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Toggle menu" }),
  ).toHaveAttribute("aria-expanded", "false");
  await page
    .getByRole("button", { name: "Search products", exact: true })
    .click();
  await expect(
    page.getByRole("searchbox", { name: "Search the collection" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Search products", exact: true }),
  ).toBeFocused();
  await page.goto("/collections/all");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("combobox", { name: "Sort products" }),
  ).not.toBeVisible();
  await page.getByText("Filter & sort", { exact: false }).click();
  await expect(
    page.getByRole("combobox", { name: "Sort products" }),
  ).toBeVisible();
  await page.getByText("Filter & sort", { exact: false }).click();
  await expect(
    page.getByRole("combobox", { name: "Sort products" }),
  ).not.toBeVisible();
});
test("unavailable bag items block the checkout CTA and cards use purchasable variant prices", async ({
  page,
}) => {
  const fixture = {
    ...productFixture,
    price: 500000,
    sale_price: 400000,
    product_variants: [
      {
        ...productFixture.product_variants[0],
        active: true,
        price: 650000,
        inventory: { on_hand: 0, reserved: 0 },
      },
    ],
  };
  await page.route("**/api/variants?*", (route) =>
    route.fulfill({ json: { products: [fixture] } }),
  );
  await page.route("**/api/catalog?*", (route) =>
    route.fulfill({ json: { products: [fixture] } }),
  );
  await page.goto("/");
  await page.waitForFunction(
    () => localStorage.getItem("mira-shopping-guest") !== null,
  );
  await page.evaluate(() =>
    localStorage.setItem(
      "mira-shopping-guest",
      JSON.stringify({
        cart: [
          { variant_id: "20000000-0000-4000-8000-000000000001", quantity: 1 },
        ],
        wishlist: ["10000000-0000-4000-8000-000000000001"],
      }),
    ),
  );
  await page.goto("/cart");
  await expect(
    page.getByRole("button", { name: "Continue to checkout" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Update or remove unavailable items to continue."),
  ).toBeVisible();
  await page.goto("/wishlist");
  await expect(page.locator(".product-badge")).toHaveText("SOLD OUT");
  await expect(page.locator(".card-price")).toContainText("6,500");
  await expect(page.locator(".card-price del")).toHaveCount(0);
});
test("home renders without overflow and collection navigation works", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Nature for every day/ }),
  ).toBeVisible();
  await expect(page.locator("footer")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `artifacts/${testInfo.project.name}-home.png`,
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Explore products", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "The collection", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `artifacts/${testInfo.project.name}-collection.png`,
    fullPage: true,
  });
});
test("search, wishlist, and bag show useful empty states", async ({ page }) => {
  await page.goto("/search?q=robe");
  await expect(
    page.getByRole("heading", { name: "Results for “robe”" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No products found" }),
  ).toBeVisible();
  await page.goto("/wishlist");
  await expect(page.getByText("Save products you like")).toBeVisible();
  await page.goto("/cart");
  await expect(page.getByText("Your shopping bag is empty.")).toBeVisible();
});
test("protected routes redirect to login and never expose staff data", async ({
  page,
}) => {
  for (const path of [
    "/admin",
    "/account",
    "/account/orders",
    "/account/addresses",
    "/track-order",
    "/order-confirmation/00000000-0000-4000-8000-000000000001",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole("heading", { name: "Welcome back." }),
    ).toBeVisible();
  }
});
test("auth routes and content pages render", async ({ page }) => {
  for (const [path, text] of [
    ["/register", "Make yourself at home."],
    ["/forgot-password", "A fresh start."],
    ["/reset-password", "Choose a new password."],
    ["/pages/about-us", "About us"],
    ["/pages/contact", "We’re here for you."],
    ["/pages/faq", "A few helpful answers."],
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: text, exact: true }),
    ).toBeVisible();
  }
  for (const slug of ["shipping", "returns", "privacy", "terms"]) {
    await page.goto("/policies/" + slug);
    await expect(
      page.getByText("This policy has not been published yet."),
    ).toBeVisible();
  }
});
test("forms enforce required fields and image not-found routes return 404", async ({
  page,
}) => {
  await page.goto("/register");
  await page.getByRole("button", { name: "Create account" }).click();
  expect(
    await page
      .locator("input[name=full_name]")
      .evaluate((el: HTMLInputElement) => el.validity.valueMissing),
  ).toBe(true);
  const response = await page.goto("/products/missing");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "This page has wandered off." }),
  ).toBeVisible();
});
test("customer data APIs reject malformed identifiers and exports require authorization", async ({
  request,
}) => {
  expect((await request.get("/api/admin/export")).status()).toBe(403);
  expect((await request.get("/api/catalog?ids=bad")).status()).toBe(400);
  expect((await request.get("/api/variants?ids=bad")).status()).toBe(400);
  const callback = await request.get(
    "/auth/callback?code=invalid-test-code&next=%2F%09%2Fevil.example",
    { maxRedirects: 0 },
  );
  expect(callback.status()).toBe(307);
  expect(new URL(callback.headers().location).pathname).toBe("/login");
  expect(callback.headers().location).not.toContain("evil.example");
});

test("every admin module and detail route rejects anonymous access", async ({
  request,
}) => {
  for (const route of [
    "products",
    "feedback",
    "categories",
    "inventory",
    "orders",
    "customers",
    "inquiries",
    "coupons",
    "promotions",
    "content",
    "settings",
    "reports",
    "staff",
    "products/new",
    "products/00000000-0000-4000-8000-000000000001",
    "orders/00000000-0000-4000-8000-000000000001",
    "customers/00000000-0000-4000-8000-000000000001",
  ]) {
    const response = await request.get("/admin/" + route, { maxRedirects: 0 });
    expect(response.status(), route).toBe(307);
    expect(
      new URL(response.headers().location, response.url()).pathname,
      route,
    ).toBe("/login");
  }
});

test("interrupted contact and login actions show an error and release their buttons", async ({
  page,
}) => {
  for (const path of ["/pages/contact", "/login"]) {
    await page.goto(path);
    await page.route("**" + path, (route) =>
      route.request().method() === "POST"
        ? route.abort("failed")
        : route.continue(),
    );
    if (path === "/pages/contact") {
      await page.locator('input[name="name"]').fill("Audit visitor");
      await page.locator('input[name="email"]').fill("audit@example.com");
      await page
        .locator('textarea[name="message"]')
        .fill("A production readiness test message.");
    } else {
      await page.locator('input[name="email"]').fill("audit@example.com");
      await page.locator('input[name="password"]').fill("audit-test-password");
    }
    const button = page.getByRole("button", {
      name: path === "/login" ? "Sign in" : "Send message",
      exact: true,
    });
    await button.click();
    await expect(
      page.getByText("The connection was interrupted. Please try again.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(button).toBeEnabled();
    await page.unroute("**" + path);
  }
});

test("metadata, security headers and unknown content routes have explicit responses", async ({
  request,
}) => {
  const home = await request.get("/");
  expect(home.status()).toBe(200);
  expect(home.headers()["x-content-type-options"]).toBe("nosniff");
  expect(home.headers()["x-frame-options"]).toBe("DENY");
  expect(home.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain("Disallow: /admin");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain("/collections/all");
  expect((await request.get("/icon.svg")).status()).toBe(200);
  for (const path of [
    "/pages/missing-audit-page",
    "/policies/missing-audit-policy",
    "/missing-audit-route",
  ])
    expect((await request.get(path)).status(), path).toBe(404);
});
