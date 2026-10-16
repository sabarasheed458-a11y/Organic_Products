import { AuthForm } from "@/components/account/auth-form";
export const metadata = { title: "forgot-password", robots: { index: false } };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return <AuthForm mode="forgot" next={(await searchParams).next} />;
}
