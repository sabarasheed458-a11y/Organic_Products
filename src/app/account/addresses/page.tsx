import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase/server";
import { AddressForm } from "@/components/account/forms";
export default async function Page() {
  const user = await requireUser();
  const { data, error } = await (
    await db()
  )
    .from("addresses")
    .select("*")
    .eq("user_id", user.id);
  if (error) throw new Error("Addresses could not be loaded.");
  return (
    <div className="narrow">
      <h1>Your addresses</h1>
      {data?.map((a) => (
        <AddressForm address={a} key={a.id} />
      ))}
      <AddressForm />
    </div>
  );
}
