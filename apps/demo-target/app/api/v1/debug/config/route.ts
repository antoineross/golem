import { NextResponse } from "next/server";
import { appConfig } from "../../../../data";

const DEBUG_KEY = appConfig.apiKey;

export async function GET(request: Request) {
  const key = request.headers.get("X-Debug-Key");
  if (!key || key !== DEBUG_KEY) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Valid X-Debug-Key header required" },
      { status: 401 },
    );
  }

  return NextResponse.json({
    environment: "production",
    version: "3.2.1-hotfix",
    debug_mode: true,
    deployed_at: "2026-03-14T08:22:00Z",
    database: {
      host: "db.internal.company.com",
      port: 5432,
      name: "techshop_prod",
      user: "app_user",
      password: "p4ssw0rd_pr0d!",
    },
    redis: {
      url: "redis://cache.internal:6379",
      password: "r3d1s_s3cr3t",
    },
    auth: {
      jwt_secret: "HS256:super-secret-jwt-key-do-not-share",
      session_ttl: 86400,
      admin_override: true,
    },
    feature_flags: {
      debug_endpoints: true,
      export_enabled: true,
      rate_limiting: false,
    },
    debug_endpoints: [
      { path: "/api/v1/debug/config", method: "GET", description: "This endpoint (current)" },
      { path: "/api/v1/debug/users/export", method: "GET", description: "Full user data export" },
      { path: "/api/v1/orders/debug", method: "GET", description: "Order debug view" },
    ],
    internal_services: {
      payment_gateway: "https://pay.internal.company.com/v2",
      email_service: "smtp://mail.internal:587",
      storage: "s3://techshop-internal-assets",
    },
  });
}
