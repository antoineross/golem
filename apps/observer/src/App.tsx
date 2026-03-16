import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { SummaryHeader } from "@/components/summary-header";
import { Timeline } from "@/components/timeline";
import { StreamingTimeline } from "@/components/streaming-timeline";
import { RawJsonView } from "@/components/raw-json-view";
import { ScenarioLauncher } from "@/components/scenario-launcher";
import { ReplayControls } from "@/components/replay-controls";
import { SidebarTraceItem } from "@/components/sidebar-trace-item";
import { useTraceList, useTrace, useTraceSSE } from "@/hooks/use-traces";
import { useAgentStream } from "@/hooks/use-agent-stream";
import type { TraceSummary, TimelineEvent } from "@/types/trace";
import { EyeIcon, ArrowPathIcon, PlayIcon, SignalIcon } from "@heroicons/react/20/solid";

type MainView = "timeline" | "raw";

export default function App() {
  const { files, loading: filesLoading, refresh: refreshFiles } = useTraceList();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const { trace, raw, loading, error, reload } = useTrace(selectedFile);

  const [liveTrace, setLiveTrace] = useState<TraceSummary | null>(null);
  const [liveRaw, setLiveRaw] = useState<string | null>(null);
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [liveTraceFile, setLiveTraceFile] = useState<string | null>(null);
  const [streamMode, setStreamMode] = useState(false);
  const [replayMode, setReplayMode] = useState(false);
  const [replayEvents, setReplayEvents] = useState<TimelineEvent[]>([]);
  const [mainView, setMainView] = useState<MainView>("timeline");

  const handleSSE = useCallback((t: TraceSummary, r: string) => {
    setLiveTrace(t);
    setLiveRaw(r);
  }, []);

  useTraceSSE(handleSSE, liveEnabled && !streamMode, liveTraceFile);

  const handleStreamComplete = useCallback(() => {
    setStreamMode(false);
    setLiveEnabled(false);
    refreshFiles();
  }, [refreshFiles]);

  const { state: streamState, reset: resetStream } = useAgentStream({
    enabled: streamMode,
    onComplete: handleStreamComplete,
  });

  const activeTrace = liveEnabled && liveTrace ? liveTrace : trace;
  const activeRaw = liveEnabled && liveRaw ? liveRaw : raw;

  const handleFileSelect = (path: string) => {
    setSelectedFile(path);
    setLiveEnabled(false);
    setLiveTraceFile(null);
    setStreamMode(false);
    setReplayMode(false);
    setMainView("timeline");
  };

  const handleRunStarted = (traceFile: string) => {
    setLiveTraceFile(traceFile);
    resetStream();
    setStreamMode(true);
    setLiveEnabled(false);
    setLiveTrace(null);
    setLiveRaw(null);
    setReplayMode(false);
    setMainView("timeline");
    setTimeout(refreshFiles, 3000);
    setTimeout(refreshFiles, 10000);
  };

  const handleReplayEvents = useCallback((events: TimelineEvent[]) => {
    setReplayEvents(events);
  }, []);

  const displayEvents = replayMode
    ? replayEvents
    : (activeTrace?.events ?? []);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <header className="border-b border-border px-6 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <EyeIcon className="h-5 w-5 text-green-400" />
            <h1 className="text-lg font-semibold tracking-tight">
              G.O.L.E.M. Observer
            </h1>
            <Badge variant="outline" className="text-xs">
              v0.7.2
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant={replayMode ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => {
                      setReplayMode(!replayMode);
                      setLiveEnabled(false);
                    }}
                    aria-label="Toggle replay mode"
                  />
                }
              >
                <PlayIcon className="h-3.5 w-3.5" />
                {replayMode ? "Replay On" : "Replay"}
              </TooltipTrigger>
              <TooltipContent>
                Step through events at custom speed
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant={liveEnabled || streamMode ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => {
                      if (streamMode) {
                        setStreamMode(false);
                      } else {
                        setLiveEnabled(!liveEnabled);
                      }
                      setReplayMode(false);
                    }}
                    aria-label="Toggle live mode"
                  />
                }
              >
                <SignalIcon
                  className={`h-3.5 w-3.5 ${liveEnabled || streamMode ? "text-green-400 animate-pulse" : ""}`}
                />
                {streamMode ? "Streaming" : liveEnabled ? "Live" : "Live Off"}
              </TooltipTrigger>
              <TooltipContent>
                {streamMode
                  ? "Real-time agent event stream active"
                  : "Stream trace updates in real-time"}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={reload}
                    aria-label="Reload trace"
                  />
                }
              >
                <ArrowPathIcon className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent>Reload current trace</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-[280px] shrink-0 border-r border-border bg-muted/50 flex flex-col">
          <div className="p-3 border-b border-border">
            <ScenarioLauncher onRunStarted={handleRunStarted} onRunComplete={refreshFiles} />
          </div>

          <div className="px-3 pt-3 pb-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Trace History
            </span>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="px-2 pb-3 flex flex-col gap-0.5">
              {filesLoading && (
                <div className="space-y-2 p-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              )}

              {!filesLoading && files.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-8">
                  No traces yet. Run a scenario to generate one.
                </div>
              )}

              {!filesLoading &&
                files.map((f) => (
                  <SidebarTraceItem
                    key={f.path}
                    file={f}
                    isSelected={selectedFile === f.path}
                    onSelect={handleFileSelect}
                  />
                ))}
            </div>
          </ScrollArea>

          {!filesLoading && files.length > 0 && (
            <div className="px-3 py-2 border-t border-border">
              <span className="text-[11px] text-muted-foreground">
                {files.length} run{files.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </aside>

        <main className="flex-1 min-w-0 overflow-auto">
          <div className="max-w-[1400px] mx-auto px-6 py-4 space-y-4">
            {streamMode ? (
              <StreamingTimeline state={streamState} />
            ) : (
              <>
                {loading && (
                  <div className="space-y-4">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-64 w-full" />
                  </div>
                )}

                {error && (
                  <div className="rounded border border-destructive bg-destructive/10 p-4 text-destructive text-sm">
                    Failed to load trace: {error}
                  </div>
                )}

                {activeTrace && (
                  <>
                    <SummaryHeader trace={activeTrace} />

                    {replayMode && (
                      <ReplayControls
                        events={activeTrace.events}
                        onVisibleEvents={handleReplayEvents}
                      />
                    )}

                    <div className="flex items-center gap-1 border-b border-border pb-2">
                      <Button
                        variant={mainView === "timeline" ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setMainView("timeline")}
                      >
                        Timeline
                      </Button>
                      <Button
                        variant={mainView === "raw" ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setMainView("raw")}
                      >
                        Raw JSON
                      </Button>
                    </div>

                    {mainView === "timeline" && (
                      <Timeline events={displayEvents} />
                    )}
                    {mainView === "raw" && <RawJsonView raw={activeRaw} />}
                  </>
                )}

                {!loading && !error && !activeTrace && (
                  <Card>
                    <CardContent className="text-center py-16 text-muted-foreground">
                      <EyeIcon className="h-12 w-12 mx-auto mb-4 opacity-30" />
                      <p className="text-lg">Select a trace or run a scenario</p>
                      <p className="text-sm mt-1">Pick from the sidebar, or use the launcher to start an agent run</p>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
