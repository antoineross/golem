import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, Square, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

const API_BASE = import.meta.env.DEV ? "http://localhost:3001" : "";

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
    idle: <Square className="h-3 w-3 text-zinc-500" />,
    running: <Loader2 className="h-3 w-3 text-blue-400 animate-spin" />,
    complete: <CheckCircle2 className="h-3 w-3 text-green-400" />,
    error: <AlertCircle className="h-3 w-3 text-red-400" />,
  };

  const statusColor: Record<AgentStatus, string> = {
    idle: "border-zinc-700 text-zinc-400",
    running: "border-blue-700 text-blue-400",
    complete: "border-green-700 text-green-400",
    error: "border-red-700 text-red-400",
  };

  return (
    <Card className="border-zinc-800 bg-zinc-950">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-zinc-300">
            Scenario Launcher
          </CardTitle>
          <Badge variant="outline" className={`text-xs ${statusColor[status]}`}>
            {statusIcon[status]}
            <span className="ml-1 capitalize">{status}</span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-3">
        <div className="flex flex-wrap gap-2">
          {Object.entries(scenarios).map(([key, scenario]) => (
            <Button
              key={key}
              variant="outline"
              size="sm"
              disabled={status === "running"}
              onClick={() => runScenario(key)}
              className="text-xs border-zinc-700 hover:bg-zinc-800"
            >
              <Play className="h-3 w-3 mr-1" />
              {scenario.name}
            </Button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Custom prompt..."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runCustom()}
            disabled={status === "running"}
            className="flex-1 rounded bg-zinc-900 border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={status === "running" || !customPrompt.trim()}
            onClick={runCustom}
            className="text-xs border-zinc-700 hover:bg-zinc-800"
          >
            Run
          </Button>
        </div>

        {error && (
          <div className="text-xs text-red-400 bg-red-950/50 border border-red-800 rounded p-2">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
