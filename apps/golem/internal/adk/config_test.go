package adk

import (
	"os"
	"testing"
)

func TestLoadLLMConfig_Defaults(t *testing.T) {
	os.Unsetenv("GOOGLE_API_KEY")
	os.Unsetenv("GEMINI_API_KEY")
	os.Unsetenv("DEFAULT_LLM_MODEL")
	os.Unsetenv("FALLBACK_LLM_MODEL")

	cfg := LoadLLMConfig()

	if cfg.APIKey != "" {
		t.Errorf("expected empty APIKey, got %q", cfg.APIKey)
	}
	if cfg.DefaultModel != "gemini-3-flash-preview" {
		t.Errorf("expected default model gemini-3-flash-preview, got %q", cfg.DefaultModel)
	}
	if cfg.FallbackModel != "gemini-3.1-flash-lite-preview" {
		t.Errorf("expected fallback model gemini-3.1-flash-lite-preview, got %q", cfg.FallbackModel)
	}
}

func TestLoadLLMConfig_GoogleAPIKeyPreferred(t *testing.T) {
	t.Setenv("GOOGLE_API_KEY", "google-key")
	t.Setenv("GEMINI_API_KEY", "gemini-key")

	cfg := LoadLLMConfig()

	if cfg.APIKey != "google-key" {
		t.Errorf("expected GOOGLE_API_KEY to take precedence, got %q", cfg.APIKey)
	}
}

func TestLoadLLMConfig_GeminiFallback(t *testing.T) {
	os.Unsetenv("GOOGLE_API_KEY")
	t.Setenv("GEMINI_API_KEY", "gemini-key")

	cfg := LoadLLMConfig()

	if cfg.APIKey != "gemini-key" {
		t.Errorf("expected GEMINI_API_KEY fallback, got %q", cfg.APIKey)
	}
}

func TestLoadLLMConfig_CustomModels(t *testing.T) {
	t.Setenv("DEFAULT_LLM_MODEL", "gemini-3.1-pro-preview")
	t.Setenv("FALLBACK_LLM_MODEL", "gemini-2.5-flash")

	cfg := LoadLLMConfig()

	if cfg.DefaultModel != "gemini-3.1-pro-preview" {
		t.Errorf("expected custom default model, got %q", cfg.DefaultModel)
	}
	if cfg.FallbackModel != "gemini-2.5-flash" {
		t.Errorf("expected custom fallback model, got %q", cfg.FallbackModel)
	}
}

func TestEnvOr(t *testing.T) {
	tests := []struct {
		name     string
		key      string
		envVal   string
		fallback string
		want     string
	}{
		{"env set", "TEST_ENV_OR", "value", "fallback", "value"},
		{"env empty", "TEST_ENV_OR_EMPTY", "", "fallback", "fallback"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.envVal != "" {
				t.Setenv(tt.key, tt.envVal)
			} else {
				os.Unsetenv(tt.key)
			}
			got := envOr(tt.key, tt.fallback)
			if got != tt.want {
				t.Errorf("envOr(%q, %q) = %q, want %q", tt.key, tt.fallback, got, tt.want)
			}
		})
	}
}
