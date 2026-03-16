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
      tools: ["echo", "payload", "browse", "screenshot", "find_hidden"],
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
    agent: {
      name: "Full Agent Run",
      harness: "agent",
      description: "Runs the full security auditor agent against the default target.",
      prompt: "Browse https://example.com and describe what you see.",
      tools: ["echo", "payload", "browse", "screenshot", "click", "find_hidden"],
      requires_scraper: true,
    },
  };
}

async function startRunViaGolemApi(
  golemApiUrl: string,
  prompt: string,
  harness: string,
  traceFile: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const resp = await fetch(`${golemApiUrl}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, harness, trace_file: traceFile }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      return { ok: false, error: `golem API returned ${resp.status}: ${body}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `golem API unreachable: ${e}` };
  }
}

function startRunViaSpawn(
  config: ServerConfig,
  harness: string,
  prompt: string,
  traceFile: string,
): void {
  const golemScript = path.join(config.repoRoot, "golem");
  const args = ["e2e", harness];
  if (prompt) args.push(prompt);

  const child = spawn(golemScript, args, {
    cwd: config.repoRoot,
    env: { ...process.env, GOLEM_TRACE_FILE: traceFile },
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

  app.get("/api/agent/scenarios", (c) => {
    return c.json({ scenarios: SCENARIOS });
  });

  app.post("/api/agent/run", async (c) => {
    const state = getAgentState();
    if (state.status === "running") {
      return c.json({ error: "agent is already running" }, 409);
    }

    const body = await c.req.json().catch(() => ({}));
    const scenario = (body as Record<string, string>).scenario ?? "level0";
    const customPrompt = (body as Record<string, string>).prompt;

    const scenarioConfig = SCENARIOS[scenario];
    if (!scenarioConfig && !customPrompt) {
      return c.json({ error: `unknown scenario: ${scenario}` }, 400);
    }

    const harness = scenarioConfig?.harness ?? "agent";
    const prompt = customPrompt ?? scenarioConfig?.prompt ?? "";

    const traceDir = path.join(config.traceDir, harness);
    try { fs.mkdirSync(traceDir, { recursive: true }); } catch {}
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const traceFile = path.join(traceDir, `${harness}_${ts}_otel_spans.json`);

    setAgentState({ status: "running", error: null, traceFile });

    if (useGolemApi) {
      const result = await startRunViaGolemApi(config.golemApiUrl!, prompt, harness, traceFile);
      if (!result.ok) {
        setAgentState({ status: "error", error: result.error ?? "failed to start agent" });
        return c.json({ error: result.error }, 502);
      }
      pollGolemStatus(config.golemApiUrl!, traceFile);
    } else {
      startRunViaSpawn(config, harness, prompt, traceFile);
    }

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
