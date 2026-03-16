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
import { Play, Square, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

const API_BASE = import.meta.env.DEV ? "http://localhost:3000" : "";

type AgentStatus = "idle" | "running" | "complete" | "error";

interface Scenario {
  name: string;
  harness: string;
  prompt?: string;
}

interface ScenarioLauncherProps {
  onRunStarted: (traceFile: string) => void;
}

export function ScenarioLauncher({ onRunStarted }: ScenarioLauncherProps) {
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
    idle: <Square className="h-3 w-3" />,
    running: <Loader2 className="h-3 w-3 animate-spin" />,
    complete: <CheckCircle2 className="h-3 w-3" />,
    error: <AlertCircle className="h-3 w-3" />,
  };

  const statusVariant: Record<AgentStatus, "outline" | "secondary" | "default" | "destructive"> = {
    idle: "outline",
    running: "secondary",
    complete: "default",
    error: "destructive",
  };

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            Scenario Launcher
          </CardTitle>
          <Badge variant={statusVariant[status]} className="text-xs gap-1">
            {statusIcon[status]}
            <span className="capitalize">{status}</span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-3">
        <div className="flex flex-wrap gap-2">
          {Object.entries(scenarios).map(([key, scenario]) => (
            <Tooltip key={key}>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={status === "running"}
                    onClick={() => runScenario(key)}
                  />
                }
              >
                <Play className="h-3 w-3 mr-1" />
                {scenario.name}
              </TooltipTrigger>
              <TooltipContent>Run {scenario.harness} harness</TooltipContent>
            </Tooltip>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Custom prompt..."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runCustom()}
            disabled={status === "running"}
            className="text-sm"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={status === "running" || !customPrompt.trim()}
            onClick={runCustom}
          >
            Run
          </Button>
        </div>

        {error && (
          <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded p-2">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
