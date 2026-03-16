package adk

import (
	"strings"
	"testing"

	"golem/internal/adk/prompts"
)

func TestComposedPrompt_ContainsPersonas(t *testing.T) {
	composed := prompts.Compose()
	personas := []string{
		"The Logic Abuser",
		"The Hidden Element Hunter",
		"The Privilege Escalator",
		"The PII Hunter",
	}
	for _, persona := range personas {
		if !strings.Contains(composed, persona) {
			t.Errorf("composed prompt missing persona: %q", persona)
		}
	}
}

func TestComposedPrompt_ContainsMethodology(t *testing.T) {
	composed := prompts.Compose()
	steps := []string{
		"RECONNAISSANCE",
		"SURFACE MAPPING",
		"VULNERABILITY HUNTING",
		"PAYLOAD TESTING",
		"REPORTING",
	}
	for _, step := range steps {
		if !strings.Contains(composed, step) {
			t.Errorf("composed prompt missing methodology step: %q", step)
		}
	}
}

func TestComposedPrompt_ContainsSeverityLevels(t *testing.T) {
	composed := prompts.Compose()
	levels := []string{"CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"}
	for _, level := range levels {
		if !strings.Contains(composed, level) {
			t.Errorf("composed prompt missing severity level: %q", level)
		}
	}
}

func TestComposedPrompt_ReferencesTools(t *testing.T) {
	composed := prompts.Compose()
	tools := []string{"browse", "screenshot", "click", "payload"}
	for _, tool := range tools {
		if !strings.Contains(composed, "\""+tool+"\"") {
			t.Errorf("composed prompt missing tool reference: %q", tool)
		}
	}
}

func TestComposedPrompt_ContainsAllSections(t *testing.T) {
	composed := prompts.Compose()
	sections := []string{
		"Your Mission",
		"Security Personas",
		"Methodology",
		"Tool Usage Guidelines",
		"Rules",
	}
	for _, section := range sections {
		if !strings.Contains(composed, section) {
			t.Errorf("composed prompt missing section: %q", section)
		}
	}
}

func TestPromptSections_NonEmpty(t *testing.T) {
	sections := map[string]string{
		"Base":        prompts.Base,
		"Personas":    prompts.Personas,
		"Methodology": prompts.Methodology,
		"Tools":       prompts.Tools,
		"Rules":       prompts.Rules,
	}
	for name, content := range sections {
		if strings.TrimSpace(content) == "" {
			t.Errorf("prompt section %q is empty", name)
		}
	}
}

func TestComposeWithState_NoState(t *testing.T) {
	base := prompts.Compose()
	withState := prompts.ComposeWithState(prompts.StateContext{})
	if base != withState {
		t.Error("ComposeWithState with empty context should equal Compose()")
	}
}

func TestComposeWithState_WithTargetURL(t *testing.T) {
	result := prompts.ComposeWithState(prompts.StateContext{
		TargetURL: "https://example.com",
	})
	if !strings.Contains(result, "Session Context") {
		t.Error("expected Session Context section")
	}
	if !strings.Contains(result, "https://example.com") {
		t.Error("expected target URL in context")
	}
}

func TestComposeWithState_WithFindings(t *testing.T) {
	result := prompts.ComposeWithState(prompts.StateContext{
		TargetURL:     "https://example.com",
		CurrentStep:   "RECONNAISSANCE",
		VisitedURLs:   []string{"https://example.com", "https://example.com/about"},
		FindingsCount: 3,
	})
	if !strings.Contains(result, "Findings so far: 3") {
		t.Error("expected findings count")
	}
	if !strings.Contains(result, "Pages already visited (2)") {
		t.Error("expected visited URL count")
	}
	if !strings.Contains(result, "RECONNAISSANCE") {
		t.Error("expected current step")
	}
}

func TestStateKeys_Defined(t *testing.T) {
	keys := []string{
		StateKeyTargetURL,
		StateKeyCurrentStep,
		StateKeyVisitedURLs,
		StateKeyFindings,
		StateKeyScreenshots,
	}
	for _, key := range keys {
		if key == "" {
			t.Error("state key should not be empty")
		}
	}
}
