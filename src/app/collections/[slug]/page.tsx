import { CatalogView } from "@/components/storefront/catalog-view";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return {
    title: slug === "all" ? "The collection" : slug.replaceAll("-", " "),
    alternates: { canonical: "/collections/" + slug },
  };
}
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <CatalogView category={(await params).slug} params={await searchParams} />
  );
}
