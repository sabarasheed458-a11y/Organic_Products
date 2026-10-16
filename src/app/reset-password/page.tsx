import { AuthForm } from "@/components/account/auth-form";
export const metadata = { title: "reset-password", robots: { index: false } };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return <AuthForm mode="reset" next={(await searchParams).next} />;
}
