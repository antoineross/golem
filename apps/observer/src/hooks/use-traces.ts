import { useState, useEffect, useCallback } from "react";
import type { TraceSummary, TraceFile } from "@/types/trace";
import { parseTrace, mergeCompanionEvents } from "@/lib/parse-trace";

const API_BASE = import.meta.env.DEV ? "http://localhost:3000" : "";

export function useTraceList() {
  const [files, setFiles] = useState<TraceFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }, []);

  return { files, loading, error };
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
  enabled = true
) {
  useEffect(() => {
    if (!enabled) return;
    const es = new EventSource(`${API_BASE}/api/traces/stream`);
    es.addEventListener("trace", (e) => {
      const raw = e.data;
      try {
        const parsed = parseTrace(raw);
        onTrace(parsed, raw);
      } catch (e) {
        console.warn("failed to parse SSE trace data:", e);
      }
    });
    return () => es.close();
  }, [onTrace, enabled]);
}
