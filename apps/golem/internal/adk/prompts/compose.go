package prompts

import "strings"

var sections = []string{
	Base,
	Personas,
	Methodology,
	Tools,
	Rules,
}

// Compose assembles the full system instruction from all prompt sections.
func Compose() string {
	return strings.Join(sections, "\n\n")
}
