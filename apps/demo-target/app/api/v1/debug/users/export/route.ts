import { NextResponse } from "next/server";
import { appConfig, users } from "../../../../../data";

const DEBUG_KEY = appConfig.apiKey;

export async function GET(request: Request) {
  const key = request.headers.get("X-Debug-Key");
  if (!key || key !== DEBUG_KEY) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Valid X-Debug-Key header required" },
      { status: 401 },
    );
  }

  const exportData = users.map((u) => ({
    ...u,
    password_hash: `$2b$12$${Buffer.from(u.email).toString("base64").slice(0, 22)}`,
    last_login: new Date(Date.now() - Math.floor(Math.random() * 7 * 86400000)).toISOString(),
    ip_address: `10.0.${u.id}.${100 + u.id}`,
    sessions_active: Math.floor(Math.random() * 3) + 1,
    mfa_enabled: u.role === "admin",
    api_tokens: u.role === "admin"
      ? [`atok_${u.internal_id}_${Date.now().toString(36)}`]
      : [],
  }));

  return NextResponse.json({
    export_metadata: {
      generated_at: new Date().toISOString(),
      total_records: exportData.length,
      format: "full_dump",
      classification: "CONFIDENTIAL",
      requested_by: "debug_api",
    },
    users: exportData,
    sql_query: "SELECT *, password_hash, last_login_ip FROM users ORDER BY id ASC",
    warning: "This endpoint exposes PII. Restrict to internal networks only.",
  });
}
