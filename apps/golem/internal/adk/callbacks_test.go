package adk

import (
	"bytes"
	"log/slog"
	"testing"
)

func TestNewCallbacks(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(&bytes.Buffer{}, nil))
	cb := NewCallbacks(logger)
	if cb == nil {
		t.Fatal("NewCallbacks returned nil")
	}
	if cb.logger != logger {
		t.Fatal("logger not set correctly")
	}
}

func TestNewCallbacks_NilLogger(t *testing.T) {
	cb := NewCallbacks(nil)
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
