import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { StreamingLlmCall } from "@/types/streaming";
import {
  CheckCircleIcon,
  ClockIcon,
  CpuChipIcon,
} from "@heroicons/react/20/solid";
import { ChevronDownIcon } from "lucide-react";

export function LlmCallCard({ call }: { call: StreamingLlmCall }) {
  const [promptOpen, setPromptOpen] = useState(false);
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
          <Collapsible open={promptOpen} onOpenChange={setPromptOpen}>
            <CollapsibleTrigger className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground">
              Prompt context
              <ChevronDownIcon className={`h-3 w-3 transition-transform ${promptOpen ? "rotate-180" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap font-mono max-h-48 overflow-y-auto rounded-md bg-muted p-2">
                {call.promptText}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
