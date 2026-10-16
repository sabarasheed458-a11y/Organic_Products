import { expect, it } from "vitest";
import { actionRequest } from "@/lib/action-request";
it("redacts rejected action transports while preserving business errors and success", async () => {
  expect(
    await actionRequest(async () => {
      throw new Error("PRIVATE_INTERNAL_DETAIL");
    }),
  ).toEqual({
    ok: false,
    message: "The connection was interrupted. Please try again.",
  });
  const business = { ok: false, message: "This item is sold out." };
  expect(await actionRequest(async () => business)).toBe(business);
  const success = { ok: true, message: "Saved", data: { id: "test" } };
  expect(await actionRequest(async () => success)).toBe(success);
});
