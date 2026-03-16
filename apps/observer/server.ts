import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { streamSSE } from "hono/streaming";
import fs from "node:fs";
import path from "node:path";

const TRACE_FILE = process.env.TRACE_FILE ?? "../../tmp/tests/agent/agent_otel_spans.json";
const TRACE_DIR = process.env.TRACE_DIR ?? "../../tmp/tests";
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR ?? "../../tmp/screenshots";
const PORT = parseInt(process.env.PORT ?? "3001", 10);

const app = new Hono();
app.use("/*", cors());

function readTraceFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function findTraceFiles(dir: string): Array<{ name: string; path: string; modified: string }> {
  const results: Array<{ name: string; path: string; modified: string }> = [];

  function walk(current: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".json")) {
        const stat = fs.statSync(full);
        results.push({
          name: entry.name,
          path: full,
          modified: stat.mtime.toISOString(),
        });
      }
    }
  }

  walk(dir);
  return results.sort((a, b) => b.modified.localeCompare(a.modified));
}

app.get("/api/traces", (c) => {
  const files = findTraceFiles(TRACE_DIR);
  return c.json({ files, default_trace: TRACE_FILE });
});

app.get("/api/traces/:file{.+}", (c) => {
  const file = c.req.param("file");
  const filePath = path.resolve(file);

  if (!filePath.includes(path.resolve(TRACE_DIR)) && filePath !== path.resolve(TRACE_FILE)) {
    return c.json({ error: "access denied" }, 403);
  }

  const content = readTraceFile(filePath);
  if (!content) return c.json({ error: "file not found" }, 404);
  return c.json({ content, path: filePath });
});

app.get("/api/traces/default", (c) => {
  const content = readTraceFile(TRACE_FILE);
  if (!content) return c.json({ error: "default trace file not found" }, 404);
  return c.json({ content, path: TRACE_FILE });
});

app.get("/api/traces/stream", (c) => {
  return streamSSE(c, async (stream) => {
    let lastSize = 0;
    let running = true;

    stream.onAbort(() => {
      running = false;
    });

    while (running) {
      try {
        const stat = fs.statSync(TRACE_FILE);
        if (stat.size !== lastSize) {
          lastSize = stat.size;
          const content = readTraceFile(TRACE_FILE);
          if (content) {
            await stream.writeSSE({ data: content, event: "trace" });
          }
        }
      } catch {
        // File might not exist yet
      }
      await stream.sleep(2000);
    }
  });
});

app.get("/api/screenshots", (c) => {
  try {
    const entries = fs.readdirSync(SCREENSHOT_DIR);
    const images = entries.filter((e) =>
      /\.(png|jpg|jpeg|gif|webp)$/i.test(e)
    );
    return c.json({ screenshots: images });
  } catch {
    return c.json({ screenshots: [] });
  }
});

app.get("/api/screenshots/:name", (c) => {
  const name = c.req.param("name");
  const filePath = path.join(SCREENSHOT_DIR, name);

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

app.use("/*", serveStatic({ root: "./dist" }));
app.get("/*", serveStatic({ path: "./dist/index.html" }));

export default {
  port: PORT,
  fetch: app.fetch,
};

console.log(`observer server listening on http://localhost:${PORT}`);
