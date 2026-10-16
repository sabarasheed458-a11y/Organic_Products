import { Bag } from "@/components/cart/bag";
export const metadata = { title: "Your bag", robots: { index: false } };
export default function Page() {
  return (
    <div className="section">
      <div className="catalog-heading">
        <p className="eyebrow">GOOD CHOICES, ALL YOURS</p>
        <h1>Your shopping bag</h1>
      </div>
      <Bag />
    </div>
  );
}
