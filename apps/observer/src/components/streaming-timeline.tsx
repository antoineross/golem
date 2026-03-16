import { useRef, useEffect } from "react";
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from "@/components/ai-elements/reasoning";
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Shimmer } from "@/components/ai-elements/shimmer";
import type { StreamState, StreamingToolCall } from "@/types/streaming";
import {
  SignalIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
} from "@heroicons/react/20/solid";

interface StreamingTimelineProps {
  state: StreamState;
}

function StreamStatusBanner({ state }: { state: StreamState }) {
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
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{state.totalEvents} events</span>
        {state.toolCalls.length > 0 && (
          <span>{state.toolCalls.length} tools</span>
        )}
        {isActive && <Shimmer duration={2}>streaming</Shimmer>}
      </div>
    </div>
  );
}

function StreamingToolCallItem({ toolCall }: { toolCall: StreamingToolCall }) {
  let parsedArgs: Record<string, unknown> = {};
  try {
    parsedArgs = JSON.parse(toolCall.args);
  } catch {
    parsedArgs = { raw: toolCall.args };
  }

  let parsedOutput: unknown = undefined;
  let errorText: string | undefined;

  if (toolCall.response) {
    try {
      parsedOutput = JSON.parse(toolCall.response);
    } catch {
      parsedOutput = toolCall.response;
    }
  }

  if (toolCall.state === "output-error") {
    errorText = toolCall.response ?? "Tool execution failed";
    parsedOutput = undefined;
  }

  return (
    <Tool defaultOpen={toolCall.state !== "output-available"}>
      <ToolHeader
        type="dynamic-tool"
        toolName={toolCall.name}
        state={toolCall.state}
        title={toolCall.name}
      />
      <ToolContent>
        <ToolInput input={parsedArgs} />
        {(parsedOutput !== undefined || errorText) && (
          <ToolOutput output={parsedOutput} errorText={errorText} />
        )}
        {toolCall.screenshotUrl && (
          <div className="rounded-md border border-border overflow-hidden">
            <div className="bg-muted px-3 py-1.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Screenshot
              </span>
            </div>
            <img
              src={toolCall.screenshotUrl}
              alt={`Screenshot from ${toolCall.name}`}
              className="max-w-full max-h-72 object-contain bg-black/20"
            />
          </div>
        )}
      </ToolContent>
    </Tool>
  );
}

export function StreamingTimeline({ state }: StreamingTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.totalEvents]);

  if (state.status === "idle" && state.events.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-16 text-muted-foreground">
          <SignalIcon className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg">Waiting for agent stream</p>
          <p className="text-sm mt-1">
            Run a scenario to see events appear in real-time
          </p>
        </CardContent>
      </Card>
    );
  }

  const isStreaming = state.status === "streaming" || state.status === "connecting";
  const hasThoughtsStreaming = state.thoughts.some((t) => t.isStreaming);
  const lastResponse = state.responses.length > 0
    ? state.responses[state.responses.length - 1]
    : null;
  const finalResponse = state.responses.find((r) => r.isFinal);

  return (
    <div className="space-y-3">
      <StreamStatusBanner state={state} />

      <Conversation className="h-[calc(100vh-320px)]">
        <ConversationContent>
          {state.userPrompt && (
            <Message from="user">
              <MessageContent>
                <MessageResponse>{state.userPrompt}</MessageResponse>
              </MessageContent>
            </Message>
          )}

          {state.thoughts.map((thought, i) => (
            <Reasoning key={`thought-${i}`} isStreaming={thought.isStreaming}>
              <ReasoningTrigger />
              <ReasoningContent>{thought.text}</ReasoningContent>
            </Reasoning>
          ))}

          {state.toolCalls.map((tc) => (
            <StreamingToolCallItem key={tc.id} toolCall={tc} />
          ))}

          {isStreaming && !hasThoughtsStreaming && state.toolCalls.length === 0 && state.thoughts.length === 0 && !state.userPrompt && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
              <Shimmer duration={2}>Waiting for agent events...</Shimmer>
            </div>
          )}

          {finalResponse && (
            <Message from="assistant">
              <MessageContent>
                <MessageResponse>{finalResponse.text}</MessageResponse>
              </MessageContent>
            </Message>
          )}

          {!finalResponse && lastResponse && !lastResponse.isFinal && (
            <Message from="assistant">
              <MessageContent>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px]">
                    intermediate
                  </Badge>
                </div>
                <MessageResponse>{lastResponse.text}</MessageResponse>
              </MessageContent>
            </Message>
          )}

          {state.error && (
            <div className="rounded border border-destructive bg-destructive/10 p-4 text-destructive text-sm">
              {state.error}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
    </div>
  );
}
