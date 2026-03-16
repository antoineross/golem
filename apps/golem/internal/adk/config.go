package adk

import (
	"log/slog"
	"os"
	"strconv"
	"time"

	"google.golang.org/genai"
)

type LLMConfig struct {
	APIKey        string
	DefaultModel  string
	FallbackModel string

	ThinkingLevel   string
	ThinkingBudget  int32
	IncludeThoughts bool

	RetryMaxAttempts int
	RetryBaseDelayMs int
	RetryMaxDelayMs  int
}

func LoadLLMConfig() LLMConfig {
	apiKey := os.Getenv("GOOGLE_API_KEY")
	if apiKey == "" {
		apiKey = os.Getenv("GEMINI_API_KEY")
	}
	return LLMConfig{
		APIKey:           apiKey,
		DefaultModel:     envOr("DEFAULT_LLM_MODEL", "gemini-3-flash-preview"),
		FallbackModel:    envOr("FALLBACK_LLM_MODEL", "gemini-3.1-flash-lite-preview"),
		ThinkingLevel:    envOr("GOLEM_THINKING_LEVEL", "medium"),
		ThinkingBudget:   envInt32("GOLEM_THINKING_BUDGET", 0),
		IncludeThoughts:  envBool("GOLEM_INCLUDE_THOUGHTS", true),
		RetryMaxAttempts: int(envInt32("GOLEM_RETRY_MAX", 5)),
		RetryBaseDelayMs: int(envInt32("GOLEM_RETRY_BASE_DELAY_MS", 2000)),
		RetryMaxDelayMs:  int(envInt32("GOLEM_RETRY_MAX_DELAY_MS", 30000)),
	}
}

// RetryConfigFromEnv returns the retry configuration derived from env-based settings.
// Values are assigned directly from LLMConfig (which already has defaults from LoadLLMConfig),
// so zero values are respected (e.g., setting retries to 0 disables retries).
func (c LLMConfig) RetryConfigFromEnv() RetryConfig {
	cfg := DefaultRetryConfig()
	cfg.MaxRetries = c.RetryMaxAttempts
	cfg.BaseDelay = time.Duration(c.RetryBaseDelayMs) * time.Millisecond
	cfg.MaxDelay = time.Duration(c.RetryMaxDelayMs) * time.Millisecond
	return cfg
}

// ThinkingActive reports whether any thinking feature is configured.
func (c LLMConfig) ThinkingActive() bool {
	return c.ThinkingLevel != "" || c.ThinkingBudget != 0 || c.IncludeThoughts
}

// GenerateContentConfig builds a genai.GenerateContentConfig with thinking
// support wired in. Gemini 3 models use ThinkingLevel; Gemini 2.5 models
// use ThinkingBudget. Both respect IncludeThoughts.
func (c LLMConfig) GenerateContentConfig() *genai.GenerateContentConfig {
	cfg := &genai.GenerateContentConfig{}

	if !c.ThinkingActive() {
		return cfg
	}

	tc := &genai.ThinkingConfig{
		IncludeThoughts: c.IncludeThoughts,
	}

	if c.ThinkingLevel != "" {
		tc.ThinkingLevel = genai.ThinkingLevel(c.ThinkingLevel)
	}

	if c.ThinkingBudget != 0 {
		tc.ThinkingBudget = genai.Ptr(c.ThinkingBudget)
	}

	cfg.ThinkingConfig = tc
	return cfg
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt32(key string, fallback int32) int32 {
	if v := os.Getenv(key); v != "" {
		i, err := strconv.ParseInt(v, 10, 32)
		if err != nil {
			slog.Warn("invalid env var value, using fallback", "key", key, "value", v, "fallback", fallback, "error", err)
		} else {
			return int32(i)
		}
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			slog.Warn("invalid env var value, using fallback", "key", key, "value", v, "fallback", fallback, "error", err)
		} else {
			return b
		}
	}
	return fallback
}
