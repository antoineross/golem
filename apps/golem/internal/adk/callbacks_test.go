package adk

import (
	"bytes"
	"log/slog"
	"os"
	"strings"
	"testing"

	"google.golang.org/adk/model"
	"google.golang.org/genai"
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

func TestExtractPromptText_WithContent(t *testing.T) {
	req := &model.LLMRequest{
		Contents: []*genai.Content{
			genai.NewContentFromText("Hello world", genai.RoleUser),
		},
	}
	result := extractPromptText(req)
	if result != "[user] Hello world" {
		t.Errorf("unexpected prompt text: %q", result)
	}
}

func TestExtractPromptText_MultiPart(t *testing.T) {
	req := &model.LLMRequest{
		Contents: []*genai.Content{
			genai.NewContentFromText("first", genai.RoleUser),
			genai.NewContentFromText("second", genai.RoleModel),
		},
	}
	result := extractPromptText(req)
	if !strings.Contains(result, "[user] first") {
		t.Errorf("missing user part in %q", result)
	}
	if !strings.Contains(result, "[model] second") {
		t.Errorf("missing model part in %q", result)
	}
}

func TestCallbacksWriteToTraceWriter(t *testing.T) {
	tmpFile := t.TempDir() + "/trace_otel.json"
	tw, err := NewTraceWriter(tmpFile)
	if err != nil {
		t.Fatalf("NewTraceWriter: %v", err)
	}

	logger := slog.New(slog.NewJSONHandler(&bytes.Buffer{}, nil))
	cb := NewCallbacks(logger, tw, "test-model")

	if cb.tw == nil {
		t.Fatal("TraceWriter not set on callbacks")
	}
	if cb.model != "test-model" {
		t.Fatalf("model = %q, want test-model", cb.model)
	}

	tw.Write(TraceEvent{Type: "test_event", Agent: "test"})
	if err := tw.Close(); err != nil {
		t.Fatalf("tw.Close: %v", err)
	}

	data, err := os.ReadFile(tw.Path())
	if err != nil {
		t.Fatalf("read events file: %v", err)
	}
	if !strings.Contains(string(data), "test_event") {
		t.Errorf("events file does not contain test_event: %s", string(data))
	}
}
