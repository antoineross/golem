import type { TimelineEvent } from "@/types/trace";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LightBulbIcon,
  WrenchScrewdriverIcon,
  ChatBubbleLeftRightIcon,
  CpuChipIcon,
  DocumentTextIcon,
  CameraIcon,
} from "@heroicons/react/20/solid";

const typeConfig: Record<
  string,
  { color: string; borderColor: string; icon: React.ReactNode; label: string }
> = {
  thought: {
    color: "text-blue-400",
    borderColor: "border-l-blue-500",
    icon: <LightBulbIcon className="h-4 w-4" />,
    label: "Thought",
  },
  tool_call: {
    color: "text-green-400",
    borderColor: "border-l-green-500",
    icon: <WrenchScrewdriverIcon className="h-4 w-4" />,
    label: "Tool",
  },
  llm_call: {
    color: "text-cyan-400",
    borderColor: "border-l-cyan-500",
    icon: <ChatBubbleLeftRightIcon className="h-4 w-4" />,
    label: "LLM",
  },
  agent: {
    color: "text-purple-400",
    borderColor: "border-l-purple-500",
    icon: <CpuChipIcon className="h-4 w-4" />,
    label: "Agent",
  },
  text: {
    color: "text-muted-foreground",
    borderColor: "border-l-muted",
    icon: <DocumentTextIcon className="h-4 w-4" />,
    label: "Text",
  },
};

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

  const defaultOpen = events
    .filter((e) => e.id === "user-prompt" || e.title === "User Prompt")
    .map((e) => e.id);

  return (
    <ScrollArea className="h-[calc(100vh-260px)]">
      <Accordion multiple defaultValue={defaultOpen} className="space-y-1.5 pr-4">
        {events.map((event) => (
          <TimelineCard key={event.id} event={event} />
        ))}
      </Accordion>
    </ScrollArea>
  );
}

function TimelineCard({ event }: { event: TimelineEvent }) {
  const config = typeConfig[event.type] ?? typeConfig.text;

  return (
    <AccordionItem value={event.id} className="border-0">
      <Card className={`border-l-2 ${config.borderColor} overflow-hidden`}>
        <AccordionTrigger className="px-3 py-2.5 hover:no-underline">
          <div className="flex items-center justify-between w-full pr-2 gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className={config.color}>{config.icon}</span>
              <Badge
                variant="outline"
                className={`text-[10px] shrink-0 ${config.color}`}
              >
                {config.label}
              </Badge>
              <span className="text-sm truncate">{event.title}</span>
              {event.screenshot_url && (
                <CameraIcon className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
              {event.tokens && (
                <span className="tabular-nums">
                  {(event.tokens.input + event.tokens.output).toLocaleString()}{" "}
                  tok
                </span>
              )}
              {event.duration_ms !== undefined && (
                <span className="tabular-nums">
                  {formatDuration(event.duration_ms)}
                </span>
              )}
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-3 pb-3">
          <EventContent event={event} />
        </AccordionContent>
      </Card>
    </AccordionItem>
  );
}

function EventContent({ event }: { event: TimelineEvent }) {
  return (
    <div className="space-y-3">
      {event.tool_name && event.tool_args && (
        <div className="rounded-md bg-muted p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            Arguments
          </div>
          <pre className="text-xs text-green-600 dark:text-green-400 font-mono overflow-x-auto whitespace-pre-wrap">
            {formatJson(event.tool_args)}
          </pre>
        </div>
      )}

      {event.tool_name && event.tool_response && (
        <div className="rounded-md bg-muted p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            Response
          </div>
          <pre className="text-xs text-orange-600 dark:text-orange-400 font-mono overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
            {formatJson(event.tool_response)}
          </pre>
        </div>
      )}

      {event.screenshot_url && (
        <div className="rounded-md border border-border overflow-hidden">
          <div className="bg-muted px-3 py-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Screenshot
            </span>
          </div>
          <img
            src={event.screenshot_url}
            alt={`Screenshot from ${event.tool_name}`}
            className="max-w-full max-h-72 object-contain bg-muted/50"
          />
        </div>
      )}

      {event.text && !event.tool_name && (
        <div className="rounded-md bg-muted p-3">
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono max-h-[500px] overflow-y-auto leading-relaxed">
            {event.text}
          </pre>
        </div>
      )}

      {event.tool_name && event.text && (
        <Accordion className="border-0">
          <AccordionItem value="span-meta" className="border-0">
            <AccordionTrigger className="py-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground hover:no-underline">
              Span metadata
            </AccordionTrigger>
            <AccordionContent>
              <div className="rounded-md bg-muted p-2">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono max-h-36 overflow-y-auto">
                  {event.text
                    .split("\n")
                    .filter(
                      (l) =>
                        !l.startsWith("Arguments:") &&
                        !l.startsWith("Response:") &&
                        !l.startsWith("{")
                    )
                    .join("\n")
                    .trim()}
                </pre>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
