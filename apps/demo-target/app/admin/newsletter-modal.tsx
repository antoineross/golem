"use client";

import { useState, useEffect } from "react";

export function NewsletterModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" id="newsletter-overlay">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-white rounded-xl shadow-2xl p-8 max-w-md w-full mx-4">
        <button
          onClick={() => setVisible(false)}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 text-2xl leading-none"
          aria-label="Close newsletter popup"
          id="close-modal"
        >
          &times;
        </button>
        <h2 className="text-2xl font-bold mb-2">Subscribe to our Newsletter!</h2>
        <p className="text-gray-600 text-sm mb-4">
          Get the latest updates on our products and exclusive deals delivered to your inbox.
        </p>
        <div className="flex gap-2">
          <input
            type="email"
            placeholder="your@email.com"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <button className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
            Subscribe
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-3">No spam. Unsubscribe anytime.</p>
      </div>
    </div>
  );
}
