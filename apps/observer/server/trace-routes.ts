import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import fs from "node:fs";
import path from "node:path";
import type { ServerConfig } from "./config.ts";
import {
  readTraceFile,
  readEventsFile,
  eventsPathForTrace,
  findTraceFiles,
} from "./config.ts";

export function registerTraceRoutes(app: Hono, config: ServerConfig): void {
  app.get("/api/traces", (c) => {
    const files = findTraceFiles(config.traceDir);
    return c.json({ files, default_trace: config.traceFile });
  });

  app.get("/api/traces/default", (c) => {
    const content = readTraceFile(config.traceFile);
    if (!content) return c.json({ error: "default trace file not found" }, 404);
    const events = readEventsFile(config.traceFile);
    return c.json({ content, events, path: config.traceFile });
  });

  app.get("/api/traces/:file{.+}", (c) => {
    const file = c.req.param("file");
    const filePath = path.resolve(file);

    const resolvedTraceDir = path.resolve(config.traceDir);
    if (!filePath.startsWith(resolvedTraceDir + path.sep) && filePath !== path.resolve(config.traceFile)) {
      return c.json({ error: "access denied" }, 403);
    }

    const content = readTraceFile(filePath);
    if (!content) return c.json({ error: "file not found" }, 404);
    const events = readEventsFile(filePath);
    return c.json({ content, events, path: filePath });
  });

  app.get("/api/traces/stream", (c) => {
    const fileParam = c.req.query("file");
    const targetFile = fileParam ? path.resolve(fileParam) : config.traceFile;

    if (fileParam) {
      const resolvedTraceDir = path.resolve(config.traceDir);
      if (!targetFile.startsWith(resolvedTraceDir + path.sep) && targetFile !== path.resolve(config.traceFile)) {
        return c.json({ error: "access denied" }, 403);
      }
    }

    return streamSSE(c, async (stream) => {
      let lastSize = 0;
      let lastEventsSize = 0;
      let running = true;

      stream.onAbort(() => {
        running = false;
      });

      while (running) {
        try {
          const stat = fs.statSync(targetFile);
          if (stat.size !== lastSize) {
            lastSize = stat.size;
            const content = readTraceFile(targetFile);
            if (content) {
              const events = readEventsFile(targetFile);
              await stream.writeSSE({ data: JSON.stringify({ content, events }), event: "trace" });
            }
          }
        } catch (e: unknown) {
          if (e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code !== "ENOENT") {
            console.warn(`trace file stat error:`, e);
          }
        }

        try {
          const eventsPath = eventsPathForTrace(targetFile);
          const stat = fs.statSync(eventsPath);
          if (stat.size !== lastEventsSize) {
            lastEventsSize = stat.size;
            const content = readTraceFile(targetFile);
            if (content) {
              const events = readEventsFile(targetFile);
              await stream.writeSSE({ data: JSON.stringify({ content, events }), event: "trace" });
            }
          }
        } catch {
          // events file may not exist yet
        }

        await stream.sleep(1000);
      }
    });
  });
}
