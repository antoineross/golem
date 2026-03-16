package adk

import (
	"testing"

	"golem/internal/supacrawl"
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

func TestNewBrowseTool(t *testing.T) {
	client := supacrawl.NewClientWithURL("http://localhost:9999")
	tool, err := NewBrowseTool(client)
	if err != nil {
		t.Fatalf("NewBrowseTool() error: %v", err)
	}
	if tool.Name() != "browse" {
		t.Errorf("expected tool name 'browse', got %q", tool.Name())
	}
}

func TestNewScreenshotTool(t *testing.T) {
	client := supacrawl.NewClientWithURL("http://localhost:9999")
	tool, err := NewScreenshotTool(client)
	if err != nil {
		t.Fatalf("NewScreenshotTool() error: %v", err)
	}
	if tool.Name() != "screenshot" {
		t.Errorf("expected tool name 'screenshot', got %q", tool.Name())
	}
}

func TestNewClickTool(t *testing.T) {
	client := supacrawl.NewClientWithURL("http://localhost:9999")
	tool, err := NewClickTool(client)
	if err != nil {
		t.Fatalf("NewClickTool() error: %v", err)
	}
	if tool.Name() != "click" {
		t.Errorf("expected tool name 'click', got %q", tool.Name())
	}
}

func TestNewSupacrawlTools(t *testing.T) {
	client := supacrawl.NewClientWithURL("http://localhost:9999")
	tools, err := NewSupacrawlTools(client)
	if err != nil {
		t.Fatalf("NewSupacrawlTools() error: %v", err)
	}
	if len(tools) != 4 {
		t.Errorf("expected 4 tools, got %d", len(tools))
	}

	names := make(map[string]bool)
	for _, tool := range tools {
		names[tool.Name()] = true
	}
	for _, expected := range []string{"browse", "screenshot", "click", "find_hidden"} {
		if !names[expected] {
			t.Errorf("missing tool %q", expected)
		}
	}
}
