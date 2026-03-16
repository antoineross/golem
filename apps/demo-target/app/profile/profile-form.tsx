"use client";

import { useState } from "react";

export function ProfileForm() {
  const [name, setName] = useState("Bob Builder");
  const [email, setEmail] = useState("bob@company.com");
  const [result, setResult] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const body = {
      name: formData.get("name"),
      email: formData.get("email"),
      role: formData.get("role"),
    };

    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    setResult(data.message);
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            id="name"
            name="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* VULNERABILITY: hidden role field -- can be modified via DOM */}
        <input type="hidden" name="role" value="user" />

        <button
          type="submit"
          className="w-full px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Update Profile
        </button>
      </form>

      {/* VULNERABILITY: disabled button with opacity:0 -- discoverable via DOM */}
      <button
        disabled
        id="delete-all-btn"
        style={{ opacity: 0 }}
        className="mt-4 w-full px-4 py-3 bg-red-600 text-white font-medium rounded-lg"
      >
        Delete All Users
      </button>

      {result && (
        <div className="mt-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm">
          {result}
        </div>
      )}
    </div>
  );
}
