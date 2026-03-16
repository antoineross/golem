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
});

describe("createInitialStreamState", () => {
  it("returns a clean initial state", () => {
    const state = createInitialStreamState();
    expect(state.status).toBe("idle");
    expect(state.events).toEqual([]);
    expect(state.userPrompt).toBeNull();
    expect(state.thoughts).toEqual([]);
    expect(state.toolCalls).toEqual([]);
    expect(state.responses).toEqual([]);
    expect(state.error).toBeNull();
    expect(state.model).toBeNull();
    expect(state.totalEvents).toBe(0);
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

  it("processes a full agent run sequence", () => {
    const events: AgentEvent[] = [
      event({ type: "user_prompt", response_text: "Audit https://example.com" }),
      event({ type: "thought", thought_text: "Starting security audit", model: "gemini-3-flash" }),
      event({ type: "tool_call", tool_name: "browse", tool_args: '{"url":"https://example.com"}' }),
      event({ type: "tool_response", tool_name: "browse", tool_response: '{"markdown":"# Example"}' }),
      event({ type: "tool_call", tool_name: "screenshot", tool_args: '{"url":"https://example.com"}' }),
      event({ type: "tool_response", tool_name: "screenshot", screenshot_url: "/shot.png", tool_response: '{"url":"/shot.png"}' }),
      event({ type: "thought", thought_text: "No obvious vulnerabilities found" }),
      event({ type: "llm_response", response_text: "Security audit complete. No critical issues.", is_final: true }),
      event({ type: "run_complete" }),
    ];

    let s = initial();
    for (const e of events) {
      s = reduceStreamEvent(s, e);
    }

    expect(s.status).toBe("complete");
    expect(s.userPrompt).toBe("Audit https://example.com");
    expect(s.model).toBe("gemini-3-flash");
    expect(s.thoughts).toHaveLength(2);
    expect(s.thoughts[0]!.isStreaming).toBe(false);
    expect(s.thoughts[1]!.isStreaming).toBe(false);
    expect(s.toolCalls).toHaveLength(2);
    expect(s.toolCalls[0]!.state).toBe("output-available");
    expect(s.toolCalls[1]!.state).toBe("output-available");
    expect(s.toolCalls[1]!.screenshotUrl).toBe("/shot.png");
    expect(s.responses).toHaveLength(1);
    expect(s.responses[0]!.isFinal).toBe(true);
    expect(s.totalEvents).toBe(9);
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
