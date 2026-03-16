export type AgentEventType =
  | "user_prompt"
  | "thought"
  | "tool_call"
  | "tool_response"
  | "llm_request"
  | "llm_response"
  | "llm_response_meta"
  | "agent_start"
  | "agent_end"
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

export type LlmCallState = "pending" | "completed";

export interface StreamingToolCall {
  id: string;
  name: string;
  args: string;
  state: ToolState;
  response?: string;
  screenshotUrl?: string;
  screenshotPending?: boolean;
  parentLlmCallId?: string;
  timestamp: string;
}

export interface StreamingLlmCall {
  id: string;
  model: string;
  state: LlmCallState;
  promptParts?: number;
  toolsAvailable?: number;
  promptText?: string;
  inputTokens?: number;
  outputTokens?: number;
  thinkTokens?: number;
  durationMs?: number;
  timestamp: string;
}

export interface StreamState {
  status: StreamStatus;
  events: AgentEvent[];
  userPrompt: string | null;
  agentName: string | null;
  agentActive: boolean;
  thoughts: Array<{ text: string; isStreaming: boolean; timestamp: string }>;
  toolCalls: StreamingToolCall[];
  llmCalls: StreamingLlmCall[];
  responses: Array<{ text: string; isFinal: boolean; timestamp: string }>;
  error: string | null;
  model: string | null;
  totalEvents: number;
  tokens: { input: number; output: number; think: number };
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
    agentName: null,
    agentActive: false,
    thoughts: [],
    toolCalls: [],
    llmCalls: [],
    responses: [],
    error: null,
    model: null,
    totalEvents: 0,
    tokens: { input: 0, output: 0, think: 0 },
  };
}

export function reduceStreamEvent(
  state: StreamState,
  event: AgentEvent
): StreamState {
  const next: StreamState = {
    ...state,
    events: [...state.events, event],
    totalEvents: state.totalEvents + 1,
  };

  if (event.model && !next.model) {
    next.model = event.model;
  }

  switch (event.type) {
    case "user_prompt":
      next.userPrompt = event.response_text ?? null;
      break;

    case "agent_start":
      next.agentName = event.agent ?? null;
      next.agentActive = true;
      break;

    case "agent_end":
      next.agentActive = false;
      break;

    case "llm_request": {
      const llmCall: StreamingLlmCall = {
        id: `llm-${next.llmCalls.length}`,
        model: event.model ?? next.model ?? "unknown",
        state: "pending",
        promptParts: event.prompt_parts,
        toolsAvailable: event.tools_available,
        promptText: event.response_text,
        timestamp: event.timestamp,
      };
      next.llmCalls = [...state.llmCalls, llmCall];
      break;
    }

    case "llm_response_meta": {
      const pendingIdx = [...state.llmCalls]
        .reverse()
        .findIndex((lc) => lc.state === "pending");
      if (pendingIdx >= 0) {
        const realIdx = state.llmCalls.length - 1 - pendingIdx;
        next.llmCalls = state.llmCalls.map((lc, i) =>
          i === realIdx
            ? {
                ...lc,
                state: "completed" as LlmCallState,
                inputTokens: event.input_tokens,
                outputTokens: event.output_tokens,
                thinkTokens: event.think_tokens,
                durationMs: event.duration_ms,
              }
            : lc
        );
      }
      next.tokens = {
        input: state.tokens.input + (event.input_tokens ?? 0),
        output: state.tokens.output + (event.output_tokens ?? 0),
        think: state.tokens.think + (event.think_tokens ?? 0),
      };
      break;
    }

    case "thought":
      next.thoughts = [
        ...state.thoughts,
        { text: event.thought_text ?? "", isStreaming: true, timestamp: event.timestamp },
      ];
      break;

    case "tool_call": {
      const isScreenshotTool = event.tool_name === "screenshot" || event.tool_name === "click";
      const lastLlmCall = state.llmCalls.length > 0
        ? state.llmCalls[state.llmCalls.length - 1]
        : undefined;
      const toolCall: StreamingToolCall = {
        id: `tool-${next.toolCalls.length}`,
        name: event.tool_name ?? "unknown",
        args: event.tool_args ?? "{}",
        state: "input-available",
        screenshotPending: isScreenshotTool,
        parentLlmCallId: lastLlmCall?.id,
        timestamp: event.timestamp,
      };
      next.toolCalls = [...state.toolCalls, toolCall];
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
                screenshotPending: false,
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
      next.llmCalls = state.llmCalls.map((lc) =>
        lc.state === "pending" ? { ...lc, state: "completed" as LlmCallState } : lc
      );
      break;
  }

  return next;
}
