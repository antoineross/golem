package prompts

import (
	"strings"
	"testing"
)

func TestCompose_NonEmpty(t *testing.T) {
	result := Compose()
	if strings.TrimSpace(result) == "" {
		t.Fatal("Compose() returned empty string")
	}
}

func TestCompose_ContainsAllSections(t *testing.T) {
	result := Compose()
	markers := []string{
		"G.O.L.E.M.",
		"Security Personas",
		"Methodology",
		"Tool Usage Guidelines",
		"Rules",
	}
	for _, marker := range markers {
		if !strings.Contains(result, marker) {
			t.Errorf("Compose() missing section marker: %q", marker)
		}
	}
}

func TestCompose_SectionsSeparated(t *testing.T) {
	result := Compose()
	if !strings.Contains(result, "\n\n") {
		t.Error("Compose() sections not separated by double newlines")
	}
}

func TestComposeWithState_EmptyContext(t *testing.T) {
	base := Compose()
	result := ComposeWithState(StateContext{})
	if base != result {
		t.Error("empty StateContext should produce same output as Compose()")
	}
}

func TestComposeWithState_TargetURL(t *testing.T) {
	result := ComposeWithState(StateContext{TargetURL: "https://example.com"})
	if !strings.Contains(result, "Session Context") {
		t.Error("expected Session Context header")
	}
	if !strings.Contains(result, "Target URL: https://example.com") {
		t.Error("expected target URL in output")
	}
}

func TestComposeWithState_CurrentStep(t *testing.T) {
	result := ComposeWithState(StateContext{CurrentStep: "RECONNAISSANCE"})
	if !strings.Contains(result, "Current methodology step: RECONNAISSANCE") {
		t.Error("expected current step in output")
	}
}

func TestComposeWithState_VisitedURLs(t *testing.T) {
	result := ComposeWithState(StateContext{
		VisitedURLs: []string{"https://a.com", "https://b.com"},
	})
	if !strings.Contains(result, "Pages already visited (2)") {
		t.Error("expected visited URL count")
	}
}

func TestComposeWithState_Findings(t *testing.T) {
	result := ComposeWithState(StateContext{FindingsCount: 5})
	if !strings.Contains(result, "Findings so far: 5") {
		t.Error("expected findings count")
	}
}

func TestComposeWithState_AllFields(t *testing.T) {
	result := ComposeWithState(StateContext{
		TargetURL:     "https://example.com",
		CurrentStep:   "SURFACE MAPPING",
		VisitedURLs:   []string{"https://example.com"},
		FindingsCount: 2,
	})
	if !strings.Contains(result, "Session Context") {
		t.Error("expected Session Context section")
	}
	base := Compose()
	if !strings.HasPrefix(result, base) {
		t.Error("ComposeWithState should start with base prompt")
	}
}
