package adk

import (
	"log/slog"
	"time"

	"google.golang.org/adk/agent"
	"google.golang.org/adk/model"
	"google.golang.org/genai"
)

// Callbacks holds lifecycle hooks for structured logging of agent events.
// These feed into the reasoning panel (v0.7.1) by emitting structured log
// entries at each phase of the agent loop.
type Callbacks struct {
	logger *slog.Logger
}

func NewCallbacks(logger *slog.Logger) *Callbacks {
	if logger == nil {
		logger = slog.Default()
	}
	return &Callbacks{logger: logger}
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

	return nil, nil
}

// BeforeModel logs the prompt being sent to Gemini with tool count.
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
		"timestamp", time.Now().UTC().Format(time.RFC3339),
	)

	return nil, nil
}

// AfterModel logs the model response including whether it contains tool
// calls or a final text response. Passes through the original response
// and error to avoid suppressing them.
func (cb *Callbacks) AfterModel(ctx agent.CallbackContext, resp *model.LLMResponse, respErr error) (*model.LLMResponse, error) {
	if respErr != nil {
		cb.logger.Error("model response error",
			"agent", ctx.AgentName(),
			"error", respErr,
		)
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
	}

	return resp, respErr
}
