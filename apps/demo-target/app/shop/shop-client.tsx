"use client";

import { useState } from "react";
import type { Product } from "../data";

interface CartItem {
  product: Product;
  quantity: number;
}

export function ShopClient({ products }: { products: Product[] }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutResult, setCheckoutResult] = useState<string | null>(null);

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) {
        return prev.map((c) =>
          c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }

  function removeFromCart(productId: number) {
    setCart((prev) => prev.filter((c) => c.product.id !== productId));
  }

  // VULNERABILITY: client-side price calculation, no server validation
  const total = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  async function handleCheckout() {
    const items = cart.map((c) => ({
      id: c.product.id,
      name: c.product.name,
      price: c.product.price,
      quantity: c.quantity,
    }));

    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, total }),
    });

    const data = await res.json();
    setCheckoutResult(data.message);
    if (data.orderId) {
      setCart([]);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {products.map((product) => (
            <div key={product.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="w-full h-40 bg-gray-100 rounded-md mb-4 flex items-center justify-center text-gray-400 text-sm">
                {product.name}
              </div>
              <h3 className="font-semibold text-lg">{product.name}</h3>
              <p className="text-gray-500 text-sm mt-1">{product.description}</p>
              <div className="flex items-center justify-between mt-4">
                <span className="text-blue-600 font-bold text-lg" data-price={product.price}>
                  ${product.price.toFixed(2)}
                </span>
                <button
                  onClick={() => addToCart(product)}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Add to Cart
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-fit sticky top-4">
        <h2 className="text-xl font-bold mb-4">Cart</h2>

        {/* VULNERABILITY: hidden discount input */}
        <input type="hidden" name="discount" value="0" />

        {cart.length === 0 ? (
          <p className="text-gray-500">Your cart is empty</p>
        ) : (
          <>
            {cart.map((item) => (
              <div key={item.product.id} className="flex items-center justify-between py-3 border-b border-gray-100">
                <div>
                  <p className="font-medium text-sm">{item.product.name}</p>
                  <p className="text-gray-500 text-xs">Qty: {item.quantity} x ${item.product.price.toFixed(2)}</p>
                </div>
                <button
                  onClick={() => removeFromCart(item.product.id)}
                  className="text-red-500 text-xs hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            ))}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex justify-between font-bold text-lg">
                <span>Total:</span>
                <span id="cart-total" data-total={total}>${total.toFixed(2)}</span>
              </div>
              <button
                onClick={handleCheckout}
                className="w-full mt-4 px-4 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
              >
                Checkout
              </button>
            </div>
          </>
        )}

        {checkoutResult && (
          <div className="mt-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm">
            {checkoutResult}
          </div>
        )}
      </div>
    </div>
  );
}
