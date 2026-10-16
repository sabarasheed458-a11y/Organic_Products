import type { Field } from "@/components/admin/editor";
import { brandName } from "@/lib/branding";
const on: Field = {
  key: "active",
  label: "Active",
  type: "checkbox",
  default: true,
};
const start: Field = {
  key: "starts_at",
  label: "Starts at (UTC)",
  type: "datetime-local",
  default: "2026-10-12T00:00:00Z",
};
const end: Field = {
  key: "ends_at",
  label: "Ends at (UTC, optional)",
  type: "datetime-local",
  nullable: true,
};
export const fields: Record<string, Field[]> = {
  categories: [
    {
      key: "image_url",
      label: "Category image (optional)",
      imageTarget: "categories",
      nullable: true,
    },
    { key: "name", label: "Name" },
    { key: "slug", label: "Slug" },
    { key: "description", label: "Description", type: "textarea" },
    {
      key: "parent_id",
      label: "Parent category UUID (optional)",
      nullable: true,
    },
    { key: "position", label: "Display order", type: "number", default: 0 },
    { key: "visible", label: "Visible", type: "checkbox", default: true },
    { key: "seo_title", label: "SEO title", nullable: true },
    { key: "seo_description", label: "SEO description", nullable: true },
  ],
  coupons: [
    { key: "code", label: "Code (uppercase)" },
    {
      key: "kind",
      label: "Discount type",
      type: "select",
      options: [
        { value: "percentage", label: "Percentage" },
        { value: "fixed", label: "Fixed amount (paisa)" },
        { value: "quantity", label: "Quantity / bundle percentage" },
      ],
    },
    { key: "value", label: "Discount value", type: "number", default: 10 },
    {
      key: "minimum",
      label: "Minimum subtotal (paisa)",
      type: "number",
      default: 0,
    },
    {
      key: "min_quantity",
      label: "Minimum item quantity",
      type: "number",
      default: 1,
    },
    start,
    end,
    {
      key: "usage_limit",
      label: "Total usage limit (optional)",
      type: "number",
      nullable: true,
    },
    {
      key: "per_customer_limit",
      label: "Per-customer limit",
      type: "number",
      default: 1,
    },
    on,
    {
      key: "product_ids",
      label: "Eligible product UUIDs (JSON array; [] = all)",
      type: "json",
      default: [],
    },
    {
      key: "category_ids",
      label: "Eligible category UUIDs (JSON array; [] = all)",
      type: "json",
      default: [],
    },
    {
      key: "customer_ids",
      label: "Eligible customer UUIDs (JSON array; [] = all)",
      type: "json",
      default: [],
    },
  ],
  promotions: [
    { key: "name", label: "Name" },
    { key: "coupon_id", label: "Linked coupon UUID", nullable: true },
    { key: "description", label: "Description", type: "textarea" },
    on,
  ],
  banners: [
    { key: "title", label: "Title" },
    { key: "subtitle", label: "Subtitle" },
    {
      key: "image_url",
      label: "Banner image (optional)",
      imageTarget: "banners",
      nullable: true,
    },
    { key: "link", label: "Internal destination", default: "/collections/all" },
    { key: "position", label: "Display order", type: "number", default: 0 },
    start,
    end,
    on,
  ],
  pages: [
    { key: "slug", label: "Page slug (e.g. about-us, faq, shipping, returns)" },
    { key: "title", label: "Title" },
    { key: "content", label: "Plain-text content", type: "textarea" },
    { key: "published", label: "Published", type: "checkbox", default: true },
  ],
  store_settings: [
    {
      key: "logo_url",
      label: "Store logo (optional)",
      imageTarget: "branding",
      nullable: true,
    },
    {
      key: "footer_links",
      label: "Additional footer links (JSON array: label, href)",
      type: "json",
      default: [],
    },
    { key: "name", label: "Store name", default: brandName },
    { key: "contact_email", label: "Support email" },
    { key: "contact_phone", label: "Support phone" },
    { key: "announcement", label: "Announcement" },
    {
      key: "shipping_fee",
      label: "Standard shipping fee (paisa)",
      type: "number",
      default: 25000,
    },
    {
      key: "free_shipping_threshold",
      label: "Free shipping threshold (paisa)",
      type: "number",
      default: 800000,
    },
    {
      key: "max_cod_total",
      label: "Maximum COD total (paisa)",
      type: "number",
      default: 5000000,
    },
    {
      key: "cod_enabled",
      label: "Enable COD",
      type: "checkbox",
      default: true,
    },
    {
      key: "shipping_zones",
      label:
        'City delivery zones: [{"city":"Lahore","fee":25000}]; [] = nationwide standard rate',
      type: "json",
      default: [],
    },
    {
      key: "homepage_sections",
      label: "Homepage section order (featured, categories, story)",
      type: "json",
      default: ["featured", "categories", "story"],
    },
    {
      key: "navigation",
      label: 'Navigation: [{"label":"Shop all","href":"/collections/all"}]',
      type: "json",
      default: [],
    },
  ],
  staff: [
    {
      key: "role",
      label: "Role",
      type: "select",
      options: [
        "customer",
        "owner",
        "manager",
        "catalog_manager",
        "order_manager",
      ].map((value) => ({ value, label: value.replaceAll("_", " ") })),
    },
    on,
  ],
  contact_inquiries: [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "open", label: "Open" },
        { value: "resolved", label: "Resolved" },
      ],
    },
  ],
};
