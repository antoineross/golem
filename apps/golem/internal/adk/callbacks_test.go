package adk

import (
	"bytes"
	"log/slog"
	"testing"

	"google.golang.org/adk/model"
)

func TestNewCallbacks(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(&bytes.Buffer{}, nil))
	cb := NewCallbacks(logger, nil, "test-model")
	if cb == nil {
		t.Fatal("NewCallbacks returned nil")
	}
	if cb.logger != logger {
		t.Fatal("logger not set correctly")
	}
	if cb.model != "test-model" {
		t.Fatal("model not set correctly")
	}
}

func TestNewCallbacks_NilLogger(t *testing.T) {
	cb := NewCallbacks(nil, nil, "")
	if cb == nil {
		t.Fatal("NewCallbacks returned nil")
	}
	if cb.logger == nil {
		t.Fatal("nil logger should default to slog.Default()")
	}
}

func TestAuditorOptions(t *testing.T) {
	tests := []struct {
		name   string
		option AuditorOption
	}{
		{"WithBeforeAgent", WithBeforeAgent(nil)},
		{"WithAfterAgent", WithAfterAgent(nil)},
		{"WithBeforeModel", WithBeforeModel(nil)},
		{"WithAfterModel", WithAfterModel(nil)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := auditorConfig{}
			tt.option(&cfg)
		})
	}
}

func TestRunnerConfig_Defaults(t *testing.T) {
	cfg := RunnerConfig{}
	if cfg.ArtifactService != nil {
		t.Error("default ArtifactService should be nil")
	}
}

func TestTruncateString(t *testing.T) {
	tests := []struct {
		input    string
		maxLen   int
		expected string
	}{
		{"hello", 10, "hello"},
		{"hello world", 5, "hello..."},
		{"", 5, ""},
		{"abc", 3, "abc"},
		{"abcd", 3, "abc..."},
	}
	for _, tt := range tests {
		got := truncateString(tt.input, tt.maxLen)
		if got != tt.expected {
			t.Errorf("truncateString(%q, %d) = %q, want %q", tt.input, tt.maxLen, got, tt.expected)
		}
	}
}

func TestExtractPromptText_Nil(t *testing.T) {
	result := extractPromptText(&model.LLMRequest{})
	if result != "" {
		t.Errorf("expected empty string for nil contents, got %q", result)
	}
}
