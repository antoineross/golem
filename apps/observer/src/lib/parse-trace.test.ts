import { describe, it, expect } from "vitest";
import {
  parseOtelTrace,
  parseThinkingTrace,
  detectTraceFormat,
  parseTrace,
  mergeCompanionEvents,
} from "./parse-trace";

const OTEL_SPANS = `{
  "Name": "generate_content gemini-3-flash-preview",
  "SpanContext": {"TraceID": "abc123", "SpanID": "span1", "TraceFlags": "01", "TraceState": "", "Remote": false},
  "Parent": {"TraceID": "abc123", "SpanID": "span0", "TraceFlags": "01", "TraceState": "", "Remote": false},
  "SpanKind": 1,
  "StartTime": "2026-03-16T10:00:00Z",
  "EndTime": "2026-03-16T10:00:03Z",
  "Attributes": [
    {"Key": "gen_ai.operation.name", "Value": {"Type": "STRING", "Value": "generate_content"}},
    {"Key": "gen_ai.request.model", "Value": {"Type": "STRING", "Value": "gemini-3-flash-preview"}},
    {"Key": "gen_ai.usage.input_tokens", "Value": {"Type": "INT64", "Value": 2230}},
    {"Key": "gen_ai.usage.output_tokens", "Value": {"Type": "INT64", "Value": 14}}
  ],
  "Status": {"Code": "Unset", "Description": ""},
  "ChildSpanCount": 0
}
{
  "Name": "execute_tool echo",
  "SpanContext": {"TraceID": "abc123", "SpanID": "span2", "TraceFlags": "01", "TraceState": "", "Remote": false},
  "Parent": {"TraceID": "abc123", "SpanID": "span0", "TraceFlags": "01", "TraceState": "", "Remote": false},
  "SpanKind": 1,
  "StartTime": "2026-03-16T10:00:03Z",
  "EndTime": "2026-03-16T10:00:03.050Z",
  "Attributes": [
    {"Key": "gen_ai.operation.name", "Value": {"Type": "STRING", "Value": "execute_tool"}},
    {"Key": "gen_ai.tool.name", "Value": {"Type": "STRING", "Value": "echo"}},
    {"Key": "gcp.vertex.agent.tool_call_args", "Value": {"Type": "STRING", "Value": "{\\"message\\":\\"hello\\"}"}},
    {"Key": "gcp.vertex.agent.tool_response", "Value": {"Type": "STRING", "Value": "{\\"reply\\":\\"echo: hello\\"}"}}
  ],
  "Status": {"Code": "Unset", "Description": ""},
  "ChildSpanCount": 0
}
{
  "Name": "generate_content gemini-3-flash-preview",
  "SpanContext": {"TraceID": "abc123", "SpanID": "span3", "TraceFlags": "01", "TraceState": "", "Remote": false},
  "Parent": {"TraceID": "abc123", "SpanID": "span0", "TraceFlags": "01", "TraceState": "", "Remote": false},
  "SpanKind": 1,
  "StartTime": "2026-03-16T10:00:03.050Z",
  "EndTime": "2026-03-16T10:00:07Z",
  "Attributes": [
    {"Key": "gen_ai.operation.name", "Value": {"Type": "STRING", "Value": "generate_content"}},
    {"Key": "gen_ai.request.model", "Value": {"Type": "STRING", "Value": "gemini-3-flash-preview"}},
    {"Key": "gen_ai.usage.input_tokens", "Value": {"Type": "INT64", "Value": 2540}},
    {"Key": "gen_ai.usage.output_tokens", "Value": {"Type": "INT64", "Value": 76}}
  ],
  "Status": {"Code": "Unset", "Description": ""},
  "ChildSpanCount": 0
}
{
  "Name": "invoke_agent golem_auditor",
  "SpanContext": {"TraceID": "abc123", "SpanID": "span0", "TraceFlags": "01", "TraceState": "", "Remote": false},
  "Parent": {"TraceID": "00000000000000000000000000000000", "SpanID": "0000000000000000", "TraceFlags": "00", "TraceState": "", "Remote": false},
  "SpanKind": 1,
  "StartTime": "2026-03-16T10:00:00Z",
  "EndTime": "2026-03-16T10:00:07Z",
  "Attributes": [
    {"Key": "gen_ai.operation.name", "Value": {"Type": "STRING", "Value": "invoke_agent"}},
    {"Key": "gen_ai.agent.name", "Value": {"Type": "STRING", "Value": "golem_auditor"}}
  ],
  "Status": {"Code": "Unset", "Description": ""},
  "ChildSpanCount": 3
}`;

