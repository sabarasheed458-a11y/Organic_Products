import "server-only";
import { db, configured } from "@/lib/supabase/server";
import { can } from "@/lib/utils";
import { redirect } from "next/navigation";
import { PublicError } from "@/lib/security/errors";
export async function currentUser() {
  if (!configured()) return null;
  const client = await db();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  const { data: profile, error } = await client
    .from("profiles")
    .select("id,full_name,phone,role,active")
    .eq("id", user.id)
    .single();
  if (error || !profile?.active) return null;
  return { ...user, profile };
}
export async function requireUser(next?: string) {
  const user = await currentUser();
  if (!user)
    redirect(next ? "/login?next=" + encodeURIComponent(next) : "/login");
  return user;
}
export async function staff(scope?: string) {
  const user = await currentUser();
  if (
    !user ||
    user.profile.role === "customer" ||
    (scope && !can(user.profile.role, scope))
  )
    throw new PublicError("You do not have permission for this action.");
  return user;
}
export async function requireStaff(scope?: string) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/admin");
  if (user.profile.role === "customer") redirect("/account");
  if (scope && !can(user.profile.role, scope)) redirect("/admin?denied=1");
  return user;
}
