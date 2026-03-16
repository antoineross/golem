"use client";

import { useState } from "react";

const chatMessages = [
  { from: "User", time: "09:14", text: "Hi, I'm locked out of my admin account." },
  { from: "Support", time: "09:15", text: "Let me check your account status." },
  { from: "Support", time: "09:16", text: "I see the issue. Your session expired during the audit window." },
  { from: "System", time: "09:16", text: "Temporary admin access granted for session recovery. Password: Spring2026_Audit. Please navigate to /internal/recovery to use." },
  { from: "Support", time: "09:17", text: "You should be all set now. Let me know if you need anything else." },
  { from: "User", time: "09:18", text: "Got it, thanks!" },
];

export function SupportFab() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gray-700 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-600 transition-colors z-50"
        aria-label="Support Console"
        id="support-fab"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 w-96 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden" id="support-console">
          <div className="bg-gray-800 text-white px-4 py-3 flex items-center justify-between">
            <span className="font-medium text-sm">Support Console</span>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white text-lg">&times;</button>
          </div>
          <div className="p-4 max-h-80 overflow-y-auto space-y-3">
            <p className="text-xs text-gray-400 text-center">Chat History -- Ticket #4821</p>
            {chatMessages.map((msg, i) => (
              <div key={i} className={`text-sm ${msg.from === "System" ? "bg-yellow-50 border border-yellow-200 rounded p-2" : ""}`}>
                <span className={`font-medium ${
                  msg.from === "System" ? "text-yellow-700" :
                  msg.from === "Support" ? "text-blue-600" :
                  "text-gray-700"
                }`}>
                  [{msg.time}] {msg.from}:
                </span>{" "}
                <span className={msg.from === "System" ? "text-yellow-800 font-mono text-xs" : "text-gray-600"}>
                  {msg.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
