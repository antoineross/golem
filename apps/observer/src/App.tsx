import { useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { SummaryHeader } from "@/components/summary-header";
import { Timeline } from "@/components/timeline";
import { RawJsonView } from "@/components/raw-json-view";
import { ScreenshotGallery } from "@/components/screenshot-gallery";
import { ScenarioLauncher } from "@/components/scenario-launcher";
import { ReplayControls } from "@/components/replay-controls";
import { useTraceList, useTrace, useTraceSSE } from "@/hooks/use-traces";
import type { TraceSummary, TimelineEvent, TraceFile } from "@/types/trace";
import { Eye, RefreshCw, FileText, Clock } from "lucide-react";

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function parseHarness(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.includes("level0")) return "level0";
  if (lower.includes("thinking")) return "thinking";
  if (lower.includes("agent")) return "agent";
  return "trace";
}

const harnessColors: Record<string, string> = {
  level0: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  agent: "bg-green-500/15 text-green-400 border-green-500/20",
  thinking: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  trace: "bg-muted text-muted-foreground border-border",
};

interface SidebarTraceItemProps {
  file: TraceFile;
  isSelected: boolean;
  onSelect: (path: string) => void;
}

function SidebarTraceItem({
  file,
  isSelected,
  onSelect,
}: SidebarTraceItemProps) {
  const harness = parseHarness(file.path);

  return (
    <Button
      variant="ghost"
      className={`w-full justify-start h-auto px-3 py-2.5 text-left rounded-md ${
        isSelected
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
      onClick={() => onSelect(file.path)}
    >
      <div className="flex flex-col gap-1.5 w-full min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="text-sm font-medium truncate">{file.name}</span>
        </div>
        <div className="flex items-center gap-2 pl-5">
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 h-4 font-normal border ${harnessColors[harness]}`}
          >
            {harness}
          </Badge>
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 h-4 font-normal"
          >
            {file.source}
          </Badge>
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="text-[11px] text-muted-foreground flex items-center gap-1 ml-auto shrink-0 cursor-default" />
              }
            >
              <Clock className="h-3 w-3" />
              {relativeTime(file.modified)}
            </TooltipTrigger>
            <TooltipContent>{new Date(file.modified).toLocaleString()}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </Button>
  );
}

export default function App() {
  const { files, loading: filesLoading } = useTraceList();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const { trace, raw, loading, error, reload } = useTrace(selectedFile);

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

  const displayEvents = replayMode
    ? replayEvents
    : (activeTrace?.events ?? []);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <header className="border-b border-border px-6 py-3 shrink-0">
        <div className="flex items-center justify-between">
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
                    onClick={() => {
                      setReplayMode(!replayMode);
                      setLiveEnabled(false);
                    }}
                    aria-label="Toggle replay mode"
                  />
                }
              >
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
                    variant={liveEnabled ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => {
                      setLiveEnabled(!liveEnabled);
                      setReplayMode(false);
                    }}
                    aria-label="Toggle live mode"
                  />
                }
              >
                <span
                  className={`h-2 w-2 rounded-full ${liveEnabled ? "bg-green-400 animate-pulse" : "bg-muted-foreground/40"}`}
                />
                {liveEnabled ? "Live" : "Live Off"}
              </TooltipTrigger>
              <TooltipContent>
                Stream trace updates in real-time
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
                <RefreshCw className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent>Reload current trace</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-[280px] shrink-0 border-r border-border bg-muted/50 flex flex-col">
          <div className="p-3 border-b border-border">
            <ScenarioLauncher onRunStarted={handleRunStarted} />
          </div>

          <div className="px-3 pt-3 pb-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Trace Files
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
                  No trace files found
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
                {files.length} trace{files.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </aside>

        <main className="flex-1 min-w-0 overflow-auto">
          <div className="max-w-[1400px] mx-auto px-6 py-4 space-y-4">
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
                  Pick a trace from the sidebar, or use the launcher to start an
                  agent run
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
