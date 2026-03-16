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

const LEVEL0_SCENARIO: AgentEvent[] = [
  makeEvent({ type: "user_prompt", response_text: "Echo hello and list payload categories" }),
  makeEvent({ type: "thought", thought_text: "Processing echo and payload request", model: "gemini-3-flash" }),
  makeEvent({ type: "tool_call", tool_name: "echo", tool_args: '{"message":"hello"}' }),
  makeEvent({ type: "tool_response", tool_name: "echo", tool_response: '{"echo":"hello"}' }),
  makeEvent({ type: "tool_call", tool_name: "payload", tool_args: '{"category":"list"}' }),
  makeEvent({ type: "tool_response", tool_name: "payload", tool_response: '{"categories":["xss","sqli","idor","auth_bypass"]}' }),
  makeEvent({ type: "llm_response", response_text: "Echo verified. Available categories: xss, sqli, idor, auth_bypass.", is_final: true }),
  makeEvent({ type: "run_complete" }),
];

const LEVEL2_SCENARIO: AgentEvent[] = [
  makeEvent({ type: "user_prompt", response_text: "Browse https://demo-target.local and find vulnerabilities" }),
  makeEvent({ type: "thought", thought_text: "Starting reconnaissance of the target", model: "gemini-3-flash" }),
  makeEvent({ type: "tool_call", tool_name: "browse", tool_args: '{"url":"https://demo-target.local"}' }),
  makeEvent({
    type: "tool_response",
    tool_name: "browse",
    tool_response: '{"markdown":"# Demo Store\\nWelcome to our e-commerce platform","links":["/products","/admin","/api/users"]}',
  }),
  makeEvent({ type: "thought", thought_text: "Found /admin and /api/users endpoints -- these are high-value targets" }),
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
    tool_response: '{"hidden_inputs":[{"name":"debug","value":"true"}],"data_attributes":["data-admin-panel"],"comments":["TODO: remove admin backdoor"]}',
  }),
  makeEvent({ type: "tool_call", tool_name: "browse", tool_args: '{"url":"https://demo-target.local/api/users"}' }),
  makeEvent({
    type: "tool_response",
    tool_name: "browse",
    tool_response: '{"markdown":"## API Response\\n```json\\n[{\\"id\\":1,\\"email\\":\\"admin@demo.local\\",\\"role\\":\\"admin\\"},{\\"id\\":2,\\"email\\":\\"user@demo.local\\",\\"role\\":\\"user\\"}]\\n```"}',
  }),
  makeEvent({
    type: "thought",
    thought_text: "Critical finding: /api/users endpoint exposes all user data including admin emails without authentication. This is an IDOR vulnerability.",
  }),
  makeEvent({ type: "tool_call", tool_name: "payload", tool_args: '{"category":"idor"}' }),
  makeEvent({
    type: "tool_response",
    tool_name: "payload",
    tool_response: '{"payloads":["GET /api/users/1","GET /api/users/2","PUT /api/users/1"]}',
  }),
  makeEvent({
    type: "llm_response",
    response_text: "## Security Audit Report\n\n### Critical: Unauthenticated API Access (IDOR)\n- Endpoint: /api/users\n- All user records exposed without authentication\n- Admin credentials visible\n\n### Medium: Hidden Debug Elements\n- Hidden input: debug=true\n- Data attribute: data-admin-panel\n- HTML comment: admin backdoor reference",
    is_final: true,
  }),
  makeEvent({ type: "run_complete" }),
];

describe("useMockAgentStream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Level 0: Echo + Payload scenario", () => {
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

      // After all events + one more tick to detect completion
      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(result.current.state.status).toBe("complete");
      expect(result.current.state.userPrompt).toBe("Echo hello and list payload categories");
      expect(result.current.state.model).toBe("gemini-3-flash");
      expect(result.current.state.toolCalls).toHaveLength(2);
      expect(result.current.state.toolCalls[0]!.name).toBe("echo");
      expect(result.current.state.toolCalls[0]!.state).toBe("output-available");
      expect(result.current.state.toolCalls[1]!.name).toBe("payload");
      expect(result.current.state.toolCalls[1]!.state).toBe("output-available");
      expect(result.current.state.responses).toHaveLength(1);
      expect(result.current.state.responses[0]!.isFinal).toBe(true);
    });

    it("can be stopped mid-stream", () => {
      const { result } = renderHook(() =>
        useMockAgentStream(LEVEL0_SCENARIO, 100)
      );

      act(() => {
        result.current.play();
      });

      act(() => {
        vi.advanceTimersByTime(100);
      });

      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(result.current.state.totalEvents).toBe(2);

      act(() => {
        result.current.stop();
      });

      act(() => {
        vi.advanceTimersByTime(500);
      });

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
      expect(state.userPrompt).toBe("Browse https://demo-target.local and find vulnerabilities");

      expect(state.thoughts).toHaveLength(3);
      expect(state.thoughts.every((t) => !t.isStreaming)).toBe(true);

      expect(state.toolCalls).toHaveLength(5);
      const toolNames = state.toolCalls.map((tc) => tc.name);
      expect(toolNames).toEqual(["browse", "screenshot", "find_hidden", "browse", "payload"]);

      expect(state.toolCalls.every((tc) => tc.state === "output-available")).toBe(true);
      expect(state.toolCalls[1]!.screenshotUrl).toBe("http://localhost:8082/screenshots/demo-target.png");

      expect(state.responses).toHaveLength(1);
      expect(state.responses[0]!.isFinal).toBe(true);
      expect(state.responses[0]!.text).toContain("IDOR");
      expect(state.responses[0]!.text).toContain("Hidden Debug Elements");
    });

    it("shows intermediate state during tool execution", () => {
      const { result } = renderHook(() =>
        useMockAgentStream(LEVEL2_SCENARIO, 100)
      );

      act(() => {
        result.current.play();
      });

      // Process 3 events: user_prompt, thought, tool_call
      for (let i = 0; i < 3; i++) {
        act(() => {
          vi.advanceTimersByTime(100);
        });
      }

      const state = result.current.state;
      expect(state.status).toBe("streaming");
      expect(state.userPrompt).toBe("Browse https://demo-target.local and find vulnerabilities");
      expect(state.thoughts).toHaveLength(1);
      expect(state.toolCalls).toHaveLength(1);
      expect(state.toolCalls[0]!.name).toBe("browse");
      expect(state.toolCalls[0]!.state).toBe("input-available");
    });

    it("updates tool state from input-available to output-available", () => {
      const { result } = renderHook(() =>
        useMockAgentStream(LEVEL2_SCENARIO, 100)
      );

      act(() => {
        result.current.play();
      });

      // Process 4 events: up to first tool_response
      for (let i = 0; i < 4; i++) {
        act(() => {
          vi.advanceTimersByTime(100);
        });
      }

      const state = result.current.state;
      expect(state.toolCalls).toHaveLength(1);
      expect(state.toolCalls[0]!.state).toBe("output-available");
      expect(state.toolCalls[0]!.response).toContain("Demo Store");
    });

    it("resets cleanly when play is called again", () => {
      const { result } = renderHook(() =>
        useMockAgentStream(LEVEL2_SCENARIO, 50)
      );

      // First run -- partial
      act(() => {
        result.current.play();
      });
      for (let i = 0; i < 5; i++) {
        act(() => {
          vi.advanceTimersByTime(50);
        });
      }
      expect(result.current.state.totalEvents).toBe(5);

      // Replay
      act(() => {
        result.current.play();
      });
      expect(result.current.state.totalEvents).toBe(0);
      expect(result.current.state.status).toBe("streaming");
    });
  });
});
