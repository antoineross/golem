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
import type { StreamState, StreamingLlmCall } from "@/types/streaming";
import { SignalIcon } from "@heroicons/react/20/solid";

import { StreamStatusBanner } from "@/components/streaming/stream-status-banner";
import { LlmCallTree } from "@/components/streaming/llm-call-tree";

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
          <p className="text-sm mt-1">Run a scenario to see events appear in real-time</p>
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

  const orphanThoughts = state.thoughts.filter((_, i) => {
    const ts = state.thoughts[i]!.timestamp;
    const firstLlm = state.llmCalls[0];
    return !firstLlm || ts < firstLlm.timestamp;
  });

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex-1">
          <StreamStatusBanner state={state} />
        </div>
        <Button
          variant={autoScroll ? "secondary" : "outline"}
          size="sm"
          onClick={() => setAutoScroll(!autoScroll)}
          className="shrink-0"
          aria-label={autoScroll ? "Disable auto-scroll" : "Enable auto-scroll"}
        >
          {autoScroll ? "Auto-scroll On" : "Auto-scroll Off"}
        </Button>
      </div>

      <Conversation className="flex-1 min-h-0">
        <ConversationContent>
          {state.userPrompt && (
            <Message from="user">
              <MessageContent>
                <MessageResponse>{state.userPrompt}</MessageResponse>
              </MessageContent>
            </Message>
          )}

          {orphanThoughts.map((thought, i) => (
            <Reasoning key={`orphan-thought-${i}`} isStreaming={thought.isStreaming}>
              <ReasoningTrigger />
              <ReasoningContent>{thought.text}</ReasoningContent>
            </Reasoning>
          ))}

          {state.llmCalls.map((call: StreamingLlmCall, i: number) => (
            <LlmCallTree
              key={call.id}
              call={call}
              toolCalls={state.toolCalls.filter((tc) => tc.parentLlmCallId === call.id)}
              thoughts={getThoughtsForLlmCall(state, call, i)}
              isFirstCall={i === 0}
              isStreaming={isStreaming}
            />
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
                  <Badge variant="outline" className="text-[10px]">intermediate</Badge>
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

function getThoughtsForLlmCall(
  state: StreamState,
  call: StreamingLlmCall,
  callIdx: number
): Array<{ text: string; isStreaming: boolean; timestamp: string }> {
  const nextCall = state.llmCalls[callIdx + 1];
  return state.thoughts.filter((t) => {
    if (t.timestamp < call.timestamp) return false;
    if (nextCall && t.timestamp >= nextCall.timestamp) return false;
    return true;
  });
}
