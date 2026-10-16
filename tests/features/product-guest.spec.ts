import { test, expect } from "@playwright/test";
test("gallery, size/color, separate cart lines and guest COD checkout use existing pages and real migrated RPCs", async ({
  page,
  context,
}) => {
  await page.route("**/fixture-*.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#d4b8a5"/></svg>',
    }),
  );
  await page.goto("/collections/all");
  await page
    .getByRole("link", { name: "View Fixture garment", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Fixture garment", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "View front", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View back", exact: true }).click();
  await expect(page.locator(".detail-image img")).toHaveAttribute(
    "src",
    /fixture-back/,
  );
  await page.getByRole("button", { name: "Enlarge product image" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Choose a size", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Ivory", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "M", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "S", exact: true }).click();
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await page.getByRole("button", { name: "Blue", exact: true }).click();
  await expect(page.locator(".detail-image img")).toHaveAttribute(
    "src",
    /fixture-blue-front/,
  );
  await page.getByRole("button", { name: "M", exact: true }).click();
  await page.getByRole("button", { name: "Buy now", exact: true }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(
    page.getByText("Continue as Guest", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("S / Ivory", { exact: false })).toBeVisible();
  await expect(page.getByText("M / Blue", { exact: false })).toBeVisible();
  await page.locator("input[name=full_name]").fill("Fixture Guest");
  await page.locator("input[name=phone]").fill("03001234567");
  await page.locator("input[name=line1]").fill("12 Fixture Street");
  await page.locator("input[name=city]").fill("Lahore");
  await page.locator("input[name=email]").fill("fixture@example.com");
  await page
    .getByRole("button", { name: "Confirm totals / apply coupon" })
    .click();
  await expect(
    page.getByText("Totals confirmed.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Place COD order/ }).click();
  await expect(page).toHaveURL(/\/order-confirmation\//);
  await expect(page.getByText("Guest checkout", { exact: true })).toBeVisible();
  await expect(page.getByText("S / Ivory", { exact: true })).toBeVisible();
  await expect(page.getByText("M / Blue", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Guest checkout", { exact: true })).toBeVisible();
  const cookie = (await context.cookies()).find(
    (c) => c.name === "mira-guest-order-access",
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  const other = await context.browser()!.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(page.url());
  await expect(otherPage).toHaveURL(/\/login/);
  await other.close();
});
