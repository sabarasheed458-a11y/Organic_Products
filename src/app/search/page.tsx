import { CatalogView } from "@/components/storefront/catalog-view";
export const metadata = {
  title: "Search",
  robots: { index: false, follow: true },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <CatalogView params={await searchParams} />;
}
