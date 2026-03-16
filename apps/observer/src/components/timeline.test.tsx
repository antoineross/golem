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

  it("renders all event titles", () => {
    render(<Timeline events={events} />);
    expect(screen.getByText("Agent: golem_auditor")).toBeInTheDocument();
    expect(screen.getByText("LLM: gemini-3-flash-preview")).toBeInTheDocument();
    expect(screen.getByText("Tool: echo")).toBeInTheDocument();
  });

  it("renders correct badge labels", () => {
    render(<Timeline events={events} />);
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("LLM")).toBeInTheDocument();
    expect(screen.getByText("Tool")).toBeInTheDocument();
  });

  it("shows token count for LLM events", () => {
    render(<Timeline events={events} />);
    expect(screen.getByText(/2,244\s*tok/)).toBeInTheDocument();
  });

  it("shows duration for events", () => {
    render(<Timeline events={events} />);
    expect(screen.getByText("7.0s")).toBeInTheDocument();
    expect(screen.getByText("3.0s")).toBeInTheDocument();
    expect(screen.getByText("50ms")).toBeInTheDocument();
  });

  it("renders thought events with correct badge", () => {
    const thoughtEvents: TimelineEvent[] = [
      { id: "t1", type: "thought", title: "Thinking", timestamp: "2026-03-16T10:00:00Z", text: "Analyzing..." },
    ];
    render(<Timeline events={thoughtEvents} />);
    expect(screen.getByText("Thought")).toBeInTheDocument();
  });
});
