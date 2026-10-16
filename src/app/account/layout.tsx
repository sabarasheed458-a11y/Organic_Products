import { requireUser } from "@/lib/auth";
import { signOut } from "@/actions/auth";
import Link from "next/link";
export const metadata = { title: "Your account", robots: { index: false } };
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return (
    <div className="section">
      <div className="account-nav">
        <Link href="/account">Profile</Link>
        <Link href="/account/orders">Orders</Link>
        <Link href="/account/addresses">Addresses</Link>
        <form action={signOut}>
          <button className="text-link">Sign out</button>
        </form>
      </div>
      {children}
    </div>
  );
}
