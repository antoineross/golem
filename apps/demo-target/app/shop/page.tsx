import { products } from "../data";
import { ShopClient } from "./shop-client";

export default function ShopPage() {
  return (
    <main className="max-w-6xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">Shop</h1>
      <ShopClient products={products} />
    </main>
  );
}
