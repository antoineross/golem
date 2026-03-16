"use client";

import { useState } from "react";

const VALID_PASSWORD = "Spring2026_Audit";

export function RecoveryForm() {
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password === VALID_PASSWORD) {
      setResult({
        success: true,
        message: "Session recovered. Admin access granted. Token: adm_tok_7f3a9b2e4d1c.",
      });
    } else {
      setResult({
        success: false,
        message: "Invalid password. Access denied.",
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          Recovery Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Enter temporary password"
        />
      </div>
      <button
        type="submit"
        className="w-full px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        Recover Session
      </button>
      {result && (
        <div className={`p-3 rounded-lg text-sm ${
          result.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
        }`}>
          {result.message}
        </div>
      )}
    </form>
  );
}
