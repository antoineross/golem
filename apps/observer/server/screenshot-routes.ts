import type { Hono } from "hono";
import fs from "node:fs";
import path from "node:path";
import type { ServerConfig } from "./config.ts";

const SCRAPER_URL = process.env.SCRAPER_URL ?? "http://scraper:8081";

export function registerScreenshotRoutes(app: Hono, config: ServerConfig): void {
  app.get("/api/screenshots", (c) => {
    try {
      const entries = fs.readdirSync(config.screenshotDir);
      const images = entries.filter((e) =>
        /\.(png|jpg|jpeg|gif|webp)$/i.test(e)
      );
      return c.json({ screenshots: images });
    } catch (e) {
      console.warn(`failed to read screenshot directory:`, e);
      return c.json({ screenshots: [] });
    }
  });

  app.get("/api/screenshots/:name", (c) => {
    const name = c.req.param("name");
    const filePath = path.resolve(config.screenshotDir, name);

    if (!filePath.startsWith(path.resolve(config.screenshotDir) + path.sep)) {
      return c.json({ error: "access denied" }, 403);
    }

    if (!fs.existsSync(filePath)) {
      return c.json({ error: "not found" }, 404);
    }

    const file = fs.readFileSync(filePath);
    const ext = path.extname(name).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
    };
    return c.body(file, 200, {
      "Content-Type": mimeMap[ext] ?? "application/octet-stream",
    });
  });

  app.get("/files/screenshots/:name", async (c) => {
    const name = c.req.param("name");
    if (!/^[\w\-. ]+\.(png|jpg|jpeg|gif|webp)$/i.test(name)) {
      return c.json({ error: "invalid filename" }, 400);
    }
    try {
      const upstream = await fetch(`${SCRAPER_URL}/files/screenshots/${encodeURIComponent(name)}`);
      if (!upstream.ok) {
        const status = upstream.status === 404 ? 404 : 502;
        return c.json({ error: status === 404 ? "screenshot not found" : "upstream error" }, status);
      }
      const contentType = upstream.headers.get("content-type") ?? "image/png";
      const buf = await upstream.arrayBuffer();
      return c.body(new Uint8Array(buf), 200, { "Content-Type": contentType });
    } catch (e) {
      console.warn("screenshot proxy failed:", e);
      return c.json({ error: "scraper unreachable" }, 502);
    }
  });
}
