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

  // Enrich OTel llm_call events with companion thought/response text
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
            ev.text = (ev.text ?? "") + `\n\n${label}\n${ce.response_text}`;
          }
          if (ce.type === "thought" && ce.thought_text) {
            ev.text = (ev.text ?? "") + `\n\n[Thought]\n${ce.thought_text}`;
          }
          break;
        }
        companionIdx++;
      }
    }

    // Enrich tool_call with screenshot URL from companion
    if (ev.type === "tool_call" && !ev.screenshot_url) {
      for (const ce of companions) {
        if (ce.type === "tool_response" && ce.tool_name === ev.tool_name && ce.screenshot_url) {
          ev.screenshot_url = ce.screenshot_url;
          break;
        }
      }
    }
  }

  // Add user prompt as first event
  const userPrompt = companions.find((c) => c.type === "user_prompt");
  if (userPrompt?.response_text) {
    merged.events.unshift({
      id: "user-prompt",
      type: "text",
      title: "User Prompt",
      timestamp: userPrompt.timestamp ?? merged.events[0]?.timestamp ?? new Date().toISOString(),
      text: userPrompt.response_text,
    });
  }

  // Merge llm_response_meta token data into OTel llm_call events (by order)
  const metaEvents = companions.filter((c) => c.type === "llm_response_meta");
  const otelLlmCalls = merged.events.filter((e) => e.type === "llm_call");
  for (let i = 0; i < Math.min(metaEvents.length, otelLlmCalls.length); i++) {
    const meta = metaEvents[i]!;
    const llm = otelLlmCalls[i]!;
    if (meta.input_tokens != null) {
      llm.tokens = {
        input: meta.input_tokens,
        output: meta.output_tokens ?? 0,
        thoughts: meta.think_tokens,
      };
    }
    if (meta.duration_ms != null && !llm.duration_ms) {
      llm.duration_ms = meta.duration_ms;
    }
  }

  // Add thoughts as separate thought events
  for (let ci = 0; ci < companions.length; ci++) {
    const ce = companions[ci]!;
    if (ce.type === "thought" && ce.thought_text) {
      merged.events.push({
        id: `thought-${ci}`,
        type: "thought",
        title: "Thinking",
        timestamp: ce.timestamp,
        text: ce.thought_text,
      });
    }
  }

  // Add final response
  const finalResponse = companions.findLast(
    (c) => c.type === "llm_response" && c.is_final
  );
  if (finalResponse?.response_text) {
    merged.events.push({
      id: "final-response",
      type: "text",
      title: "Final Agent Response",
      timestamp: finalResponse.timestamp ?? new Date().toISOString(),
      text: finalResponse.response_text,
    });
  }

  merged.events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  if (merged.model === "unknown") {
    const modelEvent = companions.find((c) => c.model);
    if (modelEvent?.model) merged.model = modelEvent.model;
  }

  // Aggregate token totals from companion meta events
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
