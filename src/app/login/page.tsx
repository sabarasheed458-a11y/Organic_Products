import { AuthForm } from "@/components/account/auth-form";
export const metadata = { title: "login", robots: { index: false } };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const query = await searchParams;
  return <AuthForm mode="login" next={query.next} error={query.error} />;
}
