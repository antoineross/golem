import { useState, useEffect, useCallback, useRef } from "react";
import type { StreamState, AgentEvent } from "@/types/streaming";
import {
  createInitialStreamState,
  reduceStreamEvent,
  parseAgentEvent,
} from "@/types/streaming";

const API_BASE = import.meta.env.DEV ? "http://localhost:3000" : "";

interface UseAgentStreamOptions {
  enabled: boolean;
  onComplete?: (state: StreamState) => void;
}

export function useAgentStream({ enabled, onComplete }: UseAgentStreamOptions) {
  const [state, setState] = useState<StreamState>(createInitialStreamState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const reset = useCallback(() => {
    setState(createInitialStreamState());
  }, []);

  useEffect(() => {
    if (!enabled) return;

    setState((prev) => ({ ...prev, status: "connecting" }));

    const es = new EventSource(`${API_BASE}/api/agent/stream`);

    es.addEventListener("control", (e) => {
      try {
        const control = JSON.parse(e.data);
        if (control.type === "stream_start") {
          setState((prev) => ({ ...prev, status: "streaming" }));
        } else if (control.type === "stream_end") {
          const finalStatus = control.status === "error" ? "error" : "complete";
          setState((prev) => {
            const next = {
              ...prev,
              status: finalStatus as StreamState["status"],
              error: control.error ?? prev.error,
            };
            onCompleteRef.current?.(next);
            return next;
          });
          es.close();
        } else if (control.type === "stream_timeout") {
          setState((prev) => ({ ...prev, status: "error", error: "Stream timed out" }));
          es.close();
        }
      } catch {
        // skip malformed control
      }
    });

    es.addEventListener("agent_event", (e) => {
      const event = parseAgentEvent(e.data);
      if (!event) return;

      setState((prev) => reduceStreamEvent(prev, event));
    });

    es.onerror = () => {
      if (stateRef.current.status === "streaming" || stateRef.current.status === "connecting") {
        setState((prev) => {
          const next = { ...prev, status: "error" as const, error: "Connection lost" };
          onCompleteRef.current?.(next);
          return next;
        });
      }
      es.close();
    };

    return () => {
      es.close();
    };
  }, [enabled]);

  return { state, reset };
}

export function useMockAgentStream(events: AgentEvent[], intervalMs = 500) {
  const [state, setState] = useState<StreamState>(createInitialStreamState);
  const [isPlaying, setIsPlaying] = useState(false);
  const idxRef = useRef(0);

  const play = useCallback(() => {
    idxRef.current = 0;
    setState({ ...createInitialStreamState(), status: "streaming" });
    setIsPlaying(true);
  }, []);

  const stop = useCallback(() => {
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    if (!isPlaying || events.length === 0) return;

    const timer = setInterval(() => {
      const idx = idxRef.current;
      if (idx >= events.length) {
        setState((prev) => ({ ...prev, status: "complete" }));
        setIsPlaying(false);
        clearInterval(timer);
        return;
      }
      const event = events[idx];
      if (event) {
        setState((prev) => reduceStreamEvent(prev, event));
      }
      idxRef.current = idx + 1;
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, events, intervalMs]);

  return { state, play, stop, isPlaying };
}
