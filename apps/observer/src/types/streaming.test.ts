import { describe, it, expect } from "vitest";
import {
  parseAgentEvent,
  createInitialStreamState,
  reduceStreamEvent,
} from "./streaming";
import type { AgentEvent, StreamState } from "./streaming";

describe("parseAgentEvent", () => {
  it("parses valid JSONL event", () => {
    const raw = JSON.stringify({
      timestamp: "2026-03-16T12:00:00Z",
      type: "user_prompt",
      response_text: "Hello",
    });
    const event = parseAgentEvent(raw);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("user_prompt");
    expect(event!.response_text).toBe("Hello");
  });

  it("returns null for malformed JSON", () => {
    expect(parseAgentEvent("{broken")).toBeNull();
    expect(parseAgentEvent("")).toBeNull();
  });

  it("parses tool_call event with all fields", () => {
    const raw = JSON.stringify({
      timestamp: "2026-03-16T12:00:01Z",
      type: "tool_call",
      tool_name: "browse",
      tool_args: '{"url":"https://example.com"}',
      agent: "security_auditor",
      model: "gemini-3-flash",
    });
    const event = parseAgentEvent(raw);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("tool_call");
    expect(event!.tool_name).toBe("browse");
    expect(event!.agent).toBe("security_auditor");
    expect(event!.model).toBe("gemini-3-flash");
  });

  it("parses llm_request event", () => {
    const raw = JSON.stringify({
      timestamp: "2026-03-16T12:00:01Z",
      type: "llm_request",
      model: "gemini-3-flash-preview",
      prompt_parts: 3,
      tools_available: 5,
      response_text: "[user] Test prompt",
    });
    const event = parseAgentEvent(raw);
    expect(event!.type).toBe("llm_request");
    expect(event!.prompt_parts).toBe(3);
    expect(event!.tools_available).toBe(5);
  });

  it("parses llm_response_meta event", () => {
    const raw = JSON.stringify({
      timestamp: "2026-03-16T12:00:02Z",
      type: "llm_response_meta",
      model: "gemini-3-flash-preview",
      input_tokens: 1350,
      output_tokens: 14,
      think_tokens: 87,
      duration_ms: 3486,
    });
    const event = parseAgentEvent(raw);
    expect(event!.type).toBe("llm_response_meta");
    expect(event!.input_tokens).toBe(1350);
    expect(event!.duration_ms).toBe(3486);
  });
});

describe("createInitialStreamState", () => {
  it("returns a clean initial state", () => {
    const state = createInitialStreamState();
    expect(state.status).toBe("idle");
    expect(state.events).toEqual([]);
    expect(state.userPrompt).toBeNull();
    expect(state.agentName).toBeNull();
    expect(state.agentActive).toBe(false);
    expect(state.thoughts).toEqual([]);
    expect(state.toolCalls).toEqual([]);
    expect(state.llmCalls).toEqual([]);
    expect(state.responses).toEqual([]);
    expect(state.error).toBeNull();
    expect(state.model).toBeNull();
    expect(state.totalEvents).toBe(0);
    expect(state.tokens).toEqual({ input: 0, output: 0, think: 0 });
  });
});

