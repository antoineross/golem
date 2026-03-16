package adk

import (
	"testing"
)

func TestNewEchoTool(t *testing.T) {
	tool, err := NewEchoTool()
	if err != nil {
		t.Fatalf("NewEchoTool() error: %v", err)
	}
	if tool.Name() != "echo" {
		t.Errorf("expected tool name 'echo', got %q", tool.Name())
	}
	if tool.Description() != "Echoes back a message. Use this to test that tool calling works." {
		t.Errorf("unexpected description: %q", tool.Description())
	}
}
