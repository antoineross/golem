import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { streamSSE } from "hono/streaming";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const TRACE_FILE = path.resolve(SCRIPT_DIR, process.env.TRACE_FILE ?? "../../tmp/tests/agent/agent_otel_spans.json");
const TRACE_DIR = path.resolve(SCRIPT_DIR, process.env.TRACE_DIR ?? "../../tmp/tests");
const SCREENSHOT_DIR = path.resolve(SCRIPT_DIR, process.env.SCREENSHOT_DIR ?? "../../tmp/screenshots");
const REPO_ROOT = path.resolve(SCRIPT_DIR, process.env.REPO_ROOT ?? "../../");
const PORT = parseInt(process.env.PORT ?? "3000", 10);

type AgentStatus = "idle" | "running" | "complete" | "error";
let agentStatus: AgentStatus = "idle";
let agentError: string | null = null;
let agentTraceFile: string | null = null;

const app = new Hono();
app.use("/*", cors());

function readTraceFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function detectSource(filePath: string): "otel" | "thinking" {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const trimmed = content.trim();
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        if ("parts" in parsed && "thinking_level" in parsed) return "thinking";
      } catch {
        // not a single valid JSON object -- likely concatenated OTel spans
      }
    }
  } catch {
    // fall through
  }
  return "otel";
}

interface TraceFileMeta {
  name: string;
  path: string;
  modified: string;
  source: "otel" | "thinking";
}

function findTraceFiles(dir: string): TraceFileMeta[] {
  const results: TraceFileMeta[] = [];

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
          source: detectSource(full),
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

app.get("/api/traces/default", (c) => {
  const content = readTraceFile(TRACE_FILE);
  if (!content) return c.json({ error: "default trace file not found" }, 404);
  return c.json({ content, path: TRACE_FILE });
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

// --- Agent Runner ---

const SCENARIOS: Record<string, { name: string; harness: string; prompt?: string }> = {
  level0: {
    name: "Level 0: Echo + Payload",
    harness: "level0",
  },
  agent: {
    name: "Full Agent (default prompt)",
    harness: "agent",
  },
};

app.get("/api/agent/status", (c) => {
  return c.json({
    status: agentStatus,
    error: agentError,
    trace_file: agentTraceFile,
  });
});

app.get("/api/agent/scenarios", (c) => {
  return c.json({ scenarios: SCENARIOS });
});

app.post("/api/agent/run", async (c) => {
  if (agentStatus === "running") {
    return c.json({ error: "agent is already running" }, 409);
  }

  const body = await c.req.json().catch(() => ({}));
  const scenario = (body as Record<string, string>).scenario ?? "level0";
  const customPrompt = (body as Record<string, string>).prompt;

  const config = SCENARIOS[scenario];
  if (!config && !customPrompt) {
    return c.json({ error: `unknown scenario: ${scenario}` }, 400);
  }

  agentStatus = "running";
  agentError = null;

  const golemScript = path.join(REPO_ROOT, "golem");
  const harness = config?.harness ?? "agent";
  const args = ["e2e", harness];
  if (customPrompt) args.push(customPrompt);

  const traceDir = path.join(REPO_ROOT, "tmp", "tests", harness);
  const traceFile = harness === "level0"
    ? path.join(traceDir, "level0_otel_spans.json")
    : path.join(traceDir, "agent_otel_spans.json");
  agentTraceFile = traceFile;

  const child = spawn(golemScript, args, {
    cwd: REPO_ROOT,
    env: { ...process.env, GOLEM_TRACE_FILE: traceFile },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
  child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

  child.on("close", (code: number | null) => {
    if (code === 0) {
      agentStatus = "complete";
      agentError = null;
    } else {
      agentStatus = "error";
      agentError = `exit code ${code}: ${stderr.slice(-500)}`;
    }
    console.log(`agent run finished: status=${agentStatus}, code=${code}`);
    if (stdout) console.log(`stdout: ${stdout.slice(-200)}`);
  });

  return c.json({
    status: "running",
    scenario,
    trace_file: traceFile,
  });
});

// --- Static ---

app.use("/*", serveStatic({ root: "./dist" }));
app.get("/*", serveStatic({ path: "./dist/index.html" }));

export default {
  port: PORT,
  fetch: app.fetch,
};

console.log(`observer server listening on http://localhost:${PORT}`);
