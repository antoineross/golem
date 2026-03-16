import { Card, CardContent } from "@/components/ui/card";
import { EyeIcon } from "@heroicons/react/20/solid";

export function EmptyState() {
  return (
    <Card>
      <CardContent className="text-center py-16 text-muted-foreground">
        <EyeIcon className="h-12 w-12 mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium text-foreground">G.O.L.E.M. Observer</p>
        <p className="text-sm mt-1 max-w-md mx-auto">
          Real-time observability dashboard for the G.O.L.E.M. security agent.
          Run scenarios from the sidebar to watch the agent reason, call tools,
          and discover vulnerabilities in real-time.
        </p>
        <div className="mt-6 grid grid-cols-3 gap-4 max-w-lg mx-auto text-xs">
          <div className="rounded-md bg-muted p-3">
            <p className="font-medium text-foreground">Scenarios</p>
            <p className="mt-1">Pre-built test harnesses at different difficulty levels</p>
          </div>
          <div className="rounded-md bg-muted p-3">
            <p className="font-medium text-foreground">Live Streaming</p>
            <p className="mt-1">Watch agent events as they happen in real-time via SSE</p>
          </div>
          <div className="rounded-md bg-muted p-3">
            <p className="font-medium text-foreground">Trace Replay</p>
            <p className="mt-1">Step through past runs at custom speed for analysis</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
