"use client";

import { useEffect } from "react";

export function DebugLogger() {
  useEffect(() => {
    console.log("debug: session_token=abc123xyz");
  }, []);
  return null;
}
