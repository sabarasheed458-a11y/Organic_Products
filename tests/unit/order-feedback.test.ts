import { it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("@/actions/commerce", () => ({
  submitFeedback: vi.fn(),
  moderateFeedback: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { ProgressTracker } from "@/components/account/order-progress";
import {
  FeedbackForm,
  FeedbackModeration,
} from "@/components/account/feedback";
import { transitions, orderStages, orderStatusLabel } from "@/lib/utils";
import type { Order, OrderProgress, Feedback } from "@/types";
const order = {
  id: "test",
  status: "packed",
  created_at: "2026-10-14T08:00:00Z",
} as Order;
it("keeps fulfillment forward-only while preserving cancellation and returns", () => {
  expect(orderStages).toEqual([
    "pending",
    "confirmed",
    "processing",
    "packed",
    "shipped",
    "out_for_delivery",
    "delivered",
  ]);
  expect(transitions.processing).toEqual(["packed", "cancelled"]);
  expect(transitions.packed).toEqual(["shipped", "cancelled"]);
  expect(transitions.shipped).toEqual(["out_for_delivery"]);
  expect(transitions.out_for_delivery).toEqual(["delivered"]);
  expect(transitions.delivered).toEqual(["returned"]);
  expect(transitions.cancelled).toEqual([]);
  expect(orderStatusLabel("out_for_delivery")).toBe("Out for delivery");
});
it("highlights authoritative status and renders only recorded timestamps without private staff notes", () => {
  const progress = {
    history: [
      {
        status: "confirmed",
        created_at: "2026-10-14T09:00:00Z",
        reason: "PRIVATE-STAFF",
        actor_id: "private-id",
      },
    ],
  } as OrderProgress;
  const html = renderToStaticMarkup(
    createElement(ProgressTracker, { order, progress }),
  );
  expect(html).toContain('aria-current="step"');
  expect(html).toContain("Packed");
  expect(html).toContain("2026-10-14T09:00:00Z");
  expect(html).toContain("No recorded timestamp");
  expect(html).not.toContain("PRIVATE-STAFF");
  expect(html).not.toContain("private-id");
  const cancelled = renderToStaticMarkup(
    createElement(ProgressTracker, {
      order: { ...order, status: "cancelled" },
      progress,
    }),
  );
  expect(cancelled).toContain("This order will not be dispatched");
});
it("renders customer and admin feedback with escaped content and explicit moderation status", () => {
  const feedback = {
    id: "review",
    product_id: "product",
    rating: 4,
    content: "<script>secret</script>",
    approved: false,
    admin_reply: "Store reply",
    created_at: order.created_at,
  } as Feedback;
  const customer = renderToStaticMarkup(
    createElement(FeedbackForm, {
      orderId: "order",
      productId: "product",
      name: "Purchased piece",
      feedback,
    }),
  );
  expect(customer).toContain("awaiting admin review");
  expect(customer).toContain("&lt;script&gt;");
  expect(customer).not.toContain("<script>");
  expect(customer).toContain("Update feedback");
  const admin = renderToStaticMarkup(
    createElement(FeedbackModeration, { feedback }),
  );
  expect(admin).toContain("Publish on product page");
  expect(admin).toContain("Reply to customer");
});
