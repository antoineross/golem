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
import { Brain, Wrench, MessageSquare, Bot, FileText, Camera } from "lucide-react";

const typeConfig: Record<
  string,
  { color: string; borderColor: string; icon: React.ReactNode; badge: string }
> = {
  thought: {
    color: "text-blue-400",
    borderColor: "border-l-blue-500",
    icon: <Brain className="h-4 w-4" />,
    badge: "Thought",
  },
  tool_call: {
    color: "text-green-400",
    borderColor: "border-l-green-500",
    icon: <Wrench className="h-4 w-4" />,
    badge: "Tool Call",
  },
  llm_call: {
    color: "text-cyan-400",
    borderColor: "border-l-cyan-500",
    icon: <MessageSquare className="h-4 w-4" />,
    badge: "LLM Call",
  },
  agent: {
    color: "text-purple-400",
    borderColor: "border-l-purple-500",
    icon: <Bot className="h-4 w-4" />,
    badge: "Agent",
  },
  text: {
    color: "text-muted-foreground",
    borderColor: "border-l-muted",
    icon: <FileText className="h-4 w-4" />,
    badge: "Text",
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

  return (
    <ScrollArea className="h-[calc(100vh-220px)]">
      <div className="space-y-2 pr-4">
        <Accordion multiple className="space-y-2">
          {events.map((event) => (
            <TimelineCard key={event.id} event={event} />
          ))}
        </Accordion>
      </div>
    </ScrollArea>
  );
}

function TimelineCard({ event }: { event: TimelineEvent }) {
  const config = typeConfig[event.type] ?? typeConfig.text;

  const formatDuration = (ms?: number) => {
    if (ms === undefined) return "";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <AccordionItem value={event.id} className="border-0">
      <Card className={`border-l-2 ${config.borderColor}`}>
        <AccordionTrigger className="p-3 hover:no-underline">
          <div className="flex items-center justify-between w-full pr-2">
            <div className="flex items-center gap-2">
              <span className={config.color}>{config.icon}</span>
              <Badge variant="outline" className={`text-xs ${config.color}`}>
                {config.badge}
              </Badge>
              <span className="text-sm">{event.title}</span>
              {event.screenshot_url && (
                <Camera className="h-3 w-3 text-amber-400" />
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {event.tokens && (
                <span>
                  {event.tokens.input + event.tokens.output} tokens
                </span>
              )}
              {event.duration_ms !== undefined && (
                <span>{formatDuration(event.duration_ms)}</span>
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
    <div className="space-y-2">
      {event.tool_name && event.tool_args && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">
            Arguments:
          </span>
          <pre className="mt-1 text-xs text-green-600 dark:text-green-400 bg-muted rounded p-2 font-mono overflow-x-auto">
            {formatJson(event.tool_args)}
          </pre>
        </div>
      )}

      {event.tool_name && event.tool_response && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">
            Response:
          </span>
          <pre className="mt-1 text-xs text-orange-600 dark:text-orange-400 bg-muted rounded p-2 font-mono overflow-x-auto max-h-48 overflow-y-auto">
            {formatJson(event.tool_response)}
          </pre>
        </div>
      )}

      {event.screenshot_url && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">
            Screenshot:
          </span>
          <img
            src={event.screenshot_url}
            alt={`Screenshot from ${event.tool_name}`}
            className="mt-1 rounded border border-border max-w-full max-h-64 object-contain"
          />
        </div>
      )}

      {event.text && !event.tool_name && (
        <pre className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted rounded p-3 max-h-96 overflow-y-auto font-mono">
          {event.text}
        </pre>
      )}

      {event.tool_name && event.text && (
        <details className="mt-1">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            Span metadata
          </summary>
          <pre className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap bg-muted rounded p-2 font-mono max-h-48 overflow-y-auto">
            {event.text.split("\n").filter(l => !l.startsWith("Arguments:") && !l.startsWith("Response:") && !l.startsWith("{")).join("\n").trim()}
          </pre>
        </details>
      )}
    </div>
  );
}

function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