const THINKING_TRACE_MEDIUM = JSON.stringify({
  test_name: "medium",
  model: "gemini-3-flash-preview",
  thinking_level: "MEDIUM",
  elapsed_ms: 14821,
  input_tokens: 188,
  output_tokens: 1012,
  thoughts_tokens: 623,
  total_tokens: 1823,
  parts: [
    { index: 0, type: "thought", thought: true, text_len: 3609, text: "Analyzing the form..." },
    { index: 1, type: "text", text_len: 4173, text: "Here are the vulnerabilities..." },
  ],
});

const THINKING_TRACE_LOW = JSON.stringify({
  test_name: "low",
  model: "gemini-3-flash-preview",
  thinking_level: "LOW",
  elapsed_ms: 7643,
  input_tokens: 188,
  output_tokens: 1035,
  thoughts_tokens: 0,
  total_tokens: 1223,
  parts: [
    { index: 0, type: "text", text_len: 4268, text: "This HTML snippet contains vulnerabilities..." },
  ],
});

describe("detectTraceFormat", () => {
  it("detects thinking trace format", () => {
    expect(detectTraceFormat(THINKING_TRACE_MEDIUM)).toBe("thinking");
  });

  it("detects OTel format for concatenated spans", () => {
    expect(detectTraceFormat(OTEL_SPANS)).toBe("otel");
  });

  it("defaults to otel for empty string", () => {
    expect(detectTraceFormat("")).toBe("otel");
  });

  it("defaults to otel for non-JSON content", () => {
    expect(detectTraceFormat("not json at all")).toBe("otel");
  });

  it("detects thinking format with all required fields", () => {
    const trace = JSON.stringify({ parts: [], thinking_level: "HIGH", model: "test" });
    expect(detectTraceFormat(trace)).toBe("thinking");
  });

  it("returns otel for JSON without thinking fields", () => {
    const json = JSON.stringify({ Name: "some_span", SpanContext: {} });
    expect(detectTraceFormat(json)).toBe("otel");
  });
});

