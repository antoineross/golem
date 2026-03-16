package adk

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"google.golang.org/adk/agent"
	"google.golang.org/adk/model"
	"google.golang.org/genai"
)

// Callbacks holds lifecycle hooks for structured logging of agent events.
// When a TraceWriter is provided, callbacks also emit rich trace events
// for the Observer UI (LLM prompts, model metadata, usage stats).
type Callbacks struct {
	logger *slog.Logger
	tw     *TraceWriter
	model  string
	start  time.Time
}

func NewCallbacks(logger *slog.Logger, tw *TraceWriter, modelName string) *Callbacks {
	if logger == nil {
		logger = slog.Default()
	}
	return &Callbacks{logger: logger, tw: tw, model: modelName}
}

// BeforeAgent logs the start of an agent invocation with current session state.
func (cb *Callbacks) BeforeAgent(ctx agent.CallbackContext) (*genai.Content, error) {
	targetURL := stateGetString(ctx.ReadonlyState(), StateKeyTargetURL)
	visitedCount := len(stateGetStringSlice(ctx.ReadonlyState(), StateKeyVisitedURLs))

	cb.logger.Info("agent invocation started",
		"agent", ctx.AgentName(),
		"invocation_id", ctx.InvocationID(),
		"target_url", targetURL,
		"visited_count", visitedCount,
	)

	cb.tw.Write(TraceEvent{
		Type:  "agent_start",
		Agent: ctx.AgentName(),
	})

	return nil, nil
}

// AfterAgent logs completion of an agent invocation with summary statistics.
func (cb *Callbacks) AfterAgent(ctx agent.CallbackContext) (*genai.Content, error) {
	findingsCount := stateGetInt(ctx.ReadonlyState(), StateKeyFindings)
	visitedURLs := stateGetStringSlice(ctx.ReadonlyState(), StateKeyVisitedURLs)
	screenshots := stateGetStringSlice(ctx.ReadonlyState(), StateKeyScreenshots)

	cb.logger.Info("agent invocation completed",
		"agent", ctx.AgentName(),
		"invocation_id", ctx.InvocationID(),
		"findings", findingsCount,
		"pages_visited", len(visitedURLs),
		"screenshots_taken", len(screenshots),
	)

	cb.tw.Write(TraceEvent{
		Type:  "agent_end",
		Agent: ctx.AgentName(),
	})

	return nil, nil
}

// BeforeModel emits the full LLM prompt to the trace writer so the Observer
// can display what was sent to the model.
func (cb *Callbacks) BeforeModel(ctx agent.CallbackContext, req *model.LLMRequest) (*model.LLMResponse, error) {
	toolCount := 0
	if req.Config != nil && req.Config.Tools != nil {
		for _, t := range req.Config.Tools {
			if t.FunctionDeclarations != nil {
				toolCount += len(t.FunctionDeclarations)
			}
		}
	}

	contentParts := 0
	if req.Contents != nil {
		contentParts = len(req.Contents)
	}

	cb.logger.Info("model request",
		"agent", ctx.AgentName(),
		"content_parts", contentParts,
		"tools_available", toolCount,
	)

	cb.start = time.Now()

	promptText := extractPromptText(req)
	cb.tw.Write(TraceEvent{
		Type:         "llm_request",
		Agent:        ctx.AgentName(),
		Model:        cb.model,
		PromptParts:  contentParts,
		ToolsAvail:   toolCount,
		ResponseText: promptText,
	})

	return nil, nil
}

// AfterModel emits model response metadata including usage stats, tool call
// count, and thinking token info. Passes through the original response.
func (cb *Callbacks) AfterModel(ctx agent.CallbackContext, resp *model.LLMResponse, respErr error) (*model.LLMResponse, error) {
	durationMs := int(time.Since(cb.start).Milliseconds())

	if respErr != nil {
		cb.logger.Error("model response error",
			"agent", ctx.AgentName(),
			"error", respErr,
		)
		cb.tw.Write(TraceEvent{
			Type:         "llm_response",
			Agent:        ctx.AgentName(),
			Model:        cb.model,
			ResponseText: fmt.Sprintf("error: %v", respErr),
			DurationMs:   durationMs,
		})
	} else if resp == nil || resp.Content == nil {
		cb.logger.Warn("model returned empty response",
			"agent", ctx.AgentName(),
		)
	} else {
		toolCalls := 0
		hasText := false
		thoughtParts := 0
		for _, part := range resp.Content.Parts {
			if part.FunctionCall != nil {
				toolCalls++
			}
			if part.Thought {
				thoughtParts++
			}
			if part.Text != "" && !part.Thought {
				hasText = true
			}
		}

		cb.logger.Info("model response",
			"agent", ctx.AgentName(),
			"tool_calls", toolCalls,
			"has_text", hasText,
			"thought_parts", thoughtParts,
			"role", resp.Content.Role,
		)

		var inputTok, outputTok, thinkTok int
		if resp.UsageMetadata != nil {
			inputTok = int(resp.UsageMetadata.PromptTokenCount)
			outputTok = int(resp.UsageMetadata.CandidatesTokenCount)
			thinkTok = int(resp.UsageMetadata.ThoughtsTokenCount)
		}

		cb.tw.Write(TraceEvent{
			Type:         "llm_response_meta",
			Agent:        ctx.AgentName(),
			Model:        cb.model,
			InputTokens:  inputTok,
			OutputTokens: outputTok,
			ThinkTokens:  thinkTok,
			DurationMs:   durationMs,
		})
	}

	return resp, respErr
}

func extractPromptText(req *model.LLMRequest) string {
	if req.Contents == nil {
		return ""
	}
	var parts []string
	for _, content := range req.Contents {
		role := string(content.Role)
		for _, part := range content.Parts {
			if part.Text != "" {
				parts = append(parts, fmt.Sprintf("[%s] %s", role, part.Text))
			}
			if part.FunctionCall != nil {
				args, err := json.Marshal(part.FunctionCall.Args)
				if err != nil {
					slog.Warn("failed to marshal function call args", "function", part.FunctionCall.Name, "error", err)
					parts = append(parts, fmt.Sprintf("[%s] call:%s(MARSHAL_ERROR)", role, part.FunctionCall.Name))
				} else {
					parts = append(parts, fmt.Sprintf("[%s] call:%s(%s)", role, part.FunctionCall.Name, string(args)))
				}
			}
			if part.FunctionResponse != nil {
				resp, err := json.Marshal(part.FunctionResponse.Response)
				if err != nil {
					slog.Warn("failed to marshal function response", "function", part.FunctionResponse.Name, "error", err)
					parts = append(parts, fmt.Sprintf("[%s] result:%s -> MARSHAL_ERROR", role, part.FunctionResponse.Name))
				} else {
					parts = append(parts, fmt.Sprintf("[%s] result:%s -> %s", role, part.FunctionResponse.Name, truncateString(string(resp), 500)))
				}
			}
		}
	}
	return strings.Join(parts, "\n")
}

func truncateString(s string, maxLen int) string {
	if maxLen <= 0 {
		return ""
	}
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return string(runes[:maxLen]) + "..."
}
