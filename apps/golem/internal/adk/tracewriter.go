package adk

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// TraceEvent represents a single event in the agent's execution trace.
// Written as JSONL by TraceWriter for the Observer UI to display alongside
// OTel spans (which lack prompt/response content in ADK v0.6.0).
type TraceEvent struct {
	Timestamp string `json:"timestamp"`
	Type      string `json:"type"`
	Agent     string `json:"agent,omitempty"`
	Model     string `json:"model,omitempty"`

	// LLM content (only when CaptureContent is enabled)
	PromptParts   int    `json:"prompt_parts,omitempty"`
	ToolsAvail    int    `json:"tools_available,omitempty"`
	ResponseText  string `json:"response_text,omitempty"`
	ThoughtText   string `json:"thought_text,omitempty"`
	IsFinal       bool   `json:"is_final,omitempty"`
	FinishReasons string `json:"finish_reasons,omitempty"`

	// Tool call content
	ToolName     string `json:"tool_name,omitempty"`
	ToolArgs     string `json:"tool_args,omitempty"`
	ToolResponse string `json:"tool_response,omitempty"`

	// Screenshot reference
	ScreenshotURL string `json:"screenshot_url,omitempty"`

	// Metrics
	InputTokens  int `json:"input_tokens,omitempty"`
	OutputTokens int `json:"output_tokens,omitempty"`
	ThinkTokens  int `json:"think_tokens,omitempty"`
	DurationMs   int `json:"duration_ms,omitempty"`
}

// TraceWriter writes structured event logs alongside OTel span files.
// The Observer UI merges these with OTel spans to show full content.
type TraceWriter struct {
	mu   sync.Mutex
	file *os.File
	enc  *json.Encoder
}

// NewTraceWriter creates a writer for the companion event log.
// The file is created next to the OTel span file with a _events.jsonl suffix.
// Returns nil (no-op writer) if otelPath is empty.
func NewTraceWriter(otelPath string) (*TraceWriter, error) {
	if otelPath == "" {
		return nil, nil
	}

	dir := filepath.Dir(otelPath)
	base := filepath.Base(otelPath)
	ext := filepath.Ext(base)
	name := base[:len(base)-len(ext)]
	eventsPath := filepath.Join(dir, name+"_events.jsonl")

	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create trace dir: %w", err)
	}

	f, err := os.Create(eventsPath)
	if err != nil {
		return nil, fmt.Errorf("create events file %s: %w", eventsPath, err)
	}

	return &TraceWriter{
		file: f,
		enc:  json.NewEncoder(f),
	}, nil
}

// Write appends an event to the JSONL file.
func (tw *TraceWriter) Write(event TraceEvent) {
	if tw == nil {
		return
	}
	if event.Timestamp == "" {
		event.Timestamp = time.Now().UTC().Format(time.RFC3339Nano)
	}
	tw.mu.Lock()
	defer tw.mu.Unlock()
	if err := tw.enc.Encode(event); err != nil {
		slog.Warn("trace write failed", "type", event.Type, "error", err)
	}
}

// Close syncs and closes the underlying file.
func (tw *TraceWriter) Close() error {
	if tw == nil {
		return nil
	}
	tw.mu.Lock()
	defer tw.mu.Unlock()
	if err := tw.file.Sync(); err != nil {
		slog.Warn("trace file sync failed", "error", err)
	}
	return tw.file.Close()
}

// Path returns the file path, or empty if nil.
func (tw *TraceWriter) Path() string {
	if tw == nil {
		return ""
	}
	return tw.file.Name()
}
