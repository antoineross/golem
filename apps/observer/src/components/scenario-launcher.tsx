import { useState, useEffect, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  PlayIcon,
  StopIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
} from "@heroicons/react/20/solid";

const API_BASE = import.meta.env.DEV ? "http://localhost:3000" : "";

type AgentStatus = "idle" | "running" | "complete" | "error";

interface Scenario {
  name: string;
  harness: string;
  description: string;
  prompt: string;
  tools: string[];
  requires_scraper: boolean;
}

interface ScenarioLauncherProps {
  onRunStarted: (traceFile: string) => void;
  onRunComplete?: () => void;
  apiKey?: string | null;
  onError?: (error: string | null) => void;
}

export function ScenarioLauncher({ onRunStarted, onRunComplete, apiKey, onError }: ScenarioLauncherProps) {
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<Record<string, Scenario>>({});
  const [customPrompt, setCustomPrompt] = useState("");
  const [runnerEnabled, setRunnerEnabled] = useState(true);
  const pollCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => { pollCleanupRef.current?.(); };
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/agent/scenarios`)
      .then((r) => {
        if (!r.ok) throw new Error(`scenarios fetch failed: ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setScenarios(data.scenarios ?? {});
        if (data.runner_enabled === false) setRunnerEnabled(false);
      })
      .catch((err) => {
        setRunnerEnabled(false);
        setError(err instanceof Error ? err.message : "failed to load scenarios");
      });
  }, []);

  const pollStatus = useCallback(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/agent/status`);
        const data = await res.json();
        setStatus(data.status);
        setError(data.error);
        if (data.status !== "running") {
          clearInterval(interval);
          onError?.(data.error ?? null);
          onRunComplete?.();
        }
      } catch {
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [onRunComplete, onError]);

  const runScenario = async (scenarioKey: string) => {
    try {
      const payload: Record<string, string> = { scenario: scenarioKey };
      if (apiKey) payload.api_key = apiKey;
      const res = await fetch(`${API_BASE}/api/agent/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("running");
        setError(null);
        onRunStarted(data.trace_file);
        pollCleanupRef.current?.();
        pollCleanupRef.current = pollStatus();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to start agent");
    }
  };

  const runCustom = async () => {
    if (!customPrompt.trim()) return;
    try {
      const payload: Record<string, string> = { scenario: "agent", prompt: customPrompt };
      if (apiKey) payload.api_key = apiKey;
      const res = await fetch(`${API_BASE}/api/agent/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("running");
        setError(null);
        onRunStarted(data.trace_file);
        pollCleanupRef.current?.();
        pollCleanupRef.current = pollStatus();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to start agent");
    }
  };

  const statusIcon: Record<AgentStatus, React.ReactNode> = {
    idle: <StopIcon className="h-3 w-3" />,
    running: (
      <span className="h-3 w-3 rounded-full bg-green-400 animate-pulse inline-block" />
    ),
    complete: <CheckCircleIcon className="h-3 w-3" />,
    error: <ExclamationCircleIcon className="h-3 w-3" />,
  };

  const statusVariant: Record<
    AgentStatus,
    "outline" | "secondary" | "default" | "destructive"
  > = {
    idle: "outline",
    running: "secondary",
    complete: "default",
    error: "destructive",
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <Tooltip>
          <TooltipTrigger render={<span className="text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-help" />}>
            Scenarios
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-[220px] text-xs">
            Pre-built test harnesses for the G.O.L.E.M. agent. Each scenario targets a different
            vulnerability type at increasing difficulty.
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<Badge variant={statusVariant[status]} className="text-[10px] gap-1 cursor-help" />}>
            {statusIcon[status]}
            <span className="capitalize">{status}</span>
          </TooltipTrigger>
          <TooltipContent className="text-xs">
            {status === "idle" && "No agent running. Select a scenario to start."}
            {status === "running" && "Agent is executing. Events stream in real-time."}
            {status === "complete" && "Agent finished. Select the trace to review results."}
            {status === "error" && (error ?? "Agent encountered an error.")}
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="px-2 pb-1">
        <Accordion className="space-y-0.5">
          {Object.entries(scenarios).map(([key, scenario]) => (
            <AccordionItem key={key} value={key} className="border-0">
              <div className="rounded-md border border-border overflow-hidden">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <AccordionTrigger className="px-2.5 py-1 hover:no-underline text-xs" />
                    }
                  >
                    <span className="truncate">{scenario.name}</span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[220px] text-xs">
                    {scenario.description}
                  </TooltipContent>
                </Tooltip>
                <AccordionContent className="px-2.5 pb-2">
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {scenario.description}
                    </p>
                    <div className="rounded bg-muted p-1.5">
                      <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">
                        Prompt
                      </div>
                      <p className="text-[11px] font-mono text-foreground">
                        {scenario.prompt}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {scenario.tools?.map((t) => (
                        <Badge key={t} variant="outline" className="text-[9px] px-1 py-0 h-3.5">
                          {t}
                        </Badge>
                      ))}
                    </div>
                    {scenario.requires_scraper && (
                      <p className="text-[10px] text-amber-400">Requires scraper service</p>
                    )}
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="default"
                            size="xs"
                            disabled={status === "running" || !runnerEnabled}
                            onClick={() => runScenario(key)}
                            className="w-full"
                          />
                        }
                      >
                        <PlayIcon className="h-3 w-3 mr-1" />
                        Run
                      </TooltipTrigger>
                      <TooltipContent>
                        {runnerEnabled
                          ? `Start ${scenario.harness} harness`
                          : "Runner disabled -- use './golem e2e' from the CLI"}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </AccordionContent>
              </div>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      <div className="flex gap-1.5 px-2 py-1.5">
        <Input
          placeholder="Custom prompt..."
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runCustom()}
          disabled={status === "running" || !runnerEnabled}
          className="text-xs h-7"
        />
        <Button
          variant="outline"
          size="sm"
          disabled={status === "running" || !customPrompt.trim() || !runnerEnabled}
          onClick={runCustom}
          className="h-7 px-3 shrink-0"
        >
          Run
        </Button>
      </div>

      {!runnerEnabled && (
        <div className="mx-2 mb-1.5 text-[10px] text-muted-foreground bg-muted border border-border rounded p-1.5">
          Runner disabled in this environment. Use <code className="font-mono">./golem e2e &lt;level&gt;</code> from the host CLI. Traces appear here automatically.
        </div>
      )}

      {error && (
        <div className="mx-2 mb-1.5 text-[10px] text-destructive bg-destructive/10 border border-destructive/20 rounded p-1.5">
          {error}
        </div>
      )}
    </div>
  );
}
