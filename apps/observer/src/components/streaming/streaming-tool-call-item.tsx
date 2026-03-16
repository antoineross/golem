import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Shimmer } from "@/components/ai-elements/shimmer";
import type { StreamingToolCall } from "@/types/streaming";
import { CameraIcon } from "@heroicons/react/20/solid";

function ScreenshotPlaceholder() {
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="bg-muted px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Screenshot
        </span>
      </div>
      <div className="flex items-center justify-center h-32 bg-muted/50">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CameraIcon className="h-4 w-4 animate-pulse" />
          <Shimmer duration={2}>capturing...</Shimmer>
        </div>
      </div>
    </div>
  );
}

export function StreamingToolCallItem({ toolCall }: { toolCall: StreamingToolCall }) {
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
              className="max-w-full max-h-72 object-contain bg-muted/50"
            />
          </div>
        )}
      </ToolContent>
    </Tool>
  );
}
