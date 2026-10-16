import { AuthForm } from "@/components/account/auth-form";
export const metadata = { title: "register", robots: { index: false } };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return <AuthForm mode="register" next={(await searchParams).next} />;
}
