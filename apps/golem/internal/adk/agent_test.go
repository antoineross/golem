package adk

import (
	"strings"
	"testing"
)

func TestSystemInstruction_ContainsPersonas(t *testing.T) {
	personas := []string{
		"The Logic Abuser",
		"The Hidden Element Hunter",
		"The Privilege Escalator",
		"The PII Hunter",
	}
	for _, persona := range personas {
		if !strings.Contains(systemInstruction, persona) {
			t.Errorf("system instruction missing persona: %q", persona)
		}
	}
}

func TestSystemInstruction_ContainsMethodology(t *testing.T) {
	steps := []string{
		"RECONNAISSANCE",
		"SURFACE MAPPING",
		"VULNERABILITY HUNTING",
		"PAYLOAD TESTING",
		"REPORTING",
	}
	for _, step := range steps {
		if !strings.Contains(systemInstruction, step) {
			t.Errorf("system instruction missing methodology step: %q", step)
		}
	}
}

func TestSystemInstruction_ContainsSeverityLevels(t *testing.T) {
	levels := []string{"CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"}
	for _, level := range levels {
		if !strings.Contains(systemInstruction, level) {
			t.Errorf("system instruction missing severity level: %q", level)
		}
	}
}

func TestSystemInstruction_ReferencesTools(t *testing.T) {
	tools := []string{"browse", "screenshot", "click", "payload"}
	for _, tool := range tools {
		if !strings.Contains(systemInstruction, "\""+tool+"\"") {
			t.Errorf("system instruction missing tool reference: %q", tool)
		}
	}
}
