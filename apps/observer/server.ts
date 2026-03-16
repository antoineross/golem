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
const RUNNER_ENABLED = (process.env.RUNNER_ENABLED ?? "true") !== "false";

type AgentStatus = "idle" | "running" | "complete" | "error";
let agentStatus: AgentStatus = "idle";
let agentError: string | null = null;
let agentTraceFile: string | null = null;

const app = new Hono();
app.use("/*", cors());

function readTraceFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (e) {
    console.warn(`failed to read trace file ${filePath}:`, e);
    return null;
  }
}

function eventsPathForTrace(tracePath: string): string {
  const ext = path.extname(tracePath);
  const base = tracePath.slice(0, tracePath.length - ext.length);
  return base + "_events.jsonl";
}

function readEventsFile(tracePath: string): string | null {
  const eventsPath = eventsPathForTrace(tracePath);
  try {
    return fs.readFileSync(eventsPath, "utf-8");
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
  display_name: string;
  path: string;
  modified: string;
  source: "otel" | "thinking";
  harness: string;
  has_events: boolean;
}

function deriveDisplayName(fileName: string, filePath: string, modified: string): string {
  const harness = deriveHarness(filePath);
  const labels: Record<string, string> = {
    level0: "Level 0",
    level1a: "Level 1a",
    level1b: "Level 1b",
    level2: "Level 2",
    thinking: "Thinking",
    agent: "Agent",
    trace: "Trace",
  };
  const label = labels[harness] ?? harness;
  const date = new Date(modified);
  const time = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${label} run -- ${time}`;
}

function deriveHarness(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.includes("level1a")) return "level1a";
  if (lower.includes("level1b")) return "level1b";
  if (lower.includes("level2")) return "level2";
  if (lower.includes("level0")) return "level0";
  if (lower.includes("/thinking/")) return "thinking";
  if (lower.includes("/agent/")) return "agent";
  return "trace";
}

function findTraceFiles(dir: string): TraceFileMeta[] {
  const results: TraceFileMeta[] = [];

  function walk(current: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (e) {
      console.warn(`failed to read directory ${current}:`, e);
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".json")) {
        const stat = fs.statSync(full);
        const modified = stat.mtime.toISOString();
        const eventsPath = eventsPathForTrace(full);
        const hasEvents = fs.existsSync(eventsPath);
        results.push({
          name: entry.name,
          display_name: deriveDisplayName(entry.name, full, modified),
          path: full,
          modified,
          source: detectSource(full),
          harness: deriveHarness(full),
          has_events: hasEvents,
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
  const events = readEventsFile(TRACE_FILE);
  return c.json({ content, events, path: TRACE_FILE });
});

app.get("/api/traces/:file{.+}", (c) => {
  const file = c.req.param("file");
  const filePath = path.resolve(file);

  const resolvedTraceDir = path.resolve(TRACE_DIR);
  if (!filePath.startsWith(resolvedTraceDir + path.sep) && filePath !== path.resolve(TRACE_FILE)) {
    return c.json({ error: "access denied" }, 403);
  }

  const content = readTraceFile(filePath);
  if (!content) return c.json({ error: "file not found" }, 404);
  const events = readEventsFile(filePath);
  return c.json({ content, events, path: filePath });
});

app.get("/api/traces/stream", (c) => {
  const fileParam = c.req.query("file");
  const targetFile = fileParam ? path.resolve(fileParam) : TRACE_FILE;

  if (fileParam) {
    const resolvedTraceDir = path.resolve(TRACE_DIR);
    if (!targetFile.startsWith(resolvedTraceDir + path.sep) && targetFile !== path.resolve(TRACE_FILE)) {
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

app.get("/api/screenshots", (c) => {
  try {
    const entries = fs.readdirSync(SCREENSHOT_DIR);
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
  const filePath = path.resolve(SCREENSHOT_DIR, name);

  if (!filePath.startsWith(path.resolve(SCREENSHOT_DIR) + path.sep)) {
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

// --- Agent Runner ---

interface ScenarioConfig {
  name: string;
  harness: string;
  description: string;
  prompt: string;
  tools: string[];
  requires_scraper: boolean;
}

const DEMO_TARGET_URL = process.env.DEMO_TARGET_URL ?? "http://host.docker.internal:4000";

const SCENARIOS: Record<string, ScenarioConfig> = {
  level0: {
    name: "Level 0: Echo + Payload",
    harness: "level0",
    description: "Validates the agent tool-call loop works. The agent echoes a message and lists available security payload categories. No external services required.",
    prompt: "Echo 'hello' to verify tool calling works, then list the available payload categories.",
    tools: ["echo", "payload"],
    requires_scraper: false,
  },
  level1a: {
    name: "Level 1a: Multi-step UI Interaction",
    harness: "level1a",
    description: "Find the floating action button (FAB), click it, read support chat history, extract leaked credentials and hidden URLs, then use them to gain access.",
    prompt: `You are auditing ${DEMO_TARGET_URL}. Find the FAB, click it, read the chat, extract credentials and hidden URLs, navigate to the discovered URL and use credentials to gain access.`,
    tools: ["echo", "payload", "browse", "screenshot", "click", "find_hidden"],
    requires_scraper: true,
  },
  level1b: {
    name: "Level 1b: Visual Reasoning (Canvas)",
    harness: "level1b",
    description: "Navigate to /system-health, take a screenshot, analyze canvas-rendered alerts for hidden API endpoints, then call those endpoints to check for data leaks.",
    prompt: `You are auditing ${DEMO_TARGET_URL}. Navigate to ${DEMO_TARGET_URL}/system-health, screenshot the page, analyze visual content for hidden API endpoints, then call them.`,
    tools: ["echo", "payload", "browse", "screenshot", "find_hidden"],
    requires_scraper: true,
  },
  level2: {
    name: "Level 2: Spatial Reasoning (Modal)",
    harness: "level2",
    description: "Navigate to /admin, find the 'Delete Database' button blocked by a modal popup. Close the modal first, then interact with the delete button.",
    prompt: `You are auditing ${DEMO_TARGET_URL}. Navigate to ${DEMO_TARGET_URL}/admin, find the Delete Database button, close the blocking modal, click delete, and report findings.`,
    tools: ["echo", "payload", "browse", "screenshot", "click", "find_hidden"],
    requires_scraper: true,
  },
  agent: {
    name: "Full Agent Run",
    harness: "agent",
    description: "Runs the full security auditor agent against the default target. Uses all available tools via the Supacrawl scraper.",
    prompt: "Browse https://example.com and describe what you see.",
    tools: ["echo", "payload", "browse", "screenshot", "click", "find_hidden"],
    requires_scraper: true,
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
  return c.json({ scenarios: SCENARIOS, runner_enabled: RUNNER_ENABLED });
});

app.post("/api/agent/run", async (c) => {
  if (!RUNNER_ENABLED) {
    return c.json(
      { error: "Scenario runner is disabled in this environment. Use './golem e2e <level>' from the host CLI." },
      503,
    );
  }

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
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const traceFile = path.join(traceDir, `${harness}_${ts}_otel_spans.json`);
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
