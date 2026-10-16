import { content } from "@/repositories/catalog";
import { notFound } from "next/navigation";
import Link from "next/link";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return {
    title: slug.replaceAll("-", " "),
    alternates: { canonical: "/policies/" + slug },
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!["shipping", "returns", "privacy", "terms"].includes(slug)) notFound();
  const p = await content(slug);
  return (
    <div className="section narrow">
      <p className="eyebrow">THE DETAILS</p>
      <h1>{p?.title ?? slug.charAt(0).toUpperCase() + slug.slice(1)}</h1>
      {p ? (
        <div className="prose whitespace">{p.content}</div>
      ) : (
        <div className="empty">
          This policy has not been published yet. Please{" "}
          <Link href="/pages/contact">contact the store</Link> before placing an
          order.
        </div>
      )}
    </div>
  );
}
