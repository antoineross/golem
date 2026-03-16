package adk

import (
	"testing"
)

func TestNewPayloadTool(t *testing.T) {
	tool, err := NewPayloadTool()
	if err != nil {
		t.Fatalf("NewPayloadTool() error: %v", err)
	}
	if tool.Name() != "payload" {
		t.Errorf("expected tool name 'payload', got %q", tool.Name())
	}
}

func TestGeneratePayloads_AllCategories(t *testing.T) {
	categories := []string{"boundary", "logic", "auth", "xss", "idor", "hidden_element"}
	for _, cat := range categories {
		t.Run(cat, func(t *testing.T) {
			result, err := generatePayloads(nil, payloadArgs{Category: cat})
			if err != nil {
				t.Fatalf("generatePayloads(%q) error: %v", cat, err)
			}
			if result.Category != cat {
				t.Errorf("expected category %q, got %q", cat, result.Category)
			}
			if len(result.Payloads) == 0 {
				t.Error("expected non-empty payloads")
			}
			if result.Description == "" {
				t.Error("expected non-empty description")
			}
			if result.Usage == "" {
				t.Error("expected non-empty usage")
			}
		})
	}
}

func TestGeneratePayloads_UnknownCategory(t *testing.T) {
	_, err := generatePayloads(nil, payloadArgs{Category: "nonexistent"})
	if err == nil {
		t.Fatal("expected error for unknown category")
	}
}

func TestGeneratePayloads_CaseInsensitive(t *testing.T) {
	result, err := generatePayloads(nil, payloadArgs{Category: "BOUNDARY"})
	if err != nil {
		t.Fatalf("expected case-insensitive match, got error: %v", err)
	}
	if result.Category != "boundary" {
		t.Errorf("expected category 'boundary', got %q", result.Category)
	}
}

func TestGeneratePayloads_WithTrimming(t *testing.T) {
	result, err := generatePayloads(nil, payloadArgs{Category: "  logic  "})
	if err != nil {
		t.Fatalf("expected trimming to work, got error: %v", err)
	}
	if result.Category != "logic" {
		t.Errorf("expected category 'logic', got %q", result.Category)
	}
}

func TestGeneratePayloads_WithContext(t *testing.T) {
	result, err := generatePayloads(nil, payloadArgs{
		Category: "boundary",
		Context:  "price field in checkout form",
	})
	if err != nil {
		t.Fatalf("generatePayloads error: %v", err)
	}
	if result.Usage == "" {
		t.Error("expected non-empty usage with context")
	}
}

func TestPayloadSetsConsistency(t *testing.T) {
	for name, ps := range payloadSets {
		if ps.Category != name {
			t.Errorf("payloadSets[%q].Category = %q, want %q", name, ps.Category, name)
		}
	}
}
