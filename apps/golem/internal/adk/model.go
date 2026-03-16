package adk

import (
	"context"
	"fmt"
	"log/slog"

	"google.golang.org/adk/model"
	"google.golang.org/adk/model/gemini"
	"google.golang.org/genai"
)

func NewModel(ctx context.Context, logger *slog.Logger) (model.LLM, error) {
	cfg := LoadLLMConfig()
	if cfg.APIKey == "" {
		return nil, fmt.Errorf("GOOGLE_API_KEY or GEMINI_API_KEY is required")
	}

	clientCfg := &genai.ClientConfig{
		APIKey: cfg.APIKey,
	}

	models := []string{cfg.DefaultModel, cfg.FallbackModel}
	var lastErr error

	for _, name := range models {
		if name == "" {
			continue
		}
		llm, err := gemini.NewModel(ctx, name, clientCfg)
		if err != nil {
			logger.Warn("model init failed, trying fallback", "model", name, "error", err)
			lastErr = err
			continue
		}
		logger.Info("model initialized", "model", name)
		return llm, nil
	}

	return nil, fmt.Errorf("all models failed, last error: %w", lastErr)
}
