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
