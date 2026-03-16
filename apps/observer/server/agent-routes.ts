import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ServerConfig } from "./config.ts";
import { getAgentState, setAgentState, eventsPathForTrace } from "./config.ts";

interface ScenarioConfig {
  name: string;
  harness: string;
  description: string;
  prompt: string;
  tools: string[];
  requires_scraper: boolean;
}

function buildScenarios(demoTargetUrl: string): Record<string, ScenarioConfig> {
  return {
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
      prompt: `You are auditing ${demoTargetUrl}. Find the FAB, click it, read the chat, extract credentials and hidden URLs, navigate to the discovered URL and use credentials to gain access.`,
      tools: ["echo", "payload", "browse", "screenshot", "click", "find_hidden"],
      requires_scraper: true,
    },
    level1b: {
      name: "Level 1b: Visual Reasoning (Canvas)",
      harness: "level1b",
      description: "Navigate to /system-health, take a screenshot, analyze canvas-rendered alerts for hidden API endpoints, then call those endpoints to check for data leaks.",
      prompt: `You are auditing ${demoTargetUrl}. Navigate to ${demoTargetUrl}/system-health, screenshot the page, analyze visual content for hidden API endpoints, then call them.`,
      tools: ["echo", "payload", "browse", "screenshot", "find_hidden", "api_call"],
      requires_scraper: true,
    },
    level2: {
      name: "Level 2: Spatial Reasoning (Modal)",
      harness: "level2",
      description: "Navigate to /admin, find the 'Delete Database' button blocked by a modal popup. Close the modal first, then interact with the delete button.",
      prompt: `You are auditing ${demoTargetUrl}. Navigate to ${demoTargetUrl}/admin, find the Delete Database button, close the blocking modal, click delete, and report findings.`,
      tools: ["echo", "payload", "browse", "screenshot", "click", "find_hidden"],
      requires_scraper: true,
    },
    level3: {
      name: "Level 3: Config Leak to Data Exfiltration",
      harness: "level3",
      description: "Discover leaked API key in frontend config, use it to authenticate against debug endpoints, and exfiltrate sensitive data. Tests hypothesis-driven investigation: Observe -> Hypothesize -> Test -> Exploit -> Report.",
      prompt: `You are a security auditor investigating ${demoTargetUrl} for data exposure vulnerabilities.

Step 1 - RECONNAISSANCE: Browse ${demoTargetUrl}. Take a screenshot of the homepage for evidence. Use find_hidden to scan for hidden elements, leaked config, and debug attributes in the HTML source.

Step 2 - DISCOVERY: Look carefully for any API keys, debug flags, or endpoint references in the page source (especially script tags, data attributes, HTML comments). State each finding clearly.

Step 3 - HYPOTHESIS: Based on what you found, form a hypothesis about what debug endpoints might exist and how discovered credentials could be used.

Step 4 - EXPLOITATION: Use api_call to test your hypotheses. Try the discovered endpoints with the credentials you found (e.g., set the API key as an X-Debug-Key header). If a response reveals more endpoints, follow those leads. Take screenshots of key pages as visual evidence.

Step 5 - REPORT: Produce a structured vulnerability report for each finding. Include severity, title, evidence (API response data and screenshots), and the full exploit chain.`,
      tools: ["echo", "payload", "browse", "screenshot", "find_hidden", "api_call"],
      requires_scraper: true,
    },
    agent: {
      name: "Full Agent Run",
      harness: "agent",
      description: "Runs the full security auditor agent against the default target.",
      prompt: "Browse https://example.com and describe what you see.",
      tools: ["echo", "payload", "browse", "screenshot", "click", "find_hidden", "api_call"],
      requires_scraper: true,
    },
  };
}

// Maps a trace file path from golem's mount namespace to the observer's.
// e.g. /data/traces/agent/file.json -> /observer/traces/agent/file.json
function mapGolemPathToLocal(golemPath: string, localTraceDir: string): string {
  if (!golemPath) return "";
  // Find the harness directory and filename after the base trace dir.
  // Golem paths look like: /data/traces/<harness>/<file>.json
  // We need: <localTraceDir>/<harness>/<file>.json
  // Strategy: take everything after the third slash-separated segment
  // that matches a common trace dir pattern (/data/traces/, /data/tmp/tests/, etc.)
  const traceMarkers = ["/traces/", "/tests/"];
  for (const marker of traceMarkers) {
    const idx = golemPath.indexOf(marker);
    if (idx !== -1) {
      const relative = golemPath.slice(idx + marker.length);
      return path.join(localTraceDir, relative);
    }
  }
  // Fallback: use just the filename under localTraceDir
  return path.join(localTraceDir, path.basename(golemPath));
}

