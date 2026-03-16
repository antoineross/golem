import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SummaryHeader } from "./summary-header";
import type { TraceSummary } from "@/types/trace";

const otelTrace: TraceSummary = {
  trace_id: "abc123",
  source: "otel",
  model: "gemini-3-flash-preview",
  total_duration_ms: 7000,
  tokens: { input: 4770, output: 90, thoughts: 0, total: 4860 },
  tool_calls: 1,
  llm_calls: 2,
  events: [],
};

const thinkingTrace: TraceSummary = {
  trace_id: "medium",
  source: "thinking",
  model: "gemini-3-flash-preview",
  thinking_level: "MEDIUM",
  total_duration_ms: 14821,
  tokens: { input: 188, output: 1012, thoughts: 623, total: 1823 },
  tool_calls: 0,
  llm_calls: 1,
  events: [],
};

describe("SummaryHeader", () => {
  it("renders model name", () => {
    render(<SummaryHeader trace={otelTrace} />);
    expect(screen.getByText("gemini-3-flash-preview")).toBeInTheDocument();
  });

  it("renders duration in seconds", () => {
    render(<SummaryHeader trace={otelTrace} />);
    expect(screen.getByText("7.0s")).toBeInTheDocument();
  });

  it("renders tool call count", () => {
    render(<SummaryHeader trace={otelTrace} />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders LLM call count", () => {
    render(<SummaryHeader trace={otelTrace} />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders input and output token badges", () => {
    render(<SummaryHeader trace={otelTrace} />);
    expect(screen.getByText("in: 4,770")).toBeInTheDocument();
    expect(screen.getByText("out: 90")).toBeInTheDocument();
  });

  it("does not render thinking badge when thinking_level is absent", () => {
    render(<SummaryHeader trace={otelTrace} />);
    expect(screen.queryByText("Thinking")).not.toBeInTheDocument();
  });

  it("renders thinking level when present", () => {
    render(<SummaryHeader trace={thinkingTrace} />);
    expect(screen.getByText("MEDIUM")).toBeInTheDocument();
  });

  it("renders thought token badge when thoughts > 0", () => {
    render(<SummaryHeader trace={thinkingTrace} />);
    expect(screen.getByText("think: 623")).toBeInTheDocument();
  });

  it("renders duration in seconds for thinking trace", () => {
    render(<SummaryHeader trace={thinkingTrace} />);
    expect(screen.getByText("14.8s")).toBeInTheDocument();
  });

  it("renders duration in ms for sub-second traces", () => {
    const fast = { ...otelTrace, total_duration_ms: 500 };
    render(<SummaryHeader trace={fast} />);
    expect(screen.getByText("500ms")).toBeInTheDocument();
  });
});
