import type { TimelineEvent } from "@/types/trace";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
  ChainOfThoughtImage,
} from "@/components/ai-elements/chain-of-thought";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { Badge } from "@/components/ui/badge";
import { CpuIcon } from "lucide-react";
import { getToolConfig, filterKeyParams } from "@/lib/tool-config";

interface TimelineProps {
  events: TimelineEvent[];
}

export function Timeline({ events }: TimelineProps) {
  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          No events found in this trace.
        </CardContent>
      </Card>
    );
  }

  const userPrompt = events.find((e) => e.id === "user-prompt" || e.title === "User Prompt");
  const finalResponse = events.find((e) => e.id === "final-response" || e.title === "Final Agent Response");
  const thoughts = events.filter((e) => e.type === "thought");
  const llmCalls = events.filter((e) => e.type === "llm_call");
  const toolCalls = events.filter((e) => e.type === "tool_call");

  const toEpoch = (ts: string) => new Date(ts).getTime();

  return (
    <ScrollArea className="h-[calc(100vh-260px)]">
      <div className="space-y-3 pr-4">
        {userPrompt && (
          <Message from="user">
            <MessageContent>
              <MessageResponse>{userPrompt.text ?? ""}</MessageResponse>
            </MessageContent>
          </Message>
        )}

        {llmCalls.map((llm, i) => {
          const nextLlm = llmCalls[i + 1];
          const llmEpoch = toEpoch(llm.timestamp);
          const nextEpoch = nextLlm ? toEpoch(nextLlm.timestamp) : Infinity;
          const childTools = toolCalls.filter((tc) => {
            const t = toEpoch(tc.timestamp);
            return t >= llmEpoch && t < nextEpoch;
          });
          const childThoughts = thoughts.filter((t) => {
            const te = toEpoch(t.timestamp);
            return te >= llmEpoch && te < nextEpoch;
          });

          return (
            <LlmCallGroup
              key={llm.id}
              llm={llm}
              tools={childTools}
              thoughts={childThoughts}
              isFirst={i === 0}
            />
          );
        })}

        {finalResponse && (
          <Message from="assistant">
            <MessageContent>
              <MessageResponse>{finalResponse.text ?? ""}</MessageResponse>
            </MessageContent>
          </Message>
        )}
      </div>
    </ScrollArea>
  );
}

function LlmCallGroup({
  llm,
  tools,
  thoughts,
  isFirst,
}: {
  llm: TimelineEvent;
  tools: TimelineEvent[];
  thoughts: TimelineEvent[];
  isFirst: boolean;
}) {
  const totalTokens = llm.tokens ? llm.tokens.input + llm.tokens.output : 0;
  const hasContent = tools.length > 0 || thoughts.length > 0;

  const headerLabel = (
    <span className="flex items-center gap-2">
      <span className="font-medium">LLM Call</span>
      <Badge variant="secondary" className="gap-1 rounded-full text-[10px]">Completed</Badge>
      <span className="text-xs text-muted-foreground">{llm.model ?? "unknown"}</span>
      {totalTokens > 0 && (
        <span className="text-xs tabular-nums text-muted-foreground">{totalTokens.toLocaleString()} tok</span>
      )}
      {llm.duration_ms != null && (
        <span className="text-xs tabular-nums text-muted-foreground">{formatDuration(llm.duration_ms)}</span>
      )}
    </span>
  );

  return (
    <ChainOfThought defaultOpen={Boolean(hasContent)}>
      <ChainOfThoughtHeader>{headerLabel}</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {isFirst && llm.text && (
          <ChainOfThoughtStep icon={CpuIcon} label="LLM context" status="complete">
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono max-h-48 overflow-y-auto rounded-md bg-muted p-2">
              {llm.text}
            </pre>
          </ChainOfThoughtStep>
        )}

        {llm.tokens && (
          <ChainOfThoughtStep icon={CpuIcon} label="Token usage" status="complete">
            <div className="rounded-md bg-muted p-2 text-xs space-y-0.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Input</span>
                <span className="tabular-nums">{llm.tokens.input.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Output</span>
                <span className="tabular-nums">{llm.tokens.output.toLocaleString()}</span>
              </div>
              {(llm.tokens.thoughts ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Thinking</span>
                  <span className="tabular-nums">{llm.tokens.thoughts!.toLocaleString()}</span>
                </div>
              )}
            </div>
          </ChainOfThoughtStep>
        )}

        {thoughts.map((thought) => (
          <Reasoning key={thought.id} isStreaming={false}>
            <ReasoningTrigger />
            <ReasoningContent>{thought.text ?? ""}</ReasoningContent>
          </Reasoning>
        ))}

        {tools.map((tc) => (
          <StaticToolCallStep key={tc.id} event={tc} />
        ))}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

function StaticToolCallStep({ event }: { event: TimelineEvent }) {
  const toolName = event.tool_name ?? "tool";
  const config = getToolConfig(toolName);

  let parsedArgs: Record<string, unknown> = {};
  if (event.tool_args) {
    try { parsedArgs = JSON.parse(event.tool_args); } catch { parsedArgs = { raw: event.tool_args }; }
  }
  const displayArgs = filterKeyParams(parsedArgs, config.keyParams);

  let parsedOutput: unknown = undefined;
  if (event.tool_response) {
    try { parsedOutput = JSON.parse(event.tool_response); } catch { parsedOutput = event.tool_response; }
  }

  const hasScreenshot = Boolean(event.screenshot_url);

  return (
    <ChainOfThoughtStep
      icon={config.icon}
      label={<span className={config.color}>{toolName}</span>}
      status="complete"
    >
      <Tool defaultOpen={hasScreenshot ? true : config.defaultOpen}>
        <ToolHeader
          type="dynamic-tool"
          toolName={toolName}
          state="output-available"
          title={toolName}
        />
        <ToolContent>
          <ToolInput input={displayArgs} />
          {parsedOutput !== undefined && <ToolOutput output={parsedOutput} errorText={undefined} />}
        </ToolContent>
      </Tool>

      {event.screenshot_url && (
        <ChainOfThoughtImage caption={`Screenshot from ${toolName}`}>
          <img
            src={event.screenshot_url}
            alt={`Screenshot from ${toolName}`}
            className="max-w-full max-h-96 object-contain rounded"
          />
        </ChainOfThoughtImage>
      )}
    </ChainOfThoughtStep>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
