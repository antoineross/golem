import { Badge } from "@/components/ui/badge";
import { Shimmer } from "@/components/ai-elements/shimmer";
import type { StreamState } from "@/types/streaming";
import {
  SignalIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
} from "@heroicons/react/20/solid";

export function StreamStatusBanner({ state }: { state: StreamState }) {
  const statusConfig = {
    connecting: {
      icon: <ClockIcon className="h-4 w-4 animate-pulse" />,
      label: "Connecting...",
      color: "text-yellow-400",
      bg: "bg-yellow-500/10 border-yellow-500/20",
    },
    streaming: {
      icon: <SignalIcon className="h-4 w-4 animate-pulse" />,
      label: "Live",
      color: "text-green-400",
      bg: "bg-green-500/10 border-green-500/20",
    },
    complete: {
      icon: <CheckCircleIcon className="h-4 w-4" />,
      label: "Complete",
      color: "text-blue-400",
      bg: "bg-blue-500/10 border-blue-500/20",
    },
    error: {
      icon: <ExclamationCircleIcon className="h-4 w-4" />,
      label: "Error",
      color: "text-red-400",
      bg: "bg-red-500/10 border-red-500/20",
    },
    idle: {
      icon: <ClockIcon className="h-4 w-4" />,
      label: "Waiting",
      color: "text-muted-foreground",
      bg: "bg-muted/50 border-border",
    },
  };

  const config = statusConfig[state.status];
  const isActive = state.status === "streaming" || state.status === "connecting";
  const totalTokens = state.tokens.input + state.tokens.output + state.tokens.think;

  return (
    <div className={`flex items-center justify-between rounded-lg border px-4 py-2 ${config.bg}`}>
      <div className="flex items-center gap-2">
        <span className={config.color}>{config.icon}</span>
        <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
        {state.model && (
          <Badge variant="outline" className="text-[10px]">
            {state.model}
          </Badge>
        )}
        {state.agentName && (
          <Badge variant="outline" className="text-[10px] text-purple-400 border-purple-500/20">
            {state.agentName}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{state.totalEvents} events</span>
        {state.llmCalls.length > 0 && (
          <span>{state.llmCalls.length} LLM</span>
        )}
        {state.toolCalls.length > 0 && (
          <span>{state.toolCalls.length} tools</span>
        )}
        {totalTokens > 0 && (
          <span>{totalTokens.toLocaleString()} tok</span>
        )}
        {isActive && <Shimmer duration={2}>streaming</Shimmer>}
      </div>
    </div>
  );
}
