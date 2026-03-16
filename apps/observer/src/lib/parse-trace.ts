import type { TraceSummary } from "@/types/trace";
import { parseOtelTrace } from "./parse-otel";
import { parseThinkingTrace } from "./parse-thinking";

export { parseOtelTrace } from "./parse-otel";
export { parseThinkingTrace } from "./parse-thinking";
export { mergeCompanionEvents } from "./merge-events";

export function detectTraceFormat(raw: string): "otel" | "thinking" {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if ("parts" in parsed && "thinking_level" in parsed) return "thinking";
    } catch {
      // Not valid single JSON -- likely concatenated OTel spans
    }
  }
  return "otel";
}

export function parseTrace(raw: string): TraceSummary {
  const format = detectTraceFormat(raw);
  return format === "thinking" ? parseThinkingTrace(raw) : parseOtelTrace(raw);
}
