import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMockAgentStream } from "./use-agent-stream";
import type { AgentEvent } from "@/types/streaming";

function makeEvent(overrides: Partial<AgentEvent>): AgentEvent {
  return {
    timestamp: new Date().toISOString(),
    type: "user_prompt",
    ...overrides,
  };
}

// Level 0: enriched event sequence matching real _events.jsonl output
const LEVEL0_SCENARIO: AgentEvent[] = [
  makeEvent({ type: "user_prompt", response_text: "Echo hello and list payload categories" }),
  makeEvent({ type: "agent_start", agent: "golem_auditor" }),
  makeEvent({ type: "llm_request", model: "gemini-3-flash-preview", prompt_parts: 1, tools_available: 2, response_text: "[user] Echo hello..." }),
  makeEvent({ type: "llm_response_meta", model: "gemini-3-flash-preview", input_tokens: 1350, output_tokens: 14, think_tokens: 87, duration_ms: 3486 }),
  makeEvent({ type: "thought", thought_text: "Processing echo and payload request", model: "gemini-3-flash-preview" }),
  makeEvent({ type: "tool_call", tool_name: "echo", tool_args: '{"message":"hello"}' }),
  makeEvent({ type: "tool_response", tool_name: "echo", tool_response: '{"echo":"hello"}' }),
  makeEvent({ type: "llm_request", model: "gemini-3-flash-preview", prompt_parts: 3, tools_available: 2 }),
  makeEvent({ type: "llm_response_meta", model: "gemini-3-flash-preview", input_tokens: 1633, output_tokens: 147, think_tokens: 123, duration_ms: 4084 }),
  makeEvent({ type: "thought", thought_text: "Listing payload categories" }),
  makeEvent({ type: "llm_response", response_text: "Echo verified. Available categories: xss, sqli, idor, auth_bypass.", is_final: true }),
  makeEvent({ type: "agent_end", agent: "golem_auditor" }),
  makeEvent({ type: "run_complete" }),
];

// Level 2: full browse scenario with screenshots
const LEVEL2_SCENARIO: AgentEvent[] = [
  makeEvent({ type: "user_prompt", response_text: "Browse https://demo-target.local and find vulnerabilities" }),
  makeEvent({ type: "agent_start", agent: "golem_auditor" }),
  makeEvent({ type: "llm_request", model: "gemini-3-flash-preview", prompt_parts: 1, tools_available: 5 }),
  makeEvent({ type: "llm_response_meta", model: "gemini-3-flash-preview", input_tokens: 2000, output_tokens: 50, think_tokens: 100, duration_ms: 2500 }),
  makeEvent({ type: "thought", thought_text: "Starting reconnaissance of the target", model: "gemini-3-flash-preview" }),
  makeEvent({ type: "tool_call", tool_name: "browse", tool_args: '{"url":"https://demo-target.local"}' }),
  makeEvent({
    type: "tool_response",
    tool_name: "browse",
    tool_response: '{"markdown":"# Demo Store","links":["/products","/admin","/api/users"]}',
  }),
  makeEvent({ type: "thought", thought_text: "Found /admin and /api/users endpoints -- high-value targets" }),
  makeEvent({ type: "tool_call", tool_name: "screenshot", tool_args: '{"url":"https://demo-target.local"}' }),
  makeEvent({
    type: "tool_response",
    tool_name: "screenshot",
    tool_response: '{"url":"http://localhost:8082/screenshots/demo-target.png"}',
    screenshot_url: "http://localhost:8082/screenshots/demo-target.png",
  }),
  makeEvent({ type: "tool_call", tool_name: "find_hidden", tool_args: '{"url":"https://demo-target.local"}' }),
  makeEvent({
    type: "tool_response",
    tool_name: "find_hidden",
    tool_response: '{"hidden_inputs":[{"name":"debug","value":"true"}]}',
  }),
  makeEvent({ type: "llm_request", model: "gemini-3-flash-preview", prompt_parts: 5, tools_available: 5 }),
  makeEvent({ type: "llm_response_meta", model: "gemini-3-flash-preview", input_tokens: 5000, output_tokens: 200, think_tokens: 150, duration_ms: 4000 }),
  makeEvent({ type: "tool_call", tool_name: "browse", tool_args: '{"url":"https://demo-target.local/api/users"}' }),
  makeEvent({
    type: "tool_response",
    tool_name: "browse",
    tool_response: '{"markdown":"[{\"id\":1,\"email\":\"admin@demo.local\"}]"}',
  }),
  makeEvent({
    type: "thought",
    thought_text: "Critical: /api/users exposes all user data without authentication (IDOR)",
  }),
  makeEvent({ type: "tool_call", tool_name: "payload", tool_args: '{"category":"idor"}' }),
  makeEvent({
    type: "tool_response",
    tool_name: "payload",
    tool_response: '{"payloads":["GET /api/users/1","GET /api/users/2"]}',
  }),
  makeEvent({ type: "llm_request", model: "gemini-3-flash-preview", prompt_parts: 8, tools_available: 5 }),
  makeEvent({ type: "llm_response_meta", model: "gemini-3-flash-preview", input_tokens: 8000, output_tokens: 300, think_tokens: 200, duration_ms: 5000 }),
  makeEvent({
    type: "llm_response",
    response_text: "## Security Audit Report\n\n### Critical: IDOR\n### Medium: Hidden Debug Elements",
    is_final: true,
  }),
  makeEvent({ type: "agent_end", agent: "golem_auditor" }),
  makeEvent({ type: "run_complete" }),
];