async function startRunViaGolemApi(
  golemApiUrl: string,
  prompt: string,
  harness: string,
  apiKey?: string,
  model?: string,
): Promise<{ ok: boolean; error?: string; trace_file?: string }> {
  try {
    const payload: Record<string, string> = { prompt, harness };
    if (apiKey) payload.api_key = apiKey;
    if (model) payload.model = model;
    const resp = await fetch(`${golemApiUrl}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const body = await resp.text();
      return { ok: false, error: `golem API returned ${resp.status}: ${body}` };
    }
    const data = await resp.json() as { trace_file?: string };
    return { ok: true, trace_file: data.trace_file };
  } catch (e) {
    return { ok: false, error: `golem API unreachable: ${e}` };
  }
}

function startRunViaSpawn(
  config: ServerConfig,
  harness: string,
  prompt: string,
  traceFile: string,
  apiKey?: string,
  model?: string,
): void {
  const golemScript = path.join(config.repoRoot, "golem");
  const args = ["e2e", harness];
  if (prompt) args.push(prompt);

  const env = { ...process.env, GOLEM_TRACE_FILE: traceFile } as NodeJS.ProcessEnv;
  if (apiKey) env.GOOGLE_API_KEY = apiKey;
  if (model) env.DEFAULT_LLM_MODEL = model;

  const child = spawn(golemScript, args, {
    cwd: config.repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  const STDERR_CAP = 4096;
  child.stdout.on("data", () => {});
  child.stderr.on("data", (d: Buffer) => {
    stderr += d.toString();
    if (stderr.length > STDERR_CAP) stderr = stderr.slice(-STDERR_CAP);
  });

  child.on("close", (code: number | null) => {
    if (code === 0) {
      setAgentState({ status: "complete", error: null });
    } else {
      setAgentState({ status: "error", error: `exit code ${code}: ${stderr.slice(-500)}` });
    }
    console.log(`agent run finished: status=${getAgentState().status}, code=${code}`);
  });
}

async function pollGolemStatus(golemApiUrl: string, expectedTraceFile: string): Promise<void> {
  const MAX_POLL_MS = 10 * 60 * 1000;
  const startTime = Date.now();
  const poll = async () => {
    if (Date.now() - startTime > MAX_POLL_MS) {
      setAgentState({ status: "error", error: "poll timeout: agent did not complete within 10 minutes" });
      return;
    }
    if (getAgentState().status !== "running") return;
    try {
      const resp = await fetch(`${golemApiUrl}/api/status`);
      if (!resp.ok) {
        setTimeout(poll, 1000);
        return;
      }
      const data = await resp.json() as { status: string; error?: string; trace_file?: string };
      if (data.trace_file && data.trace_file !== expectedTraceFile) {
        setTimeout(poll, 500);
        return;
      }
      if (data.status === "complete") {
        setAgentState({ status: "complete", error: null });
      } else if (data.status === "error") {
        setAgentState({ status: "error", error: data.error ?? "unknown error" });
      } else {
        setTimeout(poll, 500);
      }
    } catch {
      setTimeout(poll, 1000);
    }
  };
  setTimeout(poll, 500);
}

export function registerAgentRoutes(app: Hono, config: ServerConfig): void {
  const SCENARIOS = buildScenarios(config.demoTargetUrl);
  const useGolemApi = Boolean(config.golemApiUrl);

  if (useGolemApi) {
    console.log(`agent routes: using golem API at ${config.golemApiUrl}`);
  } else {
    console.log("agent routes: using local spawn (dev mode)");
  }

  app.get("/api/agent/status", async (c) => {
    if (useGolemApi && getAgentState().status === "running") {
      try {
        const resp = await fetch(`${config.golemApiUrl}/api/status`);
        if (resp.ok) {
          const remote = await resp.json() as { status: string; error?: string };
          if (remote.status === "complete" || remote.status === "error") {
            setAgentState({
              status: remote.status as "complete" | "error",
              error: remote.error ?? null,
            });
          }
        }
      } catch {
        // fall through to local state
      }
    }
    const state = getAgentState();
    return c.json({
      status: state.status,
      error: state.error,
      trace_file: state.traceFile,
    });
  });

  app.post("/api/agent/stop", async (c) => {
    if (useGolemApi) {
      try {
        const resp = await fetch(`${config.golemApiUrl}/api/stop`, { method: "POST" });
        if (resp.ok) {
          setAgentState({ status: "idle", error: "agent stopped by user" });
          return c.json({ status: "stopped" });
        }
        const body = await resp.text();
        return c.json({ error: body }, resp.status as 409);
      } catch (e) {
        return c.json({ error: `golem API unreachable: ${e}` }, 502);
      }
    }
    if (getAgentState().status === "running") {
      setAgentState({ status: "idle", error: "agent stopped by user" });
      return c.json({ status: "stopped" });
    }
    return c.json({ error: "no agent running" }, 409);
  });

  app.get("/api/agent/scenarios", (c) => {
    return c.json({ scenarios: SCENARIOS });
  });

  app.post("/api/agent/run", async (c) => {
    const state = getAgentState();
    if (state.status === "running") {
      return c.json({ error: "agent is already running" }, 409);
    }

    const body = await c.req.json().catch(() => ({}));
    const scenario = typeof body?.scenario === "string" ? body.scenario : "level0";
    const customPrompt = typeof body?.prompt === "string" ? body.prompt : undefined;
    const userApiKey = typeof body?.api_key === "string" ? body.api_key : undefined;
    const rawModel = typeof body?.model === "string" ? body.model.trim() : "";
    const userModel = rawModel.length > 0 && rawModel.length <= 100 ? rawModel : undefined;

    const scenarioConfig = SCENARIOS[scenario];
    if (!scenarioConfig && !customPrompt) {
      return c.json({ error: `unknown scenario: ${scenario}` }, 400);
    }

    const harness = scenarioConfig?.harness ?? "agent";
    const prompt = customPrompt ?? scenarioConfig?.prompt ?? "";

    if (useGolemApi) {
      setAgentState({ status: "running", error: null, traceFile: null });

      const result = await startRunViaGolemApi(config.golemApiUrl!, prompt, harness, userApiKey, userModel);
      if (!result.ok) {
        setAgentState({ status: "error", error: result.error ?? "failed to start agent" });
        return c.json({ error: result.error }, 502);
      }

      const golemTraceFile = result.trace_file ?? "";
      const localTraceFile = mapGolemPathToLocal(golemTraceFile, config.traceDir);
      setAgentState({ status: "running", error: null, traceFile: localTraceFile });
      pollGolemStatus(config.golemApiUrl!, golemTraceFile);

      return c.json({
        status: "running",
        scenario,
        trace_file: localTraceFile,
      });
    }

    const traceDir = path.join(config.traceDir, harness);
    try { fs.mkdirSync(traceDir, { recursive: true }); } catch {}
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const traceFile = path.join(traceDir, `${harness}_${ts}_otel_spans.json`);

    setAgentState({ status: "running", error: null, traceFile });

    startRunViaSpawn(config, harness, prompt, traceFile, userApiKey, userModel);

    return c.json({
      status: "running",
      scenario,
      trace_file: traceFile,
    });
  });

  app.get("/api/agent/stream", (c) => {
    return streamSSE(c, async (stream) => {
      let offset = 0;
      let lastFileSize = 0;
      let running = true;
      let idleCount = 0;
      const MAX_IDLE = 600;
      const HEARTBEAT_INTERVAL = 25;

      stream.onAbort(() => { running = false; });

      const initialState = getAgentState();
      const scopedTraceFile = initialState.traceFile;
      const scopedEventsPath = scopedTraceFile ? eventsPathForTrace(scopedTraceFile) : null;

      await stream.writeSSE({
        data: JSON.stringify({
          type: "stream_start",
          trace_file: scopedTraceFile,
          events_path: scopedEventsPath,
          status: initialState.status,
        }),
        event: "control",
      });

      let iterationsSinceLastEvent = 0;

      while (running) {
        if (useGolemApi) {
          try {
            const resp = await fetch(`${config.golemApiUrl}/api/status`);
            if (resp.ok) {
              const remote = await resp.json() as { status: string; error?: string };
              if (remote.status === "complete" || remote.status === "error") {
                setAgentState({
                  status: remote.status as "complete" | "error",
                  error: remote.error ?? null,
                });
              }
            }
          } catch {}
        }

        const currentState = getAgentState();
        const superseded = currentState.traceFile !== scopedTraceFile;

        let sentEvents = false;

        if (scopedEventsPath && fs.existsSync(scopedEventsPath)) {
          try {
            const stat = fs.statSync(scopedEventsPath);
            if (stat.size !== lastFileSize) {
              lastFileSize = stat.size;
              const content = fs.readFileSync(scopedEventsPath, "utf-8");
              const lines = content.split("\n").filter(Boolean);

              for (let i = offset; i < lines.length; i++) {
                await stream.writeSSE({
                  data: lines[i]!,
                  event: "agent_event",
                  id: String(i),
                });
              }
              if (lines.length > offset) {
                idleCount = 0;
                sentEvents = true;
                iterationsSinceLastEvent = 0;
              }
              offset = lines.length;
            }
          } catch (e) {
            if (e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code !== "ENOENT") {
              console.warn("agent stream read error:", e);
            }
          }
        }

        if (currentState.status !== "running" || superseded) {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "stream_end",
              status: superseded ? "complete" : currentState.status,
              error: superseded ? null : currentState.error,
              trace_file: scopedTraceFile,
              total_events: offset,
            }),
            event: "control",
          });
          break;
        }

        if (!sentEvents) {
          iterationsSinceLastEvent++;
          if (iterationsSinceLastEvent >= HEARTBEAT_INTERVAL) {
            await stream.writeSSE({
              data: JSON.stringify({
                type: "heartbeat",
                offset,
                status: currentState.status,
              }),
              event: "control",
            });
            iterationsSinceLastEvent = 0;
          }
        }

        idleCount++;
        if (idleCount >= MAX_IDLE) {
          await stream.writeSSE({
            data: JSON.stringify({ type: "stream_timeout" }),
            event: "control",
          });
          break;
        }

        await stream.sleep(200);
      }
    });
  });
}
