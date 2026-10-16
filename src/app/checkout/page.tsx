import { currentUser } from "@/lib/auth";
import { db } from "@/lib/supabase/server";
import Link from "next/link";
import { CheckoutForm } from "@/components/checkout/form";
export const metadata = { title: "Checkout", robots: { index: false } };
export default async function Page() {
  const user = await currentUser();
  const { data, error } = user
    ? await (await db()).from("addresses").select("*").eq("user_id", user.id)
    : { data: [], error: null };
  if (error) throw new Error("Saved addresses could not be loaded.");
  return (
    <div className="section">
      <div className="catalog-heading">
        <p className="eyebrow">ALMOST YOURS</p>
        <h1>The finishing touches</h1>
      </div>
      {!user && (
        <div className="panel">
          <strong>Continue as Guest</strong>
          <p>
            No account or password needed.{" "}
            <Link href="/login?next=%2Fcheckout">Sign in</Link> or{" "}
            <Link href="/register?next=%2Fcheckout">create an account</Link> if
            you prefer.
          </p>
        </div>
      )}
      <CheckoutForm addresses={data ?? []} />
    </div>
  );
}
