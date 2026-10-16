import { test, expect } from "@playwright/test";
async function login(context: import("@playwright/test").BrowserContext) {
  const owner = "00000000-0000-4000-8000-000000000001",
    exp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = [
    { alg: "HS256", typ: "JWT" },
    { sub: owner, aud: "authenticated", role: "authenticated", exp },
    "fixture-signature",
  ]
    .map((v) =>
      typeof v === "string"
        ? v
        : Buffer.from(JSON.stringify(v)).toString("base64url"),
    )
    .join(".");
  await context.addCookies([
    {
      name: "sb-127-auth-token",
      value:
        "base64-" +
        Buffer.from(
          JSON.stringify({
            access_token: jwt,
            refresh_token: "fixture-refresh",
            expires_at: exp,
            expires_in: 3600,
            token_type: "bearer",
            user: { id: owner },
          }),
        ).toString("base64url"),
      url: "http://localhost:3200",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
test("editing keeps the original ID and image; cancellation and failures preserve the product; eligible deletion is confirmed", async ({
  page,
  context,
  request,
}) => {
  const fixture = await (
    await request.post("http://127.0.0.1:4401/fixture/product")
  ).json();
  await login(context);
  await page.route("**/fixture-*.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="130"/>',
    }),
  );
  await page.goto("/admin/products/" + fixture.id);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  await expect(page.locator("input[name=name]")).toHaveValue("Lifecycle piece");
  await page.locator("input[name=name]").fill("Updated lifecycle piece");
  await page.getByLabel("Regular price (PKR)", { exact: true }).fill("2200");
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(
    page.getByText("Saved successfully.", { exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(new RegExp(fixture.id + "$"));
  await expect(page.locator("input[name=name]")).toHaveValue(
    "Updated lifecycle piece",
  );
  await expect(
    page.getByLabel("Regular price (PKR)", { exact: true }),
  ).toHaveValue("2200");
  await expect(page.getByAltText("Original front")).toHaveAttribute(
    "src",
    /fixture-front/,
  );
  await page
    .getByRole("button", { name: "Delete product", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", {
      name: "Permanently delete Updated lifecycle piece?",
    }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.locator("input[name=name]")).toHaveValue(
    "Updated lifecycle piece",
  );
  await page
    .getByRole("button", { name: "Delete product", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await page.route("**/admin/products/" + fixture.id, (route) =>
    route.request().method() === "POST"
      ? route.abort("failed")
      : route.continue(),
  );
  await dialog.getByRole("button", { name: "Confirm deletion" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "connection was interrupted",
  );
  await expect(dialog).toBeVisible();
  await page.unroute("**/admin/products/" + fixture.id);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.reload();
  await expect(page.locator("input[name=name]")).toHaveValue(
    "Updated lifecycle piece",
  );
  await page
    .getByRole("button", { name: "Delete product", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Confirm deletion" }).click();
  await expect(page).toHaveURL(/\/admin\/products$/);
  const missing = await page.goto("/admin/products/" + fixture.id);
  expect(missing?.status()).toBe(404);
});
test("stock dependencies turn Delete into Archive and retain the record after refresh", async ({
  page,
  context,
  request,
}) => {
  const fixture = await (
    await request.post("http://127.0.0.1:4401/fixture/product?stock=2")
  ).json();
  await login(context);
  await page.goto("/admin/products/" + fixture.id);
  await page
    .getByRole("button", { name: "Delete product", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Archive Lifecycle piece?" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm archive" }).click();
  await expect(
    page.getByText(
      "Product archived. Existing orders and records were retained.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("select[name=status]")).toHaveValue("archived");
  await page.locator(".record-editor summary").first().click();
  await expect(page.getByText("On hand:", { exact: false })).toContainText("2");
});
