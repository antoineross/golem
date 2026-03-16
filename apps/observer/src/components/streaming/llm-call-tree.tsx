import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
  ChainOfThoughtImage,
} from "@/components/ai-elements/chain-of-thought";
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
import { Badge } from "@/components/ui/badge";
import { Shimmer } from "@/components/ai-elements/shimmer";
import type { StreamingLlmCall, StreamingToolCall } from "@/types/streaming";
import { CameraIcon } from "@heroicons/react/20/solid";
import { CpuIcon } from "lucide-react";
import { getToolConfig, filterKeyParams } from "@/lib/tool-config";

interface LlmCallTreeProps {
  call: StreamingLlmCall;
  toolCalls: StreamingToolCall[];
  thoughts: Array<{ text: string; isStreaming: boolean; timestamp: string }>;
  isFirstCall: boolean;
  isStreaming: boolean;
}

export function LlmCallTree({ call, toolCalls, thoughts, isFirstCall, isStreaming }: LlmCallTreeProps) {
  const isPending = call.state === "pending";
  const totalTokens = (call.inputTokens ?? 0) + (call.outputTokens ?? 0);
  const hasContent = toolCalls.length > 0 || thoughts.length > 0 || call.promptText;

  const headerLabel = (
    <span className="flex items-center gap-2">
      <span className="font-medium">LLM Call</span>
      <Badge variant="secondary" className="gap-1 rounded-full text-[10px]">
        {isPending ? "Pending" : "Completed"}
      </Badge>
      <span className="text-xs text-muted-foreground">{call.model}</span>
      {totalTokens > 0 && (
        <span className="text-xs tabular-nums text-muted-foreground">
          {totalTokens.toLocaleString()} tok
        </span>
      )}
      {call.durationMs != null && (
        <span className="text-xs tabular-nums text-muted-foreground">
          {call.durationMs < 1000 ? `${call.durationMs}ms` : `${(call.durationMs / 1000).toFixed(1)}s`}
        </span>
      )}
    </span>
  );

  return (
    <ChainOfThought defaultOpen={Boolean(hasContent || isPending)}>
      <ChainOfThoughtHeader>{headerLabel}</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {isFirstCall && call.promptText && (
          <ChainOfThoughtStep icon={CpuIcon} label="Prompt context" status="complete">
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono max-h-48 overflow-y-auto rounded-md bg-muted p-2">
              {call.promptText}
            </pre>
          </ChainOfThoughtStep>
        )}

        {thoughts.map((thought, i) => (
          <Reasoning key={`thought-${call.id}-${i}`} isStreaming={thought.isStreaming}>
            <ReasoningTrigger />
            <ReasoningContent>{thought.text}</ReasoningContent>
          </Reasoning>
        ))}

        {toolCalls.map((tc) => (
          <StreamingToolCallStep key={tc.id} toolCall={tc} />
        ))}

        {isPending && isStreaming && toolCalls.length === 0 && (
          <ChainOfThoughtStep
            icon={CpuIcon}
            label={<Shimmer duration={2}>Processing...</Shimmer>}
            status="active"
          />
        )}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

function StreamingToolCallStep({ toolCall }: { toolCall: StreamingToolCall }) {
  const config = getToolConfig(toolCall.name);

  let parsedArgs: Record<string, unknown> = {};
  try { parsedArgs = JSON.parse(toolCall.args); } catch { parsedArgs = { raw: toolCall.args }; }
  const displayArgs = filterKeyParams(parsedArgs, config.keyParams);

  let parsedOutput: unknown = undefined;
  let errorText: string | undefined;

  if (toolCall.response) {
    try { parsedOutput = JSON.parse(toolCall.response); } catch { parsedOutput = toolCall.response; }
  }
  if (toolCall.state === "output-error") {
    errorText = toolCall.response ?? "Tool execution failed";
    parsedOutput = undefined;
  }

  const isActive = toolCall.state === "input-available";
  const hasScreenshot = Boolean(toolCall.screenshotUrl);
  const toolOpen = isActive || hasScreenshot ? true : config.defaultOpen;

  return (
    <ChainOfThoughtStep
      icon={config.icon}
      label={<span className={config.color}>{toolCall.name}</span>}
      status={isActive ? "active" : "complete"}
    >
      <Tool defaultOpen={toolOpen}>
        <ToolHeader
          type="dynamic-tool"
          toolName={toolCall.name}
          state={toolCall.state}
          title={toolCall.name}
        />
        <ToolContent>
          <ToolInput input={displayArgs} />
          {(parsedOutput !== undefined || errorText) && (
            <ToolOutput output={parsedOutput} errorText={errorText} />
          )}
        </ToolContent>
      </Tool>

      {toolCall.screenshotPending && !toolCall.screenshotUrl && (
        <ChainOfThoughtImage caption="Capturing screenshot...">
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
            <CameraIcon className="h-4 w-4 animate-pulse" />
            <Shimmer duration={2}>capturing...</Shimmer>
          </div>
        </ChainOfThoughtImage>
      )}

      {toolCall.screenshotUrl && /^https?:\/\//i.test(toolCall.screenshotUrl) && (
        <ChainOfThoughtImage caption={`Screenshot from ${toolCall.name}`}>
          <img
            src={toolCall.screenshotUrl}
            alt={`Screenshot from ${toolCall.name}`}
            className="max-w-full max-h-96 object-contain rounded"
          />
        </ChainOfThoughtImage>
      )}
    </ChainOfThoughtStep>
  );
}
