import type { Metadata } from "next";
import "./globals.css";
import "./storefront.css";
import { settings, categories } from "@/repositories/catalog";
import { currentUser } from "@/lib/auth";
import { ShoppingProvider } from "@/components/storefront/shopping-provider";
import { Header } from "@/components/storefront/header";
import Link from "next/link";
import Image from "next/image";
import logo from "../../Logo.jpeg";
import { brandName, brandSlogan } from "@/lib/branding";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: `${brandName} | ${brandSlogan}`,
    template: `%s | ${brandName}`,
  },
  description: `${brandName}. ${brandSlogan}`,
  openGraph: {
    title: brandName,
    description: brandSlogan,
    type: "website",
  },
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [s, c, user] = await Promise.all([
    settings(),
    categories(),
    currentUser(),
  ]);
  return (
    <html lang="en">
      <body>
        <ShoppingProvider key={user?.id ?? "guest"} userId={user?.id ?? null}>
          <a className="skip-link" href="#main">
            Skip to content
          </a>
          <Header settings={s} categories={c} />
          <main id="main">{children}</main>
          <footer>
            <div className="footer-top">
              <div>
                <Link className="wordmark" href="/">
                  <Image
                    className="brand-logo"
                    src={logo}
                    alt={brandName}
                    sizes="128px"
                  />
                </Link>
                <p>
                  {brandSlogan}
                </p>
              </div>
              <div>
                <h3>Discover</h3>
                <Link href="/collections/all">The collection</Link>
                <Link href="/wishlist">Your wishlist</Link>
                <Link href="/pages/about-us">Our story</Link>
              </div>
              <div>
                <h3>Here to help</h3>
                <Link href="/pages/contact">Contact us</Link>
                <Link href="/track-order">Track your order</Link>
                <Link href="/pages/faq">Frequently asked questions</Link>
              </div>
              <div>
                <h3>The details</h3>
                <Link href="/policies/shipping">Delivery</Link>
                <Link href="/policies/returns">Returns & exchanges</Link>
                <Link href="/policies/privacy">Privacy</Link>
                <Link href="/policies/terms">Terms of service</Link>
                {s.footer_links.map((link) => (
                  <Link key={link.href} href={link.href}>
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="footer-bottom">
              <span>
                © {new Date().getFullYear()} {brandName}
              </span>
              <span>Designed with intention · Pakistan</span>
              <span>
                {s.cod_enabled
                  ? "Cash on delivery"
                  : "Checkout temporarily paused"}
              </span>
            </div>
          </footer>
        </ShoppingProvider>
      </body>
    </html>
  );
}
