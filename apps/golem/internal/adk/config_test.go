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
	os.Unsetenv("GOLEM_THINKING_LEVEL")
	os.Unsetenv("GOLEM_THINKING_BUDGET")
	os.Unsetenv("GOLEM_INCLUDE_THOUGHTS")

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
	if cfg.ThinkingLevel != "medium" {
		t.Errorf("ThinkingLevel: got %q, want medium", cfg.ThinkingLevel)
	}
	if cfg.ThinkingBudget != 0 {
		t.Errorf("ThinkingBudget: got %v, want 0", cfg.ThinkingBudget)
	}
	if !cfg.IncludeThoughts {
		t.Error("IncludeThoughts should default to true")
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

func TestLoadLLMConfig_ThinkingEnvOverrides(t *testing.T) {
	t.Setenv("GOLEM_THINKING_LEVEL", "high")
	t.Setenv("GOLEM_THINKING_BUDGET", "8192")
	t.Setenv("GOLEM_INCLUDE_THOUGHTS", "false")

	cfg := LoadLLMConfig()

	if cfg.ThinkingLevel != "high" {
		t.Errorf("ThinkingLevel: got %q, want high", cfg.ThinkingLevel)
	}
	if cfg.ThinkingBudget != 8192 {
		t.Errorf("ThinkingBudget: got %v, want 8192", cfg.ThinkingBudget)
	}
	if cfg.IncludeThoughts {
		t.Error("IncludeThoughts should be false when overridden")
	}
}

func TestThinkingActive(t *testing.T) {
	tests := []struct {
		name   string
		cfg    LLMConfig
		active bool
	}{
		{"all zero", LLMConfig{}, false},
		{"level set", LLMConfig{ThinkingLevel: "low"}, true},
		{"budget set", LLMConfig{ThinkingBudget: 1024}, true},
		{"thoughts only", LLMConfig{IncludeThoughts: true}, true},
		{"level and thoughts", LLMConfig{ThinkingLevel: "medium", IncludeThoughts: true}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.cfg.ThinkingActive(); got != tt.active {
				t.Errorf("ThinkingActive() = %v, want %v", got, tt.active)
			}
		})
	}
}

func TestGenerateContentConfig_NoThinking(t *testing.T) {
	cfg := LLMConfig{}
	gcc := cfg.GenerateContentConfig()

	if gcc.ThinkingConfig != nil {
		t.Error("ThinkingConfig should be nil when no thinking configured")
	}
}

func TestGenerateContentConfig_ThinkingLevel(t *testing.T) {
	cfg := LLMConfig{
		ThinkingLevel:   "medium",
		IncludeThoughts: true,
	}
	gcc := cfg.GenerateContentConfig()

	if gcc.ThinkingConfig == nil {
		t.Fatal("ThinkingConfig should not be nil when level is set")
	}
	if !gcc.ThinkingConfig.IncludeThoughts {
		t.Error("IncludeThoughts should be true")
	}
	if gcc.ThinkingConfig.ThinkingLevel != "medium" {
		t.Errorf("ThinkingLevel: got %q, want medium", gcc.ThinkingConfig.ThinkingLevel)
	}
	if gcc.ThinkingConfig.ThinkingBudget != nil {
		t.Error("ThinkingBudget should be nil when only level is set")
	}
}

func TestGenerateContentConfig_ThinkingBudget(t *testing.T) {
	cfg := LLMConfig{
		ThinkingBudget:  8192,
		IncludeThoughts: true,
	}
	gcc := cfg.GenerateContentConfig()

	if gcc.ThinkingConfig == nil {
		t.Fatal("ThinkingConfig should not be nil when budget is set")
	}
	if *gcc.ThinkingConfig.ThinkingBudget != 8192 {
		t.Errorf("ThinkingBudget: got %v, want 8192", *gcc.ThinkingConfig.ThinkingBudget)
	}
}

func TestGenerateContentConfig_IncludeThoughtsOnly(t *testing.T) {
	cfg := LLMConfig{
		IncludeThoughts: true,
	}
	gcc := cfg.GenerateContentConfig()

	if gcc.ThinkingConfig == nil {
		t.Fatal("ThinkingConfig should not be nil when IncludeThoughts is true")
	}
	if !gcc.ThinkingConfig.IncludeThoughts {
		t.Error("IncludeThoughts should be true")
	}
	if gcc.ThinkingConfig.ThinkingLevel != "" {
		t.Error("ThinkingLevel should be empty")
	}
	if gcc.ThinkingConfig.ThinkingBudget != nil {
		t.Error("ThinkingBudget should be nil")
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

func TestEnvInt32(t *testing.T) {
	tests := []struct {
		name     string
		key      string
		envVal   string
		fallback int32
		want     int32
	}{
		{"not set", "TEST_INT32_UNSET", "", 42, 42},
		{"valid", "TEST_INT32_VALID", "100", 42, 100},
		{"invalid", "TEST_INT32_BAD", "abc", 42, 42},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.envVal != "" {
				t.Setenv(tt.key, tt.envVal)
			} else {
				os.Unsetenv(tt.key)
			}
			if got := envInt32(tt.key, tt.fallback); got != tt.want {
				t.Errorf("envInt32(%q, %d) = %d, want %d", tt.key, tt.fallback, got, tt.want)
			}
		})
	}
}

func TestEnvBool(t *testing.T) {
	tests := []struct {
		name     string
		key      string
		envVal   string
		fallback bool
		want     bool
	}{
		{"not set", "TEST_BOOL_UNSET", "", false, false},
		{"true", "TEST_BOOL_TRUE", "true", false, true},
		{"false", "TEST_BOOL_FALSE", "false", true, false},
		{"invalid", "TEST_BOOL_BAD", "yes", false, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.envVal != "" {
				t.Setenv(tt.key, tt.envVal)
			} else {
				os.Unsetenv(tt.key)
			}
			if got := envBool(tt.key, tt.fallback); got != tt.want {
				t.Errorf("envBool(%q, %t) = %t, want %t", tt.key, tt.fallback, got, tt.want)
			}
		})
	}
}
