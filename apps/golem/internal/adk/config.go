package adk

import "os"

type LLMConfig struct {
	APIKey        string
	DefaultModel  string
	FallbackModel string
}

func LoadLLMConfig() LLMConfig {
	return LLMConfig{
		APIKey:        envOr("GEMINI_API_KEY", os.Getenv("GOOGLE_API_KEY")),
		DefaultModel:  envOr("DEFAULT_LLM_MODEL", "gemini-3-flash-preview"),
		FallbackModel: envOr("FALLBACK_LLM_MODEL", "gemini-3.1-flash-lite-preview"),
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
