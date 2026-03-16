import { useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { SummaryHeader } from "@/components/summary-header";
import { Timeline } from "@/components/timeline";
import { RawJsonView } from "@/components/raw-json-view";
import { ScreenshotGallery } from "@/components/screenshot-gallery";
import { TracePicker } from "@/components/trace-picker";
import { useTraceList, useTrace, useTraceSSE } from "@/hooks/use-traces";
import type { TraceSummary } from "@/types/trace";
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
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Eye className="h-5 w-5 text-green-400" />
            <h1 className="text-lg font-semibold tracking-tight">
              G.O.L.E.M. Observer
            </h1>
            <Badge variant="outline" className="text-xs border-zinc-700 text-zinc-400">
              v0.7.1
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLiveEnabled(!liveEnabled)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors ${
                liveEnabled
                  ? "bg-green-900/50 text-green-400 border border-green-700"
                  : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${liveEnabled ? "bg-green-400 animate-pulse" : "bg-zinc-600"}`} />
              {liveEnabled ? "Live" : "Live Off"}
            </button>
            <button
              onClick={reload}
              className="p-1.5 rounded bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
              title="Reload trace"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-4 space-y-4">
        {!filesLoading && files.length > 0 && (
          <>
            <TracePicker
              files={files}
              selected={selectedFile}
              onSelect={handleFileSelect}
            />
            <Separator className="bg-zinc-800" />
          </>
        )}

        {loading && (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full bg-zinc-800" />
            <Skeleton className="h-64 w-full bg-zinc-800" />
          </div>
        )}

        {error && (
          <div className="rounded border border-red-800 bg-red-950/50 p-4 text-red-400 text-sm">
            Failed to load trace: {error}
          </div>
        )}

        {activeTrace && (
          <>
            <SummaryHeader trace={activeTrace} />
            <Tabs defaultValue="timeline" className="w-full">
              <TabsList className="bg-zinc-900 border border-zinc-800">
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="raw">Raw JSON</TabsTrigger>
                <TabsTrigger value="screenshots">Screenshots</TabsTrigger>
              </TabsList>
              <TabsContent value="timeline" className="mt-4">
                <Timeline events={activeTrace.events} />
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
          <div className="text-center py-16 text-zinc-500">
            <Eye className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">Select a trace file to begin</p>
            <p className="text-sm mt-1">
              Or enable live mode to watch for new agent traces
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
