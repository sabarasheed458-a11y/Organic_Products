export type Variant = {
  id: string;
  product_id: string;
  sku: string;
  size: string;
  color: string;
  price: number | null;
  active: boolean;
  inventory: { on_hand: number; reserved: number } | null;
};
export type Product = {
  id: string;
  name: string;
  slug: string;
  sku: string;
  description: string;
  price: number;
  sale_price: number | null;
  status: string;
  seo_title?: string | null;
  seo_description?: string | null;
  featured: boolean;
  has_sizes?: boolean;
  tags: string[];
  category_id: string | null;
  created_at: string;
  product_images: {
    id: string;
    url: string;
    alt: string;
    position: number;
    view?: string | null;
    color?: string | null;
  }[];
  product_variants: Variant[];
  categories: { name: string; slug: string } | null;
};
export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string;
  image_url: string | null;
  position: number;
  visible: boolean;
};
export type Settings = {
  id: string;
  name: string;
  currency: string;
  logo_url: string | null;
  footer_links: { label: string; href: string }[];
  contact_email: string;
  contact_phone: string;
  announcement: string;
  shipping_fee: number;
  free_shipping_threshold: number;
  cod_enabled: boolean;
  max_cod_total: number;
  shipping_zones: { city: string; fee: number }[];
  homepage_sections: string[];
  navigation: { label: string; href: string }[];
};
export type CartLine = { variant_id: string; quantity: number };
export type Address = {
  id?: string;
  full_name: string;
  phone: string;
  line1: string;
  city: string;
  postal_code: string;
  email?: string;
};
export type Order = {
  id: string;
  reference: string;
  user_id: string | null;
  status: string;
  payment_status: string;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  address: Address;
  notes: string;
  tracking_number: string;
  courier: string;
  created_at: string;
  order_items: {
    id: string;
    product_name: string;
    sku: string;
    size: string;
    color: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }[];
};
export type ActionResult = {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
};
export type Feedback = {
  id: string;
  product_id: string;
  rating: number;
  content: string;
  approved: boolean;
  admin_reply: string;
  created_at: string;
  product_name?: string;
  order_id?: string | null;
};
export type OrderProgress = {
  status: string;
  history: {
    status: string;
    created_at: string;
    actor_id?: string | null;
    from?: string;
    reason?: string;
  }[];
  products: { product_id: string; product_name: string }[];
  feedback: Feedback[];
};
