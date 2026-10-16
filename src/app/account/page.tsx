import { requireUser } from "@/lib/auth";
import { ProfileForm } from "@/components/account/forms";
import Link from "next/link";
export default async function Page() {
  const user = await requireUser();
  return (
    <div className="narrow">
      <p className="eyebrow">YOUR ACCOUNT</p>
      <h1>Hello, {user.profile.full_name || "there"}.</h1>
      <p className="muted">{user.email}</p>
      <ProfileForm name={user.profile.full_name} phone={user.profile.phone} />
      {user.profile.role !== "customer" && (
        <Link href="/admin" className="btn btn-outline">
          Open staff dashboard →
        </Link>
      )}
    </div>
  );
}
