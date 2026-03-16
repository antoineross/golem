import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Shimmer } from "@/components/ai-elements/shimmer";
import type { StreamState, StreamingToolCall, StreamingLlmCall } from "@/types/streaming";
import {
  SignalIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
  CpuChipIcon,
  CameraIcon,
} from "@heroicons/react/20/solid";
import { ChevronDownIcon } from "lucide-react";

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

function LlmCallCard({ call }: { call: StreamingLlmCall }) {
  const isPending = call.state === "pending";
  const totalTokens = (call.inputTokens ?? 0) + (call.outputTokens ?? 0);

  return (
    <Collapsible className="group not-prose mb-2 w-full rounded-md border border-cyan-500/20">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-4 px-3 py-2">
        <div className="flex items-center gap-2">
          <CpuChipIcon className="h-4 w-4 text-cyan-400" />
          <span className="font-medium text-sm">LLM Call</span>
          <Badge
            variant="secondary"
            className="gap-1.5 rounded-full text-xs"
          >
            {isPending ? (
              <>
                <ClockIcon className="h-3 w-3 animate-pulse" />
                Pending
              </>
            ) : (
              <>
                <CheckCircleIcon className="h-3 w-3 text-green-600" />
                Completed
              </>
            )}
          </Badge>
          <span className="text-xs text-muted-foreground">{call.model}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {totalTokens > 0 && (
            <span className="tabular-nums">{totalTokens.toLocaleString()} tok</span>
          )}
          {call.durationMs && (
            <span className="tabular-nums">
              {call.durationMs < 1000 ? `${call.durationMs}ms` : `${(call.durationMs / 1000).toFixed(1)}s`}
            </span>
          )}
          <ChevronDownIcon className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 space-y-2">
        {(call.promptParts != null || call.toolsAvailable != null) && (
          <div className="flex gap-3 text-xs text-muted-foreground">
            {call.promptParts != null && <span>Parts: {call.promptParts}</span>}
            {call.toolsAvailable != null && <span>Tools: {call.toolsAvailable}</span>}
          </div>
        )}
        {call.inputTokens != null && (
          <div className="rounded-md bg-muted p-2 text-xs space-y-0.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Input</span>
              <span className="tabular-nums">{call.inputTokens.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Output</span>
              <span className="tabular-nums">{(call.outputTokens ?? 0).toLocaleString()}</span>
            </div>
            {(call.thinkTokens ?? 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Thinking</span>
                <span className="tabular-nums">{call.thinkTokens!.toLocaleString()}</span>
              </div>
            )}
          </div>
        )}
        {call.promptText && (
          <details className="group/prompt">
            <summary className="text-[10px] uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground">
              Prompt context
            </summary>
            <pre className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap font-mono max-h-48 overflow-y-auto rounded-md bg-muted p-2">
              {call.promptText}
            </pre>
          </details>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ScreenshotPlaceholder() {
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="bg-muted px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Screenshot
        </span>
      </div>
      <div className="flex items-center justify-center h-32 bg-black/10">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CameraIcon className="h-4 w-4 animate-pulse" />
          <Shimmer duration={2}>capturing...</Shimmer>
        </div>
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
        {toolCall.screenshotPending && !toolCall.screenshotUrl && (
          <ScreenshotPlaceholder />
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
  const [autoScroll, setAutoScroll] = useState(true);

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
  const finalResponse = state.responses.find((r) => r.isFinal);
  const lastResponse = state.responses.length > 0
    ? state.responses[state.responses.length - 1]
    : null;

  // Build ordered timeline items by timestamp
  type TimelineItem =
    | { kind: "thought"; idx: number; ts: string }
    | { kind: "llm_call"; idx: number; ts: string }
    | { kind: "tool_call"; idx: number; ts: string };

  const items: TimelineItem[] = [];
  state.thoughts.forEach((t, i) => items.push({ kind: "thought", idx: i, ts: t.timestamp }));
  state.llmCalls.forEach((lc, i) => items.push({ kind: "llm_call", idx: i, ts: lc.timestamp }));
  state.toolCalls.forEach((tc, i) => items.push({ kind: "tool_call", idx: i, ts: tc.timestamp }));
  items.sort((a, b) => a.ts.localeCompare(b.ts));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <StreamStatusBanner state={state} />
        </div>
        <Button
          variant={autoScroll ? "secondary" : "outline"}
          size="sm"
          onClick={() => setAutoScroll(!autoScroll)}
          className="shrink-0"
        >
          {autoScroll ? "Auto-scroll On" : "Auto-scroll Off"}
        </Button>
      </div>

      <Conversation className="h-[calc(100vh-320px)]">
        <ConversationContent>
          {state.userPrompt && (
            <Message from="user">
              <MessageContent>
                <MessageResponse>{state.userPrompt}</MessageResponse>
              </MessageContent>
            </Message>
          )}

          {items.map((item) => {
            if (item.kind === "thought") {
              const thought = state.thoughts[item.idx]!;
              return (
                <Reasoning key={`thought-${item.idx}`} isStreaming={thought.isStreaming}>
                  <ReasoningTrigger />
                  <ReasoningContent>{thought.text}</ReasoningContent>
                </Reasoning>
              );
            }
            if (item.kind === "llm_call") {
              const call = state.llmCalls[item.idx]!;
              return <LlmCallCard key={call.id} call={call} />;
            }
            if (item.kind === "tool_call") {
              const tc = state.toolCalls[item.idx]!;
              return <StreamingToolCallItem key={tc.id} toolCall={tc} />;
            }
            return null;
          })}

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
        {autoScroll && <ConversationScrollButton />}
      </Conversation>
    </div>
  );
}