describe("useMockAgentStream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Level 0: Enriched Echo + Payload scenario", () => {
    it("starts idle", () => {
      const { result } = renderHook(() =>
        useMockAgentStream(LEVEL0_SCENARIO, 100)
      );
      expect(result.current.state.status).toBe("idle");
      expect(result.current.isPlaying).toBe(false);
    });

    it("processes all events when played", () => {
      const { result } = renderHook(() =>
        useMockAgentStream(LEVEL0_SCENARIO, 100)
      );

      act(() => {
        result.current.play();
      });
      expect(result.current.state.status).toBe("streaming");

      for (let i = 0; i < LEVEL0_SCENARIO.length; i++) {
        act(() => {
          vi.advanceTimersByTime(100);
        });
      }

      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(result.current.state.status).toBe("complete");
      expect(result.current.state.userPrompt).toBe("Echo hello and list payload categories");
      expect(result.current.state.model).toBe("gemini-3-flash-preview");
      expect(result.current.state.agentName).toBe("golem_auditor");
      expect(result.current.state.agentActive).toBe(false);
      expect(result.current.state.llmCalls).toHaveLength(2);
      expect(result.current.state.llmCalls[0]!.state).toBe("completed");
      expect(result.current.state.llmCalls[0]!.inputTokens).toBe(1350);
      expect(result.current.state.llmCalls[1]!.state).toBe("completed");
      expect(result.current.state.toolCalls).toHaveLength(1);
      expect(result.current.state.toolCalls[0]!.name).toBe("echo");
      expect(result.current.state.toolCalls[0]!.state).toBe("output-available");
      expect(result.current.state.responses).toHaveLength(1);
      expect(result.current.state.responses[0]!.isFinal).toBe(true);
      expect(result.current.state.tokens.input).toBe(2983);
    });

    it("can be stopped mid-stream", () => {
      const { result } = renderHook(() =>
        useMockAgentStream(LEVEL0_SCENARIO, 100)
      );

      act(() => {
        result.current.play();
      });

      act(() => { vi.advanceTimersByTime(100); });
      act(() => { vi.advanceTimersByTime(100); });

      expect(result.current.state.totalEvents).toBe(2);

      act(() => {
        result.current.stop();
      });

      act(() => { vi.advanceTimersByTime(500); });
      expect(result.current.state.totalEvents).toBe(2);
    });
  });

  describe("Level 2: Full agent browse scenario", () => {
    it("processes full reconnaissance flow", () => {
      const { result } = renderHook(() =>
        useMockAgentStream(LEVEL2_SCENARIO, 50)
      );

      act(() => {
        result.current.play();
      });

      for (let i = 0; i < LEVEL2_SCENARIO.length + 1; i++) {
        act(() => {
          vi.advanceTimersByTime(50);
        });
      }

      const state = result.current.state;
      expect(state.status).toBe("complete");
      expect(state.totalEvents).toBe(LEVEL2_SCENARIO.length);

      expect(state.agentName).toBe("golem_auditor");
      expect(state.llmCalls).toHaveLength(3);
      expect(state.llmCalls.every((lc) => lc.state === "completed")).toBe(true);
      expect(state.tokens.input).toBe(15000);
      expect(state.tokens.output).toBe(550);

      expect(state.toolCalls).toHaveLength(5);
      const toolNames = state.toolCalls.map((tc) => tc.name);
      expect(toolNames).toEqual(["browse", "screenshot", "find_hidden", "browse", "payload"]);
      expect(state.toolCalls.every((tc) => tc.state === "output-available")).toBe(true);
      expect(state.toolCalls[1]!.screenshotUrl).toBe("http://localhost:8082/screenshots/demo-target.png");
      expect(state.toolCalls[1]!.screenshotPending).toBe(false);

      expect(state.responses).toHaveLength(1);
      expect(state.responses[0]!.isFinal).toBe(true);
      expect(state.responses[0]!.text).toContain("IDOR");
    });

    it("shows intermediate state with pending LLM call during tool execution", () => {
      const { result } = renderHook(() =>
        useMockAgentStream(LEVEL2_SCENARIO, 100)
      );

      act(() => {
        result.current.play();
      });

      // Process 5 events: user_prompt, agent_start, llm_request, llm_response_meta, thought
      for (let i = 0; i < 5; i++) {
        act(() => { vi.advanceTimersByTime(100); });
      }

      const state = result.current.state;
      expect(state.status).toBe("streaming");
      expect(state.agentActive).toBe(true);
      expect(state.llmCalls).toHaveLength(1);
      expect(state.llmCalls[0]!.state).toBe("completed");
      expect(state.thoughts).toHaveLength(1);
    });

    it("shows screenshot pending then resolved", () => {
      const { result } = renderHook(() =>
        useMockAgentStream(LEVEL2_SCENARIO, 100)
      );

      act(() => {
        result.current.play();
      });

      // Process 9 events: up to screenshot tool_call
      for (let i = 0; i < 9; i++) {
        act(() => { vi.advanceTimersByTime(100); });
      }

      expect(result.current.state.toolCalls[1]!.name).toBe("screenshot");
      expect(result.current.state.toolCalls[1]!.screenshotPending).toBe(true);
      expect(result.current.state.toolCalls[1]!.screenshotUrl).toBeUndefined();

      // Process 1 more: screenshot tool_response
      act(() => { vi.advanceTimersByTime(100); });

      expect(result.current.state.toolCalls[1]!.screenshotPending).toBe(false);
      expect(result.current.state.toolCalls[1]!.screenshotUrl).toBe("http://localhost:8082/screenshots/demo-target.png");
    });

    it("resets cleanly when play is called again", () => {
      const { result } = renderHook(() =>
        useMockAgentStream(LEVEL2_SCENARIO, 50)
      );

      act(() => {
        result.current.play();
      });
      for (let i = 0; i < 5; i++) {
        act(() => { vi.advanceTimersByTime(50); });
      }
      expect(result.current.state.totalEvents).toBe(5);

      act(() => {
        result.current.play();
      });
      expect(result.current.state.totalEvents).toBe(0);
      expect(result.current.state.status).toBe("streaming");
      expect(result.current.state.llmCalls).toEqual([]);
      expect(result.current.state.tokens).toEqual({ input: 0, output: 0, think: 0 });
    });
  });
});
