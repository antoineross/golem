import type {
  OtelSpan,
  OtelAttribute,
  TimelineEvent,
  TraceSummary,
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
  let inString = false;
  let escaped = false;

  for (const char of raw) {
    if (escaped) {
      if (depth > 0) current += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && inString) {
      if (depth > 0) current += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      if (depth > 0) current += char;
      continue;
    }
    if (inString) {
      if (depth > 0) current += char;
      continue;
    }
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

function extractScreenshotUrl(
  toolName: string | undefined,
  toolResponse: string | undefined
): string | undefined {
  if (!toolResponse || (toolName !== "screenshot" && toolName !== "click")) {
    return undefined;
  }
  const urlMatch = toolResponse.match(
    /https?:\/\/[^\s"',}]+\.(?:png|jpg|jpeg|webp|gif)(?:\?[^\s"',}]*)?/i
  );
  return urlMatch?.[0];
}

function formatAllAttributes(attrs: OtelAttribute[] | undefined | null): string {
  if (!attrs || attrs.length === 0) return "(no attributes)";
  return attrs
    .map((a) => {
      const val = Array.isArray(a.Value.Value)
        ? a.Value.Value.join(", ")
        : String(a.Value.Value);
      return `${a.Key}: ${val}`;
    })
    .join("\n");
}

function otelSpanToEvent(span: OtelSpan): TimelineEvent {
  const op = getAttr(span.Attributes, "gen_ai.operation.name") as string;
  const duration = spanDurationMs(span);

  if (op === "invoke_agent") {
    const agentName = getAttr(span.Attributes, "gen_ai.agent.name") as
      | string
      | undefined;
    const description = getAttr(span.Attributes, "gen_ai.agent.description") as
      | string
      | undefined;
    const conversationId = getAttr(
      span.Attributes,
      "gen_ai.conversation.id"
    ) as string | undefined;
    const invocationId = getAttr(
      span.Attributes,
      "gcp.vertex.agent.invocation_id"
    ) as string | undefined;
    const childSpans = span.ChildSpanCount;

    const lines: string[] = [];
    lines.push(`Agent: ${agentName ?? span.Name}`);
    if (description) lines.push(`Description: ${description}`);
    if (conversationId) lines.push(`Conversation: ${conversationId}`);
    if (invocationId) lines.push(`Invocation: ${invocationId}`);
    lines.push(`Child spans: ${childSpans}`);
    lines.push(`Duration: ${duration}ms`);

    return {
      id: span.SpanContext.SpanID,
      type: "agent",
      title: `Agent: ${agentName ?? span.Name}`,
      timestamp: span.StartTime,
      duration_ms: duration,
      text: lines.join("\n"),
      span_id: span.SpanContext.SpanID,
      parent_id: span.Parent.SpanID,
    };
  }

  if (op === "execute_tool") {
    const toolName = getAttr(span.Attributes, "gen_ai.tool.name") as string;
    const toolArgs = getAttr(
      span.Attributes,
      "gcp.vertex.agent.tool_call_args"
    ) as string | undefined;
    const toolResponse = getAttr(
      span.Attributes,
      "gcp.vertex.agent.tool_response"
    ) as string | undefined;
    const toolDescription = getAttr(
      span.Attributes,
      "gen_ai.tool.description"
    ) as string | undefined;
    const toolCallId = getAttr(span.Attributes, "gen_ai.tool.call.id") as
      | string
      | undefined;
    const screenshotUrl = extractScreenshotUrl(toolName, toolResponse);

    const lines: string[] = [];
    lines.push(`Tool: ${toolName}`);
    if (toolDescription) lines.push(`Description: ${toolDescription}`);
    if (toolCallId) lines.push(`Call ID: ${toolCallId}`);
    lines.push(`Duration: ${duration}ms`);
    if (toolArgs) lines.push(`\nArguments:\n${toolArgs}`);
    if (toolResponse) lines.push(`\nResponse:\n${toolResponse}`);

    return {
      id: span.SpanContext.SpanID,
      type: "tool_call",
      title: `Tool: ${toolName}`,
      timestamp: span.StartTime,
      duration_ms: duration,
      tool_name: toolName,
      tool_args: toolArgs,
      tool_response: toolResponse,
      text: lines.join("\n"),
      screenshot_url: screenshotUrl,
      span_id: span.SpanContext.SpanID,
      parent_id: span.Parent.SpanID,
    };
  }

  if (op === "generate_content") {
    const model = getAttr(span.Attributes, "gen_ai.request.model") as string;
    const inputTokens =
      (getAttr(span.Attributes, "gen_ai.usage.input_tokens") as number) || 0;
    const outputTokens =
      (getAttr(span.Attributes, "gen_ai.usage.output_tokens") as number) || 0;
    const finishReasons = getAttr(
      span.Attributes,
      "gen_ai.response.finish_reasons"
    );
    const invocationId = getAttr(
      span.Attributes,
      "gcp.vertex.agent.invocation_id"
    ) as string | undefined;
    const eventId = getAttr(span.Attributes, "gcp.vertex.agent.event_id") as
      | string
      | undefined;

    const finishStr = Array.isArray(finishReasons)
      ? finishReasons.join(", ")
      : finishReasons
        ? String(finishReasons)
        : "unknown";

    const lines: string[] = [];
    lines.push(`Model: ${model}`);
    lines.push(
      `Tokens: ${inputTokens} input / ${outputTokens} output (${inputTokens + outputTokens} total)`
    );
    lines.push(`Finish reason: ${finishStr}`);
    if (invocationId) lines.push(`Invocation: ${invocationId}`);
    if (eventId) lines.push(`Event ID: ${eventId}`);
    lines.push(`Duration: ${duration}ms`);
    lines.push(
      `\nNote: Full prompt/response content requires GOLEM_TRACE_CAPTURE_CONTENT=true`
    );

    return {
      id: span.SpanContext.SpanID,
      type: "llm_call",
      title: `LLM: ${model}`,
      timestamp: span.StartTime,
      duration_ms: duration,
      model,
      tokens: { input: inputTokens, output: outputTokens },
      text: lines.join("\n"),
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
    text: formatAllAttributes(span.Attributes),
    span_id: span.SpanContext.SpanID,
    parent_id: span.Parent.SpanID,
  };
}

export function parseOtelTrace(raw: string): TraceSummary {
  const spans = parseOtelSpans(raw).filter(isValidSpan);

  const events = spans
    .map(otelSpanToEvent)
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

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
      totalInput +=
        (getAttr(span.Attributes, "gen_ai.usage.input_tokens") as number) || 0;
      totalOutput +=
        (getAttr(span.Attributes, "gen_ai.usage.output_tokens") as number) || 0;
    }
    if (op === "execute_tool") toolCalls++;
  }

  const model = spans.find(
    (s) =>
      getAttr(s.Attributes, "gen_ai.operation.name") === "generate_content"
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
