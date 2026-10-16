import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { signOut } from "@/actions/auth";
import { can } from "@/lib/utils";
import { brandName } from "@/lib/branding";
import {
  LayoutDashboard,
  Package,
  Layers,
  Boxes,
  ShoppingBag,
  Users,
  Tag,
  FileText,
  Settings,
  BarChart3,
  Shield,
  MessageSquare,
} from "lucide-react";
export const metadata = {
  title: "Staff dashboard",
  robots: { index: false, follow: false },
};
const links = [
  ["", "Overview", LayoutDashboard, ""],
  ["products", "Products", Package, "catalog"],
  ["feedback", "Feedback", MessageSquare, "catalog"],
  ["categories", "Categories", Layers, "catalog"],
  ["inventory", "Inventory", Boxes, "catalog"],
  ["orders", "Orders", ShoppingBag, "orders"],
  ["customers", "Customers", Users, "orders"],
  ["inquiries", "Inquiries", MessageSquare, "orders"],
  ["coupons", "Discounts", Tag, "settings"],
  ["promotions", "Promotions", Tag, "settings"],
  ["content", "Content", FileText, "settings"],
  ["settings", "Settings", Settings, "settings"],
  ["reports", "Reports", BarChart3, "settings"],
  ["staff", "Staff & access", Shield, "settings"],
] as const;
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/admin");
  if (user.profile.role === "customer") redirect("/account");
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div>
          <p className="eyebrow">{brandName}</p>
          <h2>Studio</h2>
          <p className="muted">{user.profile.role.replaceAll("_", " ")}</p>
        </div>
        <nav aria-label="Staff navigation">
          {links
            .filter((l) => !l[3] || can(user.profile.role, l[3]))
            .map(([path, label, Icon]) => (
              <Link key={path} href={"/admin" + (path ? "/" + path : "")}>
                <Icon size={18} />
                {label}
              </Link>
            ))}
        </nav>
        <Link href="/" className="text-link">
          ← View storefront
        </Link>
        <form action={signOut}>
          <button type="submit" className="btn btn-outline">
            Log out
          </button>
        </form>
      </aside>
      <div className="admin-main">
        <div className="admin-topbar">
          <span>Store management</span>
          <span>{user.profile.full_name}</span>
        </div>
        {children}
      </div>
    </div>
  );
}
