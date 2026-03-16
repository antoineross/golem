import type { TraceSummary } from "@/types/trace";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Cpu, MessageSquare, Wrench, Brain } from "lucide-react";

interface SummaryHeaderProps {
  trace: TraceSummary;
}

export function SummaryHeader({ trace }: SummaryHeaderProps) {
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <Card className="border-zinc-800 bg-zinc-950">
      <CardContent className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          icon={<Cpu className="h-4 w-4 text-blue-400" />}
          label="Model"
          value={trace.model}
        />
        {trace.thinking_level && (
          <Stat
            icon={<Brain className="h-4 w-4 text-purple-400" />}
            label="Thinking"
            value={trace.thinking_level}
          />
        )}
        <Stat
          icon={<Clock className="h-4 w-4 text-green-400" />}
          label="Duration"
          value={formatDuration(trace.total_duration_ms)}
        />
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Tokens</span>
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline" className="text-xs border-zinc-700">
              in: {trace.tokens.input.toLocaleString()}
            </Badge>
            <Badge variant="outline" className="text-xs border-zinc-700">
              out: {trace.tokens.output.toLocaleString()}
            </Badge>
            {trace.tokens.thoughts > 0 && (
              <Badge variant="outline" className="text-xs border-purple-700 text-purple-400">
                think: {trace.tokens.thoughts.toLocaleString()}
              </Badge>
            )}
          </div>
        </div>
        <Stat
          icon={<Wrench className="h-4 w-4 text-orange-400" />}
          label="Tool Calls"
          value={String(trace.tool_calls)}
        />
        <Stat
          icon={<MessageSquare className="h-4 w-4 text-cyan-400" />}
          label="LLM Calls"
          value={String(trace.llm_calls)}
        />
      </CardContent>
    </Card>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
      <span className="text-sm font-medium text-zinc-200 truncate">{value}</span>
    </div>
  );
}
