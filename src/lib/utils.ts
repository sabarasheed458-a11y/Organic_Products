import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function money(paisa: number) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(paisa / 100);
}
export function csvCell(value: unknown) {
  const text = String(value ?? "");
  return (
    '"' +
    (/^[=+\-@\t\r]/.test(text) ? "'" : "") +
    text.replaceAll('"', '""') +
    '"'
  );
}
export function safePath(
  value: string | undefined | null,
  fallback = "/account",
) {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  )
    return fallback;
  try {
    return new URL(value, "https://store.invalid").origin ===
      "https://store.invalid"
      ? value
      : fallback;
  } catch {
    return fallback;
  }
}
export const transitions: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["out_for_delivery"],
  out_for_delivery: ["delivered"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
};
export const orderStages = [
  "pending",
  "confirmed",
  "processing",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
] as const;
export function orderStatusLabel(status: string) {
  return (
    (
      {
        pending: "Pending",
        confirmed: "Confirmed",
        processing: "Processing",
        packed: "Packed",
        shipped: "Shipped / dispatched",
        out_for_delivery: "Out for delivery",
        delivered: "Delivered",
        cancelled: "Cancelled",
        returned: "Returned",
      } as Record<string, string>
    )[status] ?? status
  );
}
export function can(role: string, scope: string) {
  return (
    ["owner", "manager"].includes(role) ||
    (role === "catalog_manager" && scope === "catalog") ||
    (role === "order_manager" && scope === "orders")
  );
}
