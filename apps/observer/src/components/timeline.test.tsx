import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Timeline } from "./timeline";
import type { TimelineEvent } from "@/types/trace";

const events: TimelineEvent[] = [
  {
    id: "span0",
    type: "agent",
    title: "Agent: golem_auditor",
    timestamp: "2026-03-16T10:00:00Z",
    duration_ms: 7000,
  },
  {
    id: "span1",
    type: "llm_call",
    title: "LLM: gemini-3-flash-preview",
    model: "gemini-3-flash-preview",
    timestamp: "2026-03-16T10:00:00Z",
    duration_ms: 3000,
    tokens: { input: 2230, output: 14 },
  },
  {
    id: "span2",
    type: "tool_call",
    title: "Tool: echo",
    timestamp: "2026-03-16T10:00:03Z",
    duration_ms: 50,
    tool_name: "echo",
    tool_args: '{"message":"hello"}',
    tool_response: '{"reply":"echo: hello"}',
  },
];

describe("Timeline", () => {
  it("renders empty state message", () => {
    render(<Timeline events={[]} />);
    expect(screen.getByText("No events found in this trace.")).toBeInTheDocument();
  });

  it("renders LLM Call headers and tool names", () => {
    render(<Timeline events={events} />);
    expect(screen.getByText("LLM Call")).toBeInTheDocument();
    expect(screen.getByText("gemini-3-flash-preview")).toBeInTheDocument();
    expect(screen.getAllByText("echo").length).toBeGreaterThanOrEqual(1);
  });

  it("renders Completed badges", () => {
    render(<Timeline events={events} />);
    const completedBadges = screen.getAllByText("Completed");
    expect(completedBadges.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("LLM Call")).toBeInTheDocument();
  });

  it("shows token count for LLM events", () => {
    render(<Timeline events={events} />);
    expect(screen.getByText(/2,244\s*tok/)).toBeInTheDocument();
  });

  it("shows duration for LLM call events", () => {
    render(<Timeline events={events} />);
    expect(screen.getByText("3.0s")).toBeInTheDocument();
  });

  it("renders thought events with Reasoning component", () => {
    const llmWithThought: TimelineEvent[] = [
      {
        id: "span1",
        type: "llm_call",
        title: "LLM Call",
        model: "gemini-3-flash-preview",
        timestamp: "2026-03-16T10:00:00Z",
        duration_ms: 3000,
        tokens: { input: 100, output: 50 },
      },
      {
        id: "t1",
        type: "thought",
        title: "Thinking",
        timestamp: "2026-03-16T10:00:01Z",
        text: "Analyzing...",
      },
    ];
    render(<Timeline events={llmWithThought} />);
    expect(screen.getByText("Thought for a few seconds")).toBeInTheDocument();
  });
});
