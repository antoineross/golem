import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
}

export function ScenarioLauncher({ onRunStarted, onRunComplete }: ScenarioLauncherProps) {
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<Record<string, Scenario>>({});
  const [customPrompt, setCustomPrompt] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/api/agent/scenarios`)
      .then((r) => r.json())
      .then((data) => setScenarios(data.scenarios ?? {}))
      .catch(() => {});
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
          onRunComplete?.();
        }
      } catch {
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const runScenario = async (scenarioKey: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/agent/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: scenarioKey }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("running");
        setError(null);
        onRunStarted(data.trace_file);
        pollStatus();
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
      const res = await fetch(`${API_BASE}/api/agent/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: "agent", prompt: customPrompt }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("running");
        setError(null);
        onRunStarted(data.trace_file);
        pollStatus();
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
    <Card>
      <CardHeader className="p-3 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-medium">Scenarios</CardTitle>
          <Badge variant={statusVariant[status]} className="text-[10px] gap-1">
            {statusIcon[status]}
            <span className="capitalize">{status}</span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0 space-y-2">
        <Accordion className="space-y-1">
          {Object.entries(scenarios).map(([key, scenario]) => (
            <AccordionItem key={key} value={key} className="border-0">
              <div className="rounded-md border border-border overflow-hidden">
                <AccordionTrigger className="px-2.5 py-1.5 hover:no-underline text-xs">
                  <span className="truncate">{scenario.name}</span>
                </AccordionTrigger>
                <AccordionContent className="px-2.5 pb-2.5">
                  <div className="space-y-2">
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {scenario.description}
                    </p>
                    <div className="rounded bg-muted p-2">
                      <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">
                        Prompt
                      </div>
                      <p className="text-[11px] font-mono text-foreground">
                        {scenario.prompt}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {scenario.tools?.map((t) => (
                        <Badge
                          key={t}
                          variant="outline"
                          className="text-[9px] px-1 py-0 h-3.5"
                        >
                          {t}
                        </Badge>
                      ))}
                    </div>
                    {scenario.requires_scraper && (
                      <p className="text-[10px] text-amber-400">
                        Requires scraper service
                      </p>
                    )}
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="default"
                            size="xs"
                            disabled={status === "running"}
                            onClick={() => runScenario(key)}
                            className="w-full"
                          />
                        }
                      >
                        <PlayIcon className="h-3 w-3 mr-1" />
                        Run
                      </TooltipTrigger>
                      <TooltipContent>
                        Start {scenario.harness} harness
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </AccordionContent>
              </div>
            </AccordionItem>
          ))}
        </Accordion>

        <div className="flex gap-1.5">
          <Input
            placeholder="Custom prompt..."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runCustom()}
            disabled={status === "running"}
            className="text-xs h-7"
          />
          <Button
            variant="outline"
            size="xs"
            disabled={status === "running" || !customPrompt.trim()}
            onClick={runCustom}
          >
            Run
          </Button>
        </div>

        {error && (
          <div className="text-[10px] text-destructive bg-destructive/10 border border-destructive/20 rounded p-1.5">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
