export type AgentEventType =
  | "user_prompt"
  | "thought"
  | "tool_call"
  | "tool_response"
  | "llm_response"
  | "error"
  | "run_complete";

export interface AgentEvent {
  timestamp: string;
  type: AgentEventType;
  agent?: string;
  model?: string;
  prompt_parts?: number;
  tools_available?: number;
  response_text?: string;
  thought_text?: string;
  is_final?: boolean;
  finish_reasons?: string;
  tool_name?: string;
  tool_args?: string;
  tool_response?: string;
  screenshot_url?: string;
  input_tokens?: number;
  output_tokens?: number;
  think_tokens?: number;
  duration_ms?: number;
}

export type StreamStatus = "connecting" | "streaming" | "complete" | "error" | "idle";

export type ToolState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error";

export interface StreamingToolCall {
  id: string;
  name: string;
  args: string;
  state: ToolState;
  response?: string;
  screenshotUrl?: string;
  timestamp: string;
}

export interface StreamState {
  status: StreamStatus;
  events: AgentEvent[];
  userPrompt: string | null;
  thoughts: Array<{ text: string; isStreaming: boolean; timestamp: string }>;
  toolCalls: StreamingToolCall[];
  responses: Array<{ text: string; isFinal: boolean; timestamp: string }>;
  error: string | null;
  model: string | null;
  totalEvents: number;
}

export function parseAgentEvent(data: string): AgentEvent | null {
  try {
    return JSON.parse(data) as AgentEvent;
  } catch {
    return null;
  }
}

export function createInitialStreamState(): StreamState {
  return {
    status: "idle",
    events: [],
    userPrompt: null,
    thoughts: [],
    toolCalls: [],
    responses: [],
    error: null,
    model: null,
    totalEvents: 0,
  };
}

export function reduceStreamEvent(
  state: StreamState,
  event: AgentEvent
): StreamState {
  const next = { ...state, events: [...state.events, event], totalEvents: state.totalEvents + 1 };

  if (event.model && !next.model) {
    next.model = event.model;
  }

  switch (event.type) {
    case "user_prompt":
      next.userPrompt = event.response_text ?? null;
      break;

    case "thought":
      next.thoughts = [
        ...state.thoughts,
        { text: event.thought_text ?? "", isStreaming: true, timestamp: event.timestamp },
      ];
      break;

    case "tool_call": {
      const toolCall: StreamingToolCall = {
        id: `tool-${next.toolCalls.length}`,
        name: event.tool_name ?? "unknown",
        args: event.tool_args ?? "{}",
        state: "input-available",
        timestamp: event.timestamp,
      };
      next.toolCalls = [...state.toolCalls, toolCall];
      // Mark any previous thoughts as done streaming
      next.thoughts = state.thoughts.map((t) => ({ ...t, isStreaming: false }));
      break;
    }

    case "tool_response": {
      const toolIdx = [...state.toolCalls]
        .reverse()
        .findIndex((tc) => tc.name === event.tool_name && tc.state === "input-available");
      if (toolIdx >= 0) {
        const realIdx = state.toolCalls.length - 1 - toolIdx;
        next.toolCalls = state.toolCalls.map((tc, i) =>
          i === realIdx
            ? {
                ...tc,
                state: "output-available" as ToolState,
                response: event.tool_response,
                screenshotUrl: event.screenshot_url,
              }
            : tc
        );
      }
      break;
    }

    case "llm_response":
      next.responses = [
        ...state.responses,
        {
          text: event.response_text ?? "",
          isFinal: event.is_final ?? false,
          timestamp: event.timestamp,
        },
      ];
      next.thoughts = state.thoughts.map((t) => ({ ...t, isStreaming: false }));
      break;

    case "error":
      next.error = event.response_text ?? "Unknown error";
      next.status = "error";
      break;

    case "run_complete":
      next.status = "complete";
      next.thoughts = state.thoughts.map((t) => ({ ...t, isStreaming: false }));
      break;
  }

  return next;
}
