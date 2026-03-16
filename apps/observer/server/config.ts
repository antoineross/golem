import fs from "node:fs";
import path from "node:path";

export interface ServerConfig {
  scriptDir: string;
  traceFile: string;
  traceDir: string;
  screenshotDir: string;
  repoRoot: string;
  port: number;
  demoTargetUrl: string;
  golemApiUrl: string | null;
}

export function createConfig(): ServerConfig {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const baseDir = path.resolve(scriptDir, "..");
  return {
    scriptDir: baseDir,
    traceFile: path.resolve(baseDir, process.env.TRACE_FILE ?? "../../tmp/tests/agent/agent_otel_spans.json"),
    traceDir: path.resolve(baseDir, process.env.TRACE_DIR ?? "../../tmp/tests"),
    screenshotDir: path.resolve(baseDir, process.env.SCREENSHOT_DIR ?? "../../tmp/screenshots"),
    repoRoot: path.resolve(baseDir, process.env.REPO_ROOT ?? "../../"),
    port: parseInt(process.env.PORT ?? "3000", 10),
    demoTargetUrl: process.env.DEMO_TARGET_URL ?? "http://host.docker.internal:4000",
    golemApiUrl: process.env.GOLEM_API_URL ?? null,
  };
}

// --- Shared agent state ---

export type AgentStatus = "idle" | "running" | "complete" | "error";

interface AgentState {
  status: AgentStatus;
  error: string | null;
  traceFile: string | null;
}

const agentState: AgentState = {
  status: "idle",
  error: null,
  traceFile: null,
};

export function getAgentState(): Readonly<AgentState> {
  return agentState;
}

export function setAgentState(update: Partial<AgentState>): void {
  if (update.status !== undefined) agentState.status = update.status;
  if (update.error !== undefined) agentState.error = update.error;
  if (update.traceFile !== undefined) agentState.traceFile = update.traceFile;
}

// --- Shared file helpers ---

export function readTraceFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (e) {
    console.warn(`failed to read trace file ${filePath}:`, e);
    return null;
  }
}

export function eventsPathForTrace(tracePath: string): string {
  const ext = path.extname(tracePath);
  const base = tracePath.slice(0, tracePath.length - ext.length);
  return base + "_events.jsonl";
}

export function readEventsFile(tracePath: string): string | null {
  const eventsPath = eventsPathForTrace(tracePath);
  try {
    return fs.readFileSync(eventsPath, "utf-8");
  } catch {
    return null;
  }
}

// --- Trace discovery helpers ---

export function detectSource(filePath: string): "otel" | "thinking" {
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

export interface TraceFileMeta {
  name: string;
  display_name: string;
  path: string;
  modified: string;
  source: "otel" | "thinking";
  harness: string;
  has_events: boolean;
}

export function deriveHarness(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.includes("level1a")) return "level1a";
  if (lower.includes("level1b")) return "level1b";
  if (lower.includes("level2")) return "level2";
  if (lower.includes("level0")) return "level0";
  if (lower.includes("/thinking/")) return "thinking";
  if (lower.includes("/agent/")) return "agent";
  return "trace";
}

export function deriveDisplayName(_fileName: string, filePath: string, modified: string): string {
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

export function findTraceFiles(dir: string): TraceFileMeta[] {
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
