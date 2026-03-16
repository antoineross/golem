import type { Hono } from "hono";
import fs from "node:fs";
import path from "node:path";
import type { ServerConfig } from "./config.ts";

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
}
