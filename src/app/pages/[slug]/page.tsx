import { content, settings } from "@/repositories/catalog";
import { ContactForm } from "@/components/account/forms";
import { notFound } from "next/navigation";
import { brandName } from "@/lib/branding";
const defaults: Record<string, { title: string; content: string }> = {
  "about-us": {
    title: "About us",
    content:
      `${brandName} brings together products for everyday living. Our goal is to make it easy to explore the range, learn about each product, and place an order with confidence.`,
  },
  faq: {
    title: "A few helpful answers.",
    content:
      "How can I pay?\nCash on delivery is available where supported. Final availability and charges are shown at checkout.\n\nWhere is my order?\nSign in and use Track your order with your order reference. Courier details appear after dispatch.\n\nCan I change my order?\nContact us promptly with your reference. We will confirm whether your order can still be changed.\n\nHow do I choose a size?\nSelect a size and colour on the product page. If you need help, send us a message.",
  },
  contact: {
    title: "We’re here for you.",
    content:
      "A question about a product, a delivery, or something else? Send us a note and our team will help.",
  },
};
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return {
    title: defaults[slug]?.title ?? slug.replaceAll("-", " "),
    alternates: { canonical: "/pages/" + slug },
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = (await content(slug)) ?? defaults[slug];
  if (!page) notFound();
  const s = await settings();
  return (
    <div className="section narrow">
      <p className="eyebrow">{brandName}</p>
      <h1>{page.title}</h1>
      <div className="prose whitespace">{page.content}</div>
      {slug === "contact" && (
        <>
          {s.contact_email && (
            <p>
              <a href={"mailto:" + s.contact_email}>{s.contact_email}</a>
            </p>
          )}
          {s.contact_phone && <p>{s.contact_phone}</p>}
          <ContactForm />
        </>
      )}
    </div>
  );
}