describe("reduceStreamEvent", () => {
  function initial(): StreamState {
    return createInitialStreamState();
  }

  function event(overrides: Partial<AgentEvent>): AgentEvent {
    return {
      timestamp: "2026-03-16T12:00:00Z",
      type: "user_prompt",
      ...overrides,
    };
  }

  it("handles user_prompt", () => {
    const state = reduceStreamEvent(
      initial(),
      event({ type: "user_prompt", response_text: "Test the login page" })
    );
    expect(state.userPrompt).toBe("Test the login page");
    expect(state.totalEvents).toBe(1);
  });

  it("captures model from first event that has it", () => {
    const s1 = reduceStreamEvent(
      initial(),
      event({ type: "thought", model: "gemini-3-flash", thought_text: "analyzing..." })
    );
    expect(s1.model).toBe("gemini-3-flash");

    const s2 = reduceStreamEvent(
      s1,
      event({ type: "thought", model: "gemini-4", thought_text: "more" })
    );
    expect(s2.model).toBe("gemini-3-flash");
  });

  it("handles thought events", () => {
    const s = reduceStreamEvent(
      initial(),
      event({ type: "thought", thought_text: "Analyzing the page structure" })
    );
    expect(s.thoughts).toHaveLength(1);
    expect(s.thoughts[0]!.text).toBe("Analyzing the page structure");
    expect(s.thoughts[0]!.isStreaming).toBe(true);
  });

  it("handles tool_call -> creates tool with input-available state", () => {
    const s = reduceStreamEvent(
      initial(),
      event({
        type: "tool_call",
        tool_name: "browse",
        tool_args: '{"url":"https://example.com"}',
      })
    );
    expect(s.toolCalls).toHaveLength(1);
    expect(s.toolCalls[0]!.name).toBe("browse");
    expect(s.toolCalls[0]!.state).toBe("input-available");
    expect(s.toolCalls[0]!.args).toBe('{"url":"https://example.com"}');
  });

  it("handles tool_response -> updates matching tool to output-available", () => {
    let s = reduceStreamEvent(
      initial(),
      event({
        type: "tool_call",
        tool_name: "browse",
        tool_args: '{"url":"https://example.com"}',
      })
    );
    s = reduceStreamEvent(
      s,
      event({
        type: "tool_response",
        tool_name: "browse",
        tool_response: '{"title":"Example"}',
      })
    );
    expect(s.toolCalls).toHaveLength(1);
    expect(s.toolCalls[0]!.state).toBe("output-available");
    expect(s.toolCalls[0]!.response).toBe('{"title":"Example"}');
  });

  it("handles tool_response with screenshot", () => {
    let s = reduceStreamEvent(
      initial(),
      event({
        type: "tool_call",
        tool_name: "screenshot",
        tool_args: '{"url":"https://example.com"}',
      })
    );
    expect(s.toolCalls[0]!.screenshotPending).toBe(true);

    s = reduceStreamEvent(
      s,
      event({
        type: "tool_response",
        tool_name: "screenshot",
        tool_response: '{"url":"http://localhost/shot.png"}',
        screenshot_url: "http://localhost/shot.png",
      })
    );
    expect(s.toolCalls[0]!.screenshotUrl).toBe("http://localhost/shot.png");
    expect(s.toolCalls[0]!.screenshotPending).toBe(false);
  });

  it("handles llm_response", () => {
    const s = reduceStreamEvent(
      initial(),
      event({
        type: "llm_response",
        response_text: "I found a vulnerability",
        is_final: false,
      })
    );
    expect(s.responses).toHaveLength(1);
    expect(s.responses[0]!.text).toBe("I found a vulnerability");
    expect(s.responses[0]!.isFinal).toBe(false);
  });

  it("handles final llm_response", () => {
    const s = reduceStreamEvent(
      initial(),
      event({
        type: "llm_response",
        response_text: "Final report",
        is_final: true,
      })
    );
    expect(s.responses).toHaveLength(1);
    expect(s.responses[0]!.isFinal).toBe(true);
  });

  it("handles error event", () => {
    const s = reduceStreamEvent(
      initial(),
      event({ type: "error", response_text: "API timeout" })
    );
    expect(s.status).toBe("error");
    expect(s.error).toBe("API timeout");
  });

  it("handles run_complete", () => {
    const s = reduceStreamEvent(
      initial(),
      event({ type: "run_complete" })
    );
    expect(s.status).toBe("complete");
  });

  it("marks thoughts as done when tool_call arrives", () => {
    let s = reduceStreamEvent(
      initial(),
      event({ type: "thought", thought_text: "thinking..." })
    );
    expect(s.thoughts[0]!.isStreaming).toBe(true);

    s = reduceStreamEvent(
      s,
      event({ type: "tool_call", tool_name: "echo", tool_args: "{}" })
    );
    expect(s.thoughts[0]!.isStreaming).toBe(false);
  });

  // New event types from PR #47

  it("handles agent_start", () => {
    const s = reduceStreamEvent(
      initial(),
      event({ type: "agent_start", agent: "golem_auditor" })
    );
    expect(s.agentName).toBe("golem_auditor");
    expect(s.agentActive).toBe(true);
  });

  it("handles agent_end", () => {
    let s = reduceStreamEvent(
      initial(),
      event({ type: "agent_start", agent: "golem_auditor" })
    );
    s = reduceStreamEvent(s, event({ type: "agent_end" }));
    expect(s.agentActive).toBe(false);
    expect(s.agentName).toBe("golem_auditor");
  });

  it("handles llm_request -> creates pending LLM call", () => {
    const s = reduceStreamEvent(
      initial(),
      event({
        type: "llm_request",
        model: "gemini-3-flash-preview",
        prompt_parts: 1,
        tools_available: 2,
        response_text: "[user] Hello",
      })
    );
    expect(s.llmCalls).toHaveLength(1);
    expect(s.llmCalls[0]!.state).toBe("pending");
    expect(s.llmCalls[0]!.model).toBe("gemini-3-flash-preview");
    expect(s.llmCalls[0]!.promptParts).toBe(1);
    expect(s.llmCalls[0]!.toolsAvailable).toBe(2);
    expect(s.llmCalls[0]!.promptText).toBe("[user] Hello");
  });

  it("handles llm_response_meta -> completes pending LLM call", () => {
    let s = reduceStreamEvent(
      initial(),
      event({
        type: "llm_request",
        model: "gemini-3-flash-preview",
      })
    );
    s = reduceStreamEvent(
      s,
      event({
        type: "llm_response_meta",
        model: "gemini-3-flash-preview",
        input_tokens: 1350,
        output_tokens: 14,
        think_tokens: 87,
        duration_ms: 3486,
      })
    );
    expect(s.llmCalls).toHaveLength(1);
    expect(s.llmCalls[0]!.state).toBe("completed");
    expect(s.llmCalls[0]!.inputTokens).toBe(1350);
    expect(s.llmCalls[0]!.outputTokens).toBe(14);
    expect(s.llmCalls[0]!.thinkTokens).toBe(87);
    expect(s.llmCalls[0]!.durationMs).toBe(3486);
  });

  it("accumulates tokens across multiple llm_response_meta events", () => {
    let s = initial();
    s = reduceStreamEvent(s, event({ type: "llm_request", model: "m" }));
    s = reduceStreamEvent(s, event({
      type: "llm_response_meta",
      input_tokens: 1000,
      output_tokens: 100,
      think_tokens: 50,
    }));
    s = reduceStreamEvent(s, event({ type: "llm_request", model: "m" }));
    s = reduceStreamEvent(s, event({
      type: "llm_response_meta",
      input_tokens: 2000,
      output_tokens: 200,
      think_tokens: 100,
    }));
    expect(s.tokens).toEqual({ input: 3000, output: 300, think: 150 });
  });

  it("screenshot tool shows screenshotPending", () => {
    const s = reduceStreamEvent(
      initial(),
      event({ type: "tool_call", tool_name: "screenshot", tool_args: '{"url":"x"}' })
    );
    expect(s.toolCalls[0]!.screenshotPending).toBe(true);
  });

  it("non-screenshot tool does not show screenshotPending", () => {
    const s = reduceStreamEvent(
      initial(),
      event({ type: "tool_call", tool_name: "browse", tool_args: '{"url":"x"}' })
    );
    expect(s.toolCalls[0]!.screenshotPending).toBe(false);
  });

  it("run_complete marks pending LLM calls as completed", () => {
    let s = reduceStreamEvent(
      initial(),
      event({ type: "llm_request", model: "m" })
    );
    expect(s.llmCalls[0]!.state).toBe("pending");

    s = reduceStreamEvent(s, event({ type: "run_complete" }));
    expect(s.llmCalls[0]!.state).toBe("completed");
  });

  it("processes a full enriched agent run sequence", () => {
    const events: AgentEvent[] = [
      event({ type: "user_prompt", response_text: "Audit https://example.com" }),
      event({ type: "agent_start", agent: "golem_auditor" }),
      event({ type: "llm_request", model: "gemini-3-flash-preview", prompt_parts: 1, tools_available: 2 }),
      event({ type: "llm_response_meta", model: "gemini-3-flash-preview", input_tokens: 1350, output_tokens: 14, think_tokens: 87, duration_ms: 3486 }),
      event({ type: "thought", thought_text: "Starting security audit", model: "gemini-3-flash-preview" }),
      event({ type: "tool_call", tool_name: "browse", tool_args: '{"url":"https://example.com"}' }),
      event({ type: "tool_response", tool_name: "browse", tool_response: '{"markdown":"# Example"}' }),
      event({ type: "tool_call", tool_name: "screenshot", tool_args: '{"url":"https://example.com"}' }),
      event({ type: "tool_response", tool_name: "screenshot", screenshot_url: "/shot.png", tool_response: '{"url":"/shot.png"}' }),
      event({ type: "llm_request", model: "gemini-3-flash-preview", prompt_parts: 3, tools_available: 2 }),
      event({ type: "llm_response_meta", model: "gemini-3-flash-preview", input_tokens: 1633, output_tokens: 147, think_tokens: 123, duration_ms: 4084 }),
      event({ type: "thought", thought_text: "No obvious vulnerabilities found" }),
      event({ type: "llm_response", response_text: "Security audit complete. No critical issues.", is_final: true }),
      event({ type: "agent_end", agent: "golem_auditor" }),
      event({ type: "run_complete" }),
    ];

    let s = initial();
    for (const e of events) {
      s = reduceStreamEvent(s, e);
    }

    expect(s.status).toBe("complete");
    expect(s.userPrompt).toBe("Audit https://example.com");
    expect(s.agentName).toBe("golem_auditor");
    expect(s.agentActive).toBe(false);
    expect(s.model).toBe("gemini-3-flash-preview");
    expect(s.thoughts).toHaveLength(2);
    expect(s.thoughts.every((t) => !t.isStreaming)).toBe(true);
    expect(s.toolCalls).toHaveLength(2);
    expect(s.toolCalls[0]!.state).toBe("output-available");
    expect(s.toolCalls[1]!.state).toBe("output-available");
    expect(s.toolCalls[1]!.screenshotUrl).toBe("/shot.png");
    expect(s.toolCalls[0]!.parentLlmCallId).toBe("llm-0");
    expect(s.toolCalls[1]!.parentLlmCallId).toBe("llm-0");
    expect(s.llmCalls).toHaveLength(2);
    expect(s.llmCalls[0]!.state).toBe("completed");
    expect(s.llmCalls[1]!.state).toBe("completed");
    expect(s.llmCalls[0]!.inputTokens).toBe(1350);
    expect(s.llmCalls[1]!.inputTokens).toBe(1633);
    expect(s.responses).toHaveLength(1);
    expect(s.responses[0]!.isFinal).toBe(true);
    expect(s.totalEvents).toBe(15);
    expect(s.tokens).toEqual({ input: 2983, output: 161, think: 210 });
  });

  it("handles multiple tool calls matching by name and state", () => {
    let s = initial();
    s = reduceStreamEvent(s, event({ type: "tool_call", tool_name: "browse", tool_args: '{"url":"a"}' }));
    s = reduceStreamEvent(s, event({ type: "tool_response", tool_name: "browse", tool_response: "resp-a" }));
    s = reduceStreamEvent(s, event({ type: "tool_call", tool_name: "browse", tool_args: '{"url":"b"}' }));
    s = reduceStreamEvent(s, event({ type: "tool_response", tool_name: "browse", tool_response: "resp-b" }));

    expect(s.toolCalls).toHaveLength(2);
    expect(s.toolCalls[0]!.response).toBe("resp-a");
    expect(s.toolCalls[1]!.response).toBe("resp-b");
    expect(s.toolCalls[0]!.state).toBe("output-available");
    expect(s.toolCalls[1]!.state).toBe("output-available");
  });
});
