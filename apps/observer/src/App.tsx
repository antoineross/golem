import { useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { SummaryHeader } from "@/components/summary-header";
import { Timeline } from "@/components/timeline";
import { RawJsonView } from "@/components/raw-json-view";
import { ScreenshotGallery } from "@/components/screenshot-gallery";
import { TracePicker } from "@/components/trace-picker";
import { ScenarioLauncher } from "@/components/scenario-launcher";
import { ReplayControls } from "@/components/replay-controls";
import { useTraceList, useTrace, useTraceSSE } from "@/hooks/use-traces";
import type { TraceSummary, TimelineEvent } from "@/types/trace";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, RefreshCw } from "lucide-react";

export default function App() {
  const { files, loading: filesLoading } = useTraceList();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const { trace, raw, loading, error, reload } = useTrace(
    selectedFile ?? (files.length > 0 ? null : "default")
  );

  const [liveTrace, setLiveTrace] = useState<TraceSummary | null>(null);
  const [liveRaw, setLiveRaw] = useState<string | null>(null);
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [replayMode, setReplayMode] = useState(false);
  const [replayEvents, setReplayEvents] = useState<TimelineEvent[]>([]);

  const handleSSE = useCallback((t: TraceSummary, r: string) => {
    setLiveTrace(t);
    setLiveRaw(r);
  }, []);

  useTraceSSE(liveEnabled ? handleSSE : () => {});

  const activeTrace = liveEnabled && liveTrace ? liveTrace : trace;
  const activeRaw = liveEnabled && liveRaw ? liveRaw : raw;

  const handleFileSelect = (path: string) => {
    setSelectedFile(path);
    setLiveEnabled(false);
    setReplayMode(false);
  };

  const handleRunStarted = () => {
    setLiveEnabled(true);
    setReplayMode(false);
  };

  const handleReplayEvents = useCallback((events: TimelineEvent[]) => {
    setReplayEvents(events);
  }, []);

  const displayEvents = replayMode ? replayEvents : (activeTrace?.events ?? []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Eye className="h-5 w-5 text-green-400" />
            <h1 className="text-lg font-semibold tracking-tight">
              G.O.L.E.M. Observer
            </h1>
            <Badge variant="outline" className="text-xs">
              v0.7.1
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant={replayMode ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => { setReplayMode(!replayMode); setLiveEnabled(false); }}
                    aria-label="Toggle replay mode"
                  />
                }
              >
                {replayMode ? "Replay On" : "Replay"}
              </TooltipTrigger>
              <TooltipContent>Step through events at custom speed</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant={liveEnabled ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => { setLiveEnabled(!liveEnabled); setReplayMode(false); }}
                    aria-label="Toggle live mode"
                  />
                }
              >
                <span className={`h-2 w-2 rounded-full ${liveEnabled ? "bg-green-400 animate-pulse" : "bg-muted-foreground/40"}`} />
                {liveEnabled ? "Live" : "Live Off"}
              </TooltipTrigger>
              <TooltipContent>Stream trace updates in real-time</TooltipContent>
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
                <RefreshCw className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent>Reload current trace</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-4 space-y-4">
        <ScenarioLauncher onRunStarted={handleRunStarted} />

        {!filesLoading && files.length > 0 && (
          <>
            <TracePicker
              files={files}
              selected={selectedFile}
              onSelect={handleFileSelect}
            />
            <Separator />
          </>
        )}

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

            <Tabs defaultValue="timeline" className="w-full">
              <TabsList>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="raw">Raw JSON</TabsTrigger>
                <TabsTrigger value="screenshots">Screenshots</TabsTrigger>
              </TabsList>
              <TabsContent value="timeline" className="mt-4">
                <Timeline events={displayEvents} />
              </TabsContent>
              <TabsContent value="raw" className="mt-4">
                <RawJsonView raw={activeRaw} />
              </TabsContent>
              <TabsContent value="screenshots" className="mt-4">
                <ScreenshotGallery />
              </TabsContent>
            </Tabs>
          </>
        )}

        {!loading && !error && !activeTrace && (
          <div className="text-center py-16 text-muted-foreground">
            <Eye className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">Select a trace file or run a scenario</p>
            <p className="text-sm mt-1">
              Use the launcher above to start an agent run, or enable live mode
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
