import { useState } from "react";
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from "@/components/ai-elements/reasoning";
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
import { Shimmer } from "@/components/ai-elements/shimmer";
import type { StreamState } from "@/types/streaming";
import { SignalIcon } from "@heroicons/react/20/solid";

import { StreamStatusBanner } from "@/components/streaming/stream-status-banner";
import { LlmCallCard } from "@/components/streaming/llm-call-card";
import { StreamingToolCallItem } from "@/components/streaming/streaming-tool-call-item";

interface StreamingTimelineProps {
  state: StreamState;
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
