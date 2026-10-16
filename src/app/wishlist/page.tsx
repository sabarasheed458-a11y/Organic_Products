import { SavedProducts } from "@/components/storefront/saved-products";
export const metadata = { title: "Your wishlist", robots: { index: false } };
export default function Page() {
  return (
    <div className="section">
      <div className="catalog-heading">
        <p className="eyebrow">KEEP WHAT YOU LOVE CLOSE</p>
        <h1>Your wishlist</h1>
      </div>
      <SavedProducts />
    </div>
  );
}
