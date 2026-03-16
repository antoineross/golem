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
