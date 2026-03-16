export interface OtelAttribute {
  Key: string;
  Value: {
    Type: string;
    Value: string | number | string[];
  };
}

export interface OtelSpanContext {
  TraceID: string;
  SpanID: string;
  TraceFlags: string;
  TraceState: string;
  Remote: boolean;
}

export interface OtelSpan {
  Name: string;
  SpanContext: OtelSpanContext;
  Parent: OtelSpanContext;
  SpanKind: number;
  StartTime: string;
  EndTime: string;
  Attributes: OtelAttribute[];
  Status: { Code: string; Description: string };
  ChildSpanCount: number;
}

export interface ThinkingPart {
  index: number;
  type: "thought" | "text";
  thought?: boolean;
  text_len: number;
  text: string;
}

export interface ThinkingTrace {
  test_name: string;
  model: string;
  thinking_level: string;
  system_instruction?: string;
  user_prompt?: string;
  elapsed_ms: number;
  input_tokens: number;
  output_tokens: number;
  thoughts_tokens: number;
  total_tokens?: number;
  parts: ThinkingPart[];
  thought_summary?: string;
  answer?: string;
}

export type TimelineEventType =
  | "agent"
  | "llm_call"
  | "tool_call"
  | "thought"
  | "text";

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  timestamp: string;
  duration_ms?: number;
  model?: string;
  tokens?: { input: number; output: number; thoughts?: number };
  tool_name?: string;
  tool_args?: string;
  tool_response?: string;
  text?: string;
  span_id?: string;
  parent_id?: string;
  children?: TimelineEvent[];
}

export interface TraceSummary {
  trace_id: string;
  source: "otel" | "thinking";
  model: string;
  thinking_level?: string;
  total_duration_ms: number;
  tokens: {
    input: number;
    output: number;
    thoughts: number;
    total: number;
  };
  tool_calls: number;
  llm_calls: number;
  events: TimelineEvent[];
}

export interface TraceFile {
  name: string;
  path: string;
  modified: string;
  source: "otel" | "thinking";
}