describe("parseOtelTrace", () => {
  it("parses concatenated span objects", () => {
    const result = parseOtelTrace(OTEL_SPANS);
    expect(result.events).toHaveLength(4);
  });

  it("extracts trace_id from agent span", () => {
    const result = parseOtelTrace(OTEL_SPANS);
    expect(result.trace_id).toBe("abc123");
  });

  it("identifies the correct model name", () => {
    const result = parseOtelTrace(OTEL_SPANS);
    expect(result.model).toBe("gemini-3-flash-preview");
  });

  it("counts tool calls correctly", () => {
    const result = parseOtelTrace(OTEL_SPANS);
    expect(result.tool_calls).toBe(1);
  });

  it("counts LLM calls correctly", () => {
    const result = parseOtelTrace(OTEL_SPANS);
    expect(result.llm_calls).toBe(2);
  });

  it("sums input tokens across generate_content spans", () => {
    const result = parseOtelTrace(OTEL_SPANS);
    expect(result.tokens.input).toBe(2230 + 2540);
  });

  it("sums output tokens across generate_content spans", () => {
    const result = parseOtelTrace(OTEL_SPANS);
    expect(result.tokens.output).toBe(14 + 76);
  });

  it("calculates total tokens as input + output", () => {
    const result = parseOtelTrace(OTEL_SPANS);
    expect(result.tokens.total).toBe(2230 + 2540 + 14 + 76);
  });

  it("sets thoughts tokens to 0 for OTel traces", () => {
    const result = parseOtelTrace(OTEL_SPANS);
    expect(result.tokens.thoughts).toBe(0);
  });

  it("computes agent duration from invoke_agent span", () => {
    const result = parseOtelTrace(OTEL_SPANS);
    expect(result.total_duration_ms).toBe(7000);
  });

  it("sorts events chronologically", () => {
    const result = parseOtelTrace(OTEL_SPANS);
    for (let i = 1; i < result.events.length; i++) {
      const prev = new Date(result.events[i - 1].timestamp).getTime();
      const curr = new Date(result.events[i].timestamp).getTime();
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  it("maps tool call events with name, args, response", () => {
    const result = parseOtelTrace(OTEL_SPANS);
    const toolEvent = result.events.find((e) => e.type === "tool_call");
    expect(toolEvent).toBeDefined();
    expect(toolEvent!.tool_name).toBe("echo");
    expect(toolEvent!.tool_args).toBe('{"message":"hello"}');
    expect(toolEvent!.tool_response).toBe('{"reply":"echo: hello"}');
  });

  it("maps llm_call events with model and tokens", () => {
    const result = parseOtelTrace(OTEL_SPANS);
    const llmEvent = result.events.find((e) => e.type === "llm_call");
    expect(llmEvent).toBeDefined();
    expect(llmEvent!.model).toBe("gemini-3-flash-preview");
    expect(llmEvent!.tokens).toEqual({ input: 2230, output: 14 });
  });

  it("maps agent event with correct title", () => {
    const result = parseOtelTrace(OTEL_SPANS);
    const agentEvent = result.events.find((e) => e.type === "agent");
    expect(agentEvent).toBeDefined();
    expect(agentEvent!.title).toBe("Agent: golem_auditor");
  });

  it("sets source to otel", () => {
    const result = parseOtelTrace(OTEL_SPANS);
    expect(result.source).toBe("otel");
  });

  it("handles malformed JSON gracefully", () => {
    const broken = '{ "Name": "broken" }{ not json {{{ }';
    const result = parseOtelTrace(broken);
    expect(result.events.length).toBeGreaterThanOrEqual(0);
  });

  it("handles empty input", () => {
    const result = parseOtelTrace("");
    expect(result.events).toHaveLength(0);
    expect(result.trace_id).toBe("unknown");
    expect(result.model).toBe("unknown");
  });
});

describe("parseThinkingTrace", () => {
  it("parses medium thinking trace with thought + text parts", () => {
    const result = parseThinkingTrace(THINKING_TRACE_MEDIUM);
    expect(result.events).toHaveLength(2);
  });

  it("identifies thought and text event types", () => {
    const result = parseThinkingTrace(THINKING_TRACE_MEDIUM);
    expect(result.events[0].type).toBe("thought");
    expect(result.events[1].type).toBe("text");
  });

  it("extracts model name", () => {
    const result = parseThinkingTrace(THINKING_TRACE_MEDIUM);
    expect(result.model).toBe("gemini-3-flash-preview");
  });

  it("extracts thinking level", () => {
    const result = parseThinkingTrace(THINKING_TRACE_MEDIUM);
    expect(result.thinking_level).toBe("MEDIUM");
  });

  it("uses total_tokens when provided", () => {
    const result = parseThinkingTrace(THINKING_TRACE_MEDIUM);
    expect(result.tokens.total).toBe(1823);
  });

  it("computes total when total_tokens is missing", () => {
    const withoutTotal = JSON.parse(THINKING_TRACE_MEDIUM);
    delete withoutTotal.total_tokens;
    const result = parseThinkingTrace(JSON.stringify(withoutTotal));
    expect(result.tokens.total).toBe(188 + 1012 + 623);
  });

  it("sets elapsed_ms correctly", () => {
    const result = parseThinkingTrace(THINKING_TRACE_MEDIUM);
    expect(result.total_duration_ms).toBe(14821);
  });

  it("handles low thinking level (no thoughts)", () => {
    const result = parseThinkingTrace(THINKING_TRACE_LOW);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe("text");
    expect(result.tokens.thoughts).toBe(0);
  });

  it("sets tool_calls to 0 for thinking traces", () => {
    const result = parseThinkingTrace(THINKING_TRACE_MEDIUM);
    expect(result.tool_calls).toBe(0);
  });

  it("sets llm_calls to 1 for thinking traces", () => {
    const result = parseThinkingTrace(THINKING_TRACE_MEDIUM);
    expect(result.llm_calls).toBe(1);
  });

  it("sets source to thinking", () => {
    const result = parseThinkingTrace(THINKING_TRACE_MEDIUM);
    expect(result.source).toBe("thinking");
  });

  it("sets trace_id from test_name", () => {
    const result = parseThinkingTrace(THINKING_TRACE_MEDIUM);
    expect(result.trace_id).toBe("medium");
  });

  it("includes text content in events", () => {
    const result = parseThinkingTrace(THINKING_TRACE_MEDIUM);
    expect(result.events[0].text).toBe("Analyzing the form...");
    expect(result.events[1].text).toBe("Here are the vulnerabilities...");
  });
});

describe("parseTrace (auto-detection)", () => {
  it("auto-detects and parses OTel traces", () => {
    const result = parseTrace(OTEL_SPANS);
    expect(result.source).toBe("otel");
    expect(result.events.length).toBeGreaterThan(0);
  });

  it("auto-detects and parses thinking traces", () => {
    const result = parseTrace(THINKING_TRACE_MEDIUM);
    expect(result.source).toBe("thinking");
    expect(result.thinking_level).toBe("MEDIUM");
  });

  it("auto-detects low thinking traces", () => {
    const result = parseTrace(THINKING_TRACE_LOW);
    expect(result.source).toBe("thinking");
    expect(result.thinking_level).toBe("LOW");
  });
});

describe("mergeCompanionEvents", () => {
  const baseTrace = parseOtelTrace(OTEL_SPANS);

  const ENRICHED_EVENTS = [
    '{"timestamp":"2026-03-16T10:00:00Z","type":"user_prompt","agent":"golem_auditor","response_text":"Hello world"}',
    '{"timestamp":"2026-03-16T10:00:01Z","type":"agent_start","agent":"golem_auditor"}',
    '{"timestamp":"2026-03-16T10:00:02Z","type":"llm_request","agent":"golem_auditor","model":"gemini-3-flash-preview","prompt_parts":1,"tools_available":2,"response_text":"[user] Hello world"}',
    '{"timestamp":"2026-03-16T10:00:03Z","type":"llm_response_meta","agent":"golem_auditor","model":"gemini-3-flash-preview","input_tokens":1350,"output_tokens":14,"think_tokens":87,"duration_ms":3486}',
    '{"timestamp":"2026-03-16T10:00:04Z","type":"thought","thought_text":"Analyzing the request..."}',
    '{"timestamp":"2026-03-16T10:00:05Z","type":"tool_call","tool_name":"echo","tool_args":"{\\"message\\":\\"hello\\"}"}',
    '{"timestamp":"2026-03-16T10:00:06Z","type":"tool_response","tool_name":"echo","tool_response":"{\\"reply\\":\\"echo: hello\\"}","screenshot_url":"http://example.com/shot.png"}',
    '{"timestamp":"2026-03-16T10:00:07Z","type":"llm_response","response_text":"Here is the result.","is_final":true}',
    '{"timestamp":"2026-03-16T10:00:08Z","type":"agent_end","agent":"golem_auditor"}',
    '{"timestamp":"2026-03-16T10:00:09Z","type":"run_complete"}',
  ].join("\n");

  it("injects user prompt at the start", () => {
    const merged = mergeCompanionEvents(baseTrace, ENRICHED_EVENTS);
    const first = merged.events.find((e) => e.id === "user-prompt");
    expect(first).toBeDefined();
    expect(first!.text).toBe("Hello world");
    expect(first!.type).toBe("text");
  });

  it("injects agent lifecycle events", () => {
    const merged = mergeCompanionEvents(baseTrace, ENRICHED_EVENTS);
    const starts = merged.events.filter((e) => e.id?.startsWith("agent-start"));
    const ends = merged.events.filter((e) => e.id?.startsWith("agent-end"));
    expect(starts.length).toBe(1);
    expect(ends.length).toBe(1);
    expect(starts[0]!.type).toBe("agent");
  });

  it("injects llm_request events with prompt text", () => {
    const merged = mergeCompanionEvents(baseTrace, ENRICHED_EVENTS);
    const llmReqs = merged.events.filter((e) => e.id?.startsWith("llm-request"));
    expect(llmReqs.length).toBe(1);
    expect(llmReqs[0]!.text).toContain("[user] Hello world");
    expect(llmReqs[0]!.model).toBe("gemini-3-flash-preview");
  });

  it("injects llm_response_meta events with token counts", () => {
    const merged = mergeCompanionEvents(baseTrace, ENRICHED_EVENTS);
    const metas = merged.events.filter((e) => e.id?.startsWith("llm-meta"));
    expect(metas.length).toBe(1);
    expect(metas[0]!.text).toContain("1,350");
    expect(metas[0]!.text).toContain("3486ms");
    expect(metas[0]!.duration_ms).toBe(3486);
  });

  it("injects final response at the end", () => {
    const merged = mergeCompanionEvents(baseTrace, ENRICHED_EVENTS);
    const final = merged.events.find((e) => e.id === "final-response");
    expect(final).toBeDefined();
    expect(final!.text).toBe("Here is the result.");
  });

  it("aggregates token counts from meta events", () => {
    const merged = mergeCompanionEvents(baseTrace, ENRICHED_EVENTS);
    expect(merged.tokens.input).toBe(1350);
    expect(merged.tokens.output).toBe(14);
    expect(merged.tokens.thoughts).toBe(87);
    expect(merged.tokens.total).toBe(1451);
  });

  it("updates model name from companion events", () => {
    const traceWithUnknown = { ...baseTrace, model: "unknown" };
    const merged = mergeCompanionEvents(traceWithUnknown, ENRICHED_EVENTS);
    expect(merged.model).toBe("gemini-3-flash-preview");
  });

  it("sorts events by timestamp", () => {
    const merged = mergeCompanionEvents(baseTrace, ENRICHED_EVENTS);
    for (let i = 1; i < merged.events.length; i++) {
      expect(merged.events[i]!.timestamp >= merged.events[i - 1]!.timestamp).toBe(true);
    }
  });

  it("handles empty companion events gracefully", () => {
    const merged = mergeCompanionEvents(baseTrace, "");
    expect(merged.events.length).toBe(baseTrace.events.length);
  });
});
