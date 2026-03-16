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
    let closed = false;

    const finish = (status: StreamState["status"], error?: string | null) => {
      if (closed) return;
      closed = true;
      es.close();
      setState((prev) => {
        const next = { ...prev, status, error: error ?? prev.error };
        onCompleteRef.current?.(next);
        return next;
      });
    };

    es.addEventListener("control", (e) => {
      if (closed) return;
      try {
        const control = JSON.parse(e.data);
        if (control.type === "stream_start") {
          if (control.status === "idle") {
            finish("complete");
            return;
          }
          setState((prev) => ({ ...prev, status: "streaming" }));
        } else if (control.type === "stream_end") {
          finish(control.status === "error" ? "error" : "complete", control.error);
        } else if (control.type === "stream_timeout") {
          finish("error", "Stream timed out");
        }
      } catch {
        // skip malformed control
      }
    });

    es.addEventListener("agent_event", (e) => {
      if (closed) return;
      const event = parseAgentEvent(e.data);
      if (!event) return;
      setState((prev) => reduceStreamEvent(prev, event));
    });

    es.onerror = () => {
      finish("error", "Connection lost");
    };

    return () => {
      closed = true;
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
