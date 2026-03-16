import type {
  OtelSpan,
  OtelAttribute,
  ThinkingTrace,
  TraceSummary,
  TimelineEvent,
} from "@/types/trace";

function getAttr(
  attrs: OtelAttribute[] | undefined | null,
  key: string
): string | number | string[] | undefined {
  if (!attrs) return undefined;
  const attr = attrs.find((a) => a.Key === key);
  return attr?.Value.Value;
}

function spanDurationMs(span: OtelSpan): number {
  const start = new Date(span.StartTime).getTime();
  const end = new Date(span.EndTime).getTime();
  return end - start;
}

function parseOtelSpans(raw: string): OtelSpan[] {
  const spans: OtelSpan[] = [];
  let depth = 0;
  let current = "";

  for (const char of raw) {
    if (char === "{") {
      if (depth === 0) current = "";
      depth++;
    }
    if (depth > 0) current += char;
    if (char === "}") {
      depth--;
      if (depth === 0 && current.trim()) {
        try {
          spans.push(JSON.parse(current));
        } catch {
          // skip malformed span
        }
      }
    }
  }
  return spans;
}

function isValidSpan(span: OtelSpan): boolean {
  return Boolean(span.SpanContext?.SpanID && span.StartTime && span.EndTime);
}

function otelSpanToEvent(span: OtelSpan): TimelineEvent {
  const op = getAttr(span.Attributes, "gen_ai.operation.name") as string;
  const duration = spanDurationMs(span);

  if (op === "invoke_agent") {
    return {
      id: span.SpanContext.SpanID,
      type: "agent",
      title: `Agent: ${getAttr(span.Attributes, "gen_ai.agent.name") ?? span.Name}`,
      timestamp: span.StartTime,
      duration_ms: duration,
      span_id: span.SpanContext.SpanID,
      parent_id: span.Parent.SpanID,
    };
  }

  if (op === "execute_tool") {
    const toolName = getAttr(span.Attributes, "gen_ai.tool.name") as string;
    return {
      id: span.SpanContext.SpanID,
      type: "tool_call",
      title: `Tool: ${toolName}`,
      timestamp: span.StartTime,
      duration_ms: duration,
      tool_name: toolName,
      tool_args: getAttr(span.Attributes, "gcp.vertex.agent.tool_call_args") as string,
      tool_response: getAttr(span.Attributes, "gcp.vertex.agent.tool_response") as string,
      span_id: span.SpanContext.SpanID,
      parent_id: span.Parent.SpanID,
    };
  }

  if (op === "generate_content") {
    const model = getAttr(span.Attributes, "gen_ai.request.model") as string;
    const inputTokens = getAttr(span.Attributes, "gen_ai.usage.input_tokens") as number;
    const outputTokens = getAttr(span.Attributes, "gen_ai.usage.output_tokens") as number;
    return {
      id: span.SpanContext.SpanID,
      type: "llm_call",
      title: `LLM: ${model}`,
      timestamp: span.StartTime,
      duration_ms: duration,
      model,
      tokens: { input: inputTokens || 0, output: outputTokens || 0 },
      span_id: span.SpanContext.SpanID,
      parent_id: span.Parent.SpanID,
    };
  }

  return {
    id: span.SpanContext.SpanID,
    type: "text",
    title: span.Name,
    timestamp: span.StartTime,
    duration_ms: duration,
    span_id: span.SpanContext.SpanID,
    parent_id: span.Parent.SpanID,
  };
}

export function parseOtelTrace(raw: string): TraceSummary {
  const spans = parseOtelSpans(raw).filter(isValidSpan);

  const events = spans
    .map(otelSpanToEvent)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const agentSpan = spans.find(
    (s) => getAttr(s.Attributes, "gen_ai.operation.name") === "invoke_agent"
  );

  let totalInput = 0;
  let totalOutput = 0;
  let toolCalls = 0;
  let llmCalls = 0;

  for (const span of spans) {
    const op = getAttr(span.Attributes, "gen_ai.operation.name");
    if (op === "generate_content") {
      llmCalls++;
      totalInput += (getAttr(span.Attributes, "gen_ai.usage.input_tokens") as number) || 0;
      totalOutput += (getAttr(span.Attributes, "gen_ai.usage.output_tokens") as number) || 0;
    }
    if (op === "execute_tool") toolCalls++;
  }

  const model = spans.find(
    (s) => getAttr(s.Attributes, "gen_ai.operation.name") === "generate_content"
  );
  const modelName = model
    ? (getAttr(model.Attributes, "gen_ai.request.model") as string)
    : "unknown";

  return {
    trace_id: agentSpan?.SpanContext.TraceID ?? "unknown",
    source: "otel",
    model: modelName,
    total_duration_ms: agentSpan ? spanDurationMs(agentSpan) : 0,
    tokens: {
      input: totalInput,
      output: totalOutput,
      thoughts: 0,
      total: totalInput + totalOutput,
    },
    tool_calls: toolCalls,
    llm_calls: llmCalls,
    events,
  };
}

export function parseThinkingTrace(raw: string): TraceSummary {
  const trace: ThinkingTrace = JSON.parse(raw);

  const events: TimelineEvent[] = trace.parts.map((part, i) => ({
    id: `part-${i}`,
    type: part.type === "thought" ? "thought" : "text",
    title: part.type === "thought" ? "Thinking" : "Response",
    timestamp: new Date().toISOString(),
    text: part.text,
  }));

  return {
    trace_id: trace.test_name,
    source: "thinking",
    model: trace.model,
    thinking_level: trace.thinking_level,
    total_duration_ms: trace.elapsed_ms,
    tokens: {
      input: trace.input_tokens,
      output: trace.output_tokens,
      thoughts: trace.thoughts_tokens,
      total: trace.total_tokens ?? trace.input_tokens + trace.output_tokens + trace.thoughts_tokens,
    },
    tool_calls: 0,
    llm_calls: 1,
    events,
  };
}

export function detectTraceFormat(raw: string): "otel" | "thinking" {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if ("parts" in parsed && "thinking_level" in parsed) return "thinking";
    } catch {
      // Not valid single JSON -- likely concatenated OTel spans
    }
  }
  return "otel";
}

export function parseTrace(raw: string): TraceSummary {
  const format = detectTraceFormat(raw);
  return format === "thinking" ? parseThinkingTrace(raw) : parseOtelTrace(raw);
}
