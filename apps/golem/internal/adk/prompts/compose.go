package prompts

import (
	"fmt"
	"strings"
)

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

// StateContext holds session-derived values injected into the dynamic prompt.
type StateContext struct {
	TargetURL     string
	CurrentStep   string
	VisitedURLs   []string
	FindingsCount int
}

// ComposeWithState assembles the system instruction and appends a dynamic
// context section derived from session state.
func ComposeWithState(sc StateContext) string {
	base := Compose()

	var ctx []string
	if sc.TargetURL != "" {
		ctx = append(ctx, fmt.Sprintf("- Target URL: %s", sc.TargetURL))
	}
	if sc.CurrentStep != "" {
		ctx = append(ctx, fmt.Sprintf("- Current methodology step: %s", sc.CurrentStep))
	}
	if len(sc.VisitedURLs) > 0 {
		maxDisplay := 20
		urls := sc.VisitedURLs
		suffix := ""
		if len(urls) > maxDisplay {
			suffix = fmt.Sprintf(" ... and %d more", len(urls)-maxDisplay)
			urls = urls[len(urls)-maxDisplay:]
		}
		ctx = append(ctx, fmt.Sprintf("- Pages already visited (%d): %s%s", len(sc.VisitedURLs), strings.Join(urls, ", "), suffix))
	}
	if sc.FindingsCount > 0 {
		ctx = append(ctx, fmt.Sprintf("- Findings so far: %d", sc.FindingsCount))
	}

	if len(ctx) == 0 {
		return base
	}

	return base + "\n\n## Session Context\n\n" + strings.Join(ctx, "\n")
}
