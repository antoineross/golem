import Link from "next/link";
import { products } from "./data";
import { DebugLogger } from "./debug-logger";

export default function HomePage() {
  return (
    <main className="max-w-6xl mx-auto px-4 py-12">
      {/* Hidden admin link -- vuln: discoverable via DOM inspection */}
      <a href="/admin" style={{ display: "none" }}>Admin Panel</a>

      {/* HTML comment with debug info -- vuln: visible in page source */}
      {/* <!-- Debug: admin bypass available at /admin?bypass=true --> */}
      <div dangerouslySetInnerHTML={{ __html: "<!-- Debug: admin bypass available at /admin?bypass=true -->" }} />

      {/* Console log leak -- vuln: visible in browser console */}
      <DebugLogger />

      <section className="text-center mb-16">
        <h1 className="text-4xl font-bold mb-4">Welcome to TechShop</h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Your one-stop shop for premium tech accessories. Browse our curated collection of high-quality products.
        </p>
        <Link
          href="/shop"
          className="inline-block mt-6 px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          Browse Products
        </Link>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-8">Featured Products</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((product) => (
            <div key={product.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <div className="w-full h-40 bg-gray-100 rounded-md mb-4 flex items-center justify-center text-gray-400 text-sm">
                {product.name}
              </div>
              <h3 className="font-semibold text-lg">{product.name}</h3>
              <p className="text-gray-500 text-sm mt-1">{product.description}</p>
              <p className="text-blue-600 font-bold text-lg mt-3">${product.price.toFixed(2)}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
