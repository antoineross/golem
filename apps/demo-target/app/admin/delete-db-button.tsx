"use client";

import { useState } from "react";

export function DeleteDbButton() {
  const [result, setResult] = useState<string | null>(null);

  async function handleDelete() {
    const res = await fetch("/api/admin/delete-db", { method: "POST" });
    const data = await res.json();
    setResult(data.message);
  }

  return (
    <div className="mt-6">
      <button
        onClick={handleDelete}
        className="px-6 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors"
        id="delete-db-btn"
      >
        Delete Database
      </button>
      {result && (
        <div className="mt-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {result}
        </div>
      )}
    </div>
  );
}
