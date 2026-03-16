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
      description: "Runs the full security auditor agent against the default target. Uses all available tools via the Supacrawl scraper.",
      prompt: "Browse https://example.com and describe what you see.",
      tools: ["echo", "payload", "browse", "screenshot", "click", "find_hidden"],
      requires_scraper: true,
    },
  };
}

export function registerAgentRoutes(app: Hono, config: ServerConfig): void {
  const SCENARIOS = buildScenarios(config.demoTargetUrl);

  app.get("/api/agent/status", (c) => {
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

    setAgentState({ status: "running", error: null });

    const golemScript = path.join(config.repoRoot, "golem");
    const harness = scenarioConfig?.harness ?? "agent";
    const args = ["e2e", harness];
    if (customPrompt) args.push(customPrompt);

    const traceDir = path.join(config.repoRoot, "tmp", "tests", harness);
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const traceFile = path.join(traceDir, `${harness}_${ts}_otel_spans.json`);
    setAgentState({ traceFile });

    const child = spawn(golemScript, args, {
      cwd: config.repoRoot,
      env: { ...process.env, GOLEM_TRACE_FILE: traceFile },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    child.on("close", (code: number | null) => {
      if (code === 0) {
        setAgentState({ status: "complete", error: null });
      } else {
        setAgentState({ status: "error", error: `exit code ${code}: ${stderr.slice(-500)}` });
      }
      console.log(`agent run finished: status=${getAgentState().status}, code=${code}`);
      if (stdout) console.log(`stdout: ${stdout.slice(-200)}`);
    });

    return c.json({
      status: "running",
      scenario,
      trace_file: traceFile,
    });
  });

  app.get("/api/agent/stream", (c) => {
    return streamSSE(c, async (stream) => {
      let offset = 0;
      let running = true;
      let idleCount = 0;
      const MAX_IDLE = 600; // 2 minutes at 200ms intervals
      const HEARTBEAT_INTERVAL = 25; // 25 iterations * 200ms = 5 seconds

      stream.onAbort(() => {
        running = false;
      });

      const state = getAgentState();
      const eventsPath = state.traceFile
        ? eventsPathForTrace(state.traceFile)
        : null;

      await stream.writeSSE({
        data: JSON.stringify({
          type: "stream_start",
          trace_file: state.traceFile,
          events_path: eventsPath,
          status: state.status,
        }),
        event: "control",
      });

      let iterationsSinceLastEvent = 0;

      while (running) {
        const currentState = getAgentState();
        const currentEventsPath = currentState.traceFile
          ? eventsPathForTrace(currentState.traceFile)
          : null;

        let sentEvents = false;

        if (currentEventsPath && fs.existsSync(currentEventsPath)) {
          try {
            const content = fs.readFileSync(currentEventsPath, "utf-8");
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
          } catch (e) {
            if (e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code !== "ENOENT") {
              console.warn("agent stream read error:", e);
            }
          }
        }

        if (currentState.status !== "running") {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "stream_end",
              status: currentState.status,
              error: currentState.error,
              trace_file: currentState.traceFile,
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
