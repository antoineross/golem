import type { ThinkingTrace, TraceSummary, TimelineEvent } from "@/types/trace";

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
      total:
        trace.total_tokens ??
        trace.input_tokens + trace.output_tokens + trace.thoughts_tokens,
    },
    tool_calls: 0,
    llm_calls: 1,
    events,
  };
}
