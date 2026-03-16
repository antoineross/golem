import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TracePicker } from "./trace-picker";
import type { TraceFile } from "@/types/trace";

const files: TraceFile[] = [
  { name: "agent_otel_spans.json", path: "/tmp/tests/agent/agent_otel_spans.json", modified: "2026-03-16T10:00:00Z", source: "otel" },
  { name: "medium_trace.json", path: "/tmp/tests/thinking/medium_trace.json", modified: "2026-03-15T10:00:00Z", source: "thinking" },
];

describe("TracePicker", () => {
  it("renders all file buttons", () => {
    render(<TracePicker files={files} selected={null} onSelect={() => {}} />);
    expect(screen.getByText("agent_otel_spans.json")).toBeInTheDocument();
    expect(screen.getByText("medium_trace.json")).toBeInTheDocument();
  });

  it("calls onSelect with correct path when clicked", () => {
    const onSelect = vi.fn();
    render(<TracePicker files={files} selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("agent_otel_spans.json"));
    expect(onSelect).toHaveBeenCalledWith("/tmp/tests/agent/agent_otel_spans.json");
  });

  it("shows empty message when no files", () => {
    render(<TracePicker files={[]} selected={null} onSelect={() => {}} />);
    expect(screen.getByText("No trace files found")).toBeInTheDocument();
  });

  it("highlights selected file", () => {
    const { container } = render(
      <TracePicker files={files} selected={files[0].path} onSelect={() => {}} />
    );
    const buttons = container.querySelectorAll("button");
    expect(buttons[0].className).toContain("bg-zinc-700");
    expect(buttons[1].className).not.toContain("bg-zinc-700");
  });
});
