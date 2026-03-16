import type { TraceSummary } from "@/types/trace";

interface CompanionEvent {
  timestamp: string;
  type: string;
  agent?: string;
  model?: string;
  response_text?: string;
  thought_text?: string;
  is_final?: boolean;
  tool_name?: string;
  tool_args?: string;
  tool_response?: string;
  screenshot_url?: string;
  prompt_parts?: number;
  tools_available?: number;
  input_tokens?: number;
  output_tokens?: number;
  think_tokens?: number;
  duration_ms?: number;
  finish_reasons?: string;
}

function parseCompanionEvents(raw: string): CompanionEvent[] {
  const events: CompanionEvent[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }
  return events;
}

export function mergeCompanionEvents(
  trace: TraceSummary,
  eventsRaw: string
): TraceSummary {
  const companions = parseCompanionEvents(eventsRaw);
  if (companions.length === 0) return trace;

  const merged = { ...trace, events: [...trace.events] };
  let companionIdx = 0;

  for (let i = 0; i < merged.events.length; i++) {
    const ev = merged.events[i]!;

    if (ev.type === "llm_call") {
      while (companionIdx < companions.length) {
        const ce = companions[companionIdx]!;
        if (ce.type === "llm_response" || ce.type === "thought") {
          companionIdx++;
          if (ce.type === "llm_response" && ce.response_text) {
            const label = ce.is_final ? "[Final Response]" : "[Intermediate]";
            const existing = ev.text ?? "";
            ev.text =
              existing +
              `\n\n${label}\n${ce.response_text}`;
          }
          if (ce.type === "thought" && ce.thought_text) {
            const existing = ev.text ?? "";
            ev.text =
              existing + `\n\n[Thought]\n${ce.thought_text}`;
          }
          break;
        }
        companionIdx++;
      }
    }

    if (ev.type === "tool_call" && !ev.screenshot_url) {
      for (const ce of companions) {
        if (
          ce.type === "tool_response" &&
          ce.tool_name === ev.tool_name &&
          ce.screenshot_url
        ) {
          ev.screenshot_url = ce.screenshot_url;
          break;
        }
      }
    }
  }

  const userPrompt = companions.find((c) => c.type === "user_prompt");
  if (userPrompt?.response_text) {
    merged.events.unshift({
      id: "user-prompt",
      type: "text",
      title: "User Prompt",
      timestamp:
        userPrompt.timestamp ?? merged.events[0]?.timestamp ?? new Date().toISOString(),
      text: userPrompt.response_text,
    });
  }

  for (let ci = 0; ci < companions.length; ci++) {
    const ce = companions[ci]!;
    if (ce.type === "llm_request" && ce.response_text) {
      const meta: string[] = [];
      if (ce.model) meta.push(`Model: ${ce.model}`);
      if (ce.prompt_parts) meta.push(`Parts: ${ce.prompt_parts}`);
      if (ce.tools_available) meta.push(`Tools: ${ce.tools_available}`);
      const header = meta.length > 0 ? meta.join(" | ") + "\n\n" : "";
      merged.events.push({
        id: `llm-request-${ci}`,
        type: "llm_call",
        title: `LLM Request${ce.model ? `: ${ce.model}` : ""}`,
        timestamp: ce.timestamp,
        text: header + ce.response_text,
        model: ce.model,
      });
    }
    if (ce.type === "llm_response_meta") {
      const parts: string[] = [];
      if (ce.input_tokens != null) parts.push(`Input: ${ce.input_tokens.toLocaleString()} tok`);
      if (ce.output_tokens != null) parts.push(`Output: ${ce.output_tokens.toLocaleString()} tok`);
      if (ce.think_tokens != null) parts.push(`Thinking: ${ce.think_tokens.toLocaleString()} tok`);
      if (ce.duration_ms != null) parts.push(`Duration: ${ce.duration_ms}ms`);
      if (parts.length > 0) {
        merged.events.push({
          id: `llm-meta-${ci}`,
          type: "llm_call",
          title: `LLM Response Meta${ce.model ? `: ${ce.model}` : ""}`,
          timestamp: ce.timestamp,
          text: parts.join("\n"),
          model: ce.model,
          tokens: ce.input_tokens != null
            ? { input: ce.input_tokens, output: ce.output_tokens ?? 0, thoughts: ce.think_tokens }
            : undefined,
          duration_ms: ce.duration_ms,
        });
      }
    }
    if (ce.type === "agent_start") {
      merged.events.push({
        id: `agent-start-${ci}`,
        type: "agent",
        title: `Agent Started: ${ce.agent ?? "golem"}`,
        timestamp: ce.timestamp,
        text: `Agent ${ce.agent ?? "golem"} invocation started`,
      });
    }
    if (ce.type === "agent_end") {
      merged.events.push({
        id: `agent-end-${ci}`,
        type: "agent",
        title: `Agent Completed: ${ce.agent ?? "golem"}`,
        timestamp: ce.timestamp,
        text: `Agent ${ce.agent ?? "golem"} invocation completed`,
      });
    }
  }

  const finalResponse = companions.findLast(
    (c) => c.type === "llm_response" && c.is_final
  );
  if (finalResponse?.response_text) {
    merged.events.push({
      id: "final-response",
      type: "text",
      title: "Final Agent Response",
      timestamp:
        finalResponse.timestamp ?? new Date().toISOString(),
      text: finalResponse.response_text,
    });
  }

  merged.events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  if (merged.model === "unknown") {
    const modelEvent = companions.find((c) => c.model);
    if (modelEvent?.model) merged.model = modelEvent.model;
  }

  const metaEvents = companions.filter((c) => c.type === "llm_response_meta");
  if (metaEvents.length > 0) {
    let totalInput = 0, totalOutput = 0, totalThink = 0;
    for (const m of metaEvents) {
      totalInput += m.input_tokens ?? 0;
      totalOutput += m.output_tokens ?? 0;
      totalThink += m.think_tokens ?? 0;
    }
    if (totalInput > 0 || totalOutput > 0) {
      merged.tokens = {
        input: totalInput,
        output: totalOutput,
        thoughts: totalThink,
        total: totalInput + totalOutput + totalThink,
      };
    }
  }

  return merged;
}
