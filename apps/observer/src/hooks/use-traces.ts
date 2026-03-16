import { useState, useEffect, useCallback, useRef } from "react";
import type { TraceSummary, TraceFile } from "@/types/trace";
import { parseTrace, mergeCompanionEvents } from "@/lib/parse-trace";

const API_BASE = import.meta.env.DEV ? "http://localhost:3000" : "";

export function useTraceList() {
  const [files, setFiles] = useState<TraceFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    fetch(`${API_BASE}/api/traces`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setFiles(data.files ?? []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("failed to fetch trace list:", err);
        setError(err.message);
        setLoading(false);
      });
  }, [refreshCount]);

  const refresh = useCallback(() => setRefreshCount((c) => c + 1), []);
  return { files, loading, error, refresh };
}

export function useTrace(filePath: string | null) {
  const [trace, setTrace] = useState<TraceSummary | null>(null);
  const [raw, setRaw] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTrace = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      try {
        const url = path === "default"
          ? `${API_BASE}/api/traces/default`
          : `${API_BASE}/api/traces/${encodeURIComponent(path)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const content = data.content as string;
        const events = (data.events as string) ?? null;
        setRaw(content);
        let parsed = parseTrace(content);
        if (events) {
          parsed = mergeCompanionEvents(parsed, events);
        }
        setTrace(parsed);
      } catch (err: unknown) {
        console.error(`failed to load trace ${path}:`, err);
        setError(err instanceof Error ? err.message : "unknown error");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (filePath) loadTrace(filePath);
  }, [filePath, loadTrace]);

  return { trace, raw, loading, error, reload: () => filePath && loadTrace(filePath) };
}

export function useTraceSSE(
  onTrace: (trace: TraceSummary, raw: string) => void,
  enabled = true,
  traceFile?: string | null,
) {
  const onTraceRef = useRef(onTrace);
  onTraceRef.current = onTrace;

  useEffect(() => {
    if (!enabled) return;
    const params = traceFile ? `?file=${encodeURIComponent(traceFile)}` : "";
    const es = new EventSource(`${API_BASE}/api/traces/stream${params}`);
    es.addEventListener("trace", (e) => {
      try {
        const payload = JSON.parse(e.data);
        const content = payload.content as string;
        const events = (payload.events as string) ?? null;
        let parsed = parseTrace(content);
        if (events) {
          parsed = mergeCompanionEvents(parsed, events);
        }
        onTraceRef.current(parsed, content);
      } catch (err) {
        console.warn("failed to parse SSE trace data:", err);
      }
    });
    return () => es.close();
  }, [enabled, traceFile]);
}
