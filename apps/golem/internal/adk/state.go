package adk

import (
	"google.golang.org/adk/session"
)

// Session state keys used by tools and the InstructionProvider.
const (
	StateKeyTargetURL   = "target_url"
	StateKeyCurrentStep = "current_step"
	StateKeyVisitedURLs = "visited_urls"
	StateKeyFindings    = "findings"
	StateKeyScreenshots = "screenshots"
)

// stateGetString reads a string value from session state, returning "" if
// the key is missing or not a string.
func stateGetString(state session.ReadonlyState, key string) string {
	v, err := state.Get(key)
	if err != nil || v == nil {
		return ""
	}
	s, ok := v.(string)
	if !ok {
		return ""
	}
	return s
}

// stateGetStringSlice reads a []string from session state. State values are
// deserialized as []any by the JSON layer, so we convert element-by-element.
func stateGetStringSlice(state session.ReadonlyState, key string) []string {
	v, err := state.Get(key)
	if err != nil || v == nil {
		return nil
	}

	switch typed := v.(type) {
	case []string:
		return typed
	case []any:
		out := make([]string, 0, len(typed))
		for _, elem := range typed {
			if s, ok := elem.(string); ok {
				out = append(out, s)
			}
		}
		return out
	}
	return nil
}

// stateGetInt reads an int from session state. JSON numbers deserialize as
// float64 in Go, so we handle that conversion.
func stateGetInt(state session.ReadonlyState, key string) int {
	v, err := state.Get(key)
	if err != nil || v == nil {
		return 0
	}
	switch typed := v.(type) {
	case int:
		return typed
	case float64:
		return int(typed)
	}
	return 0
}

// stateAppendString appends a value to a []string in session state, creating
// the slice if it does not exist. Deduplicates entries.
func stateAppendString(state session.State, key, value string) error {
	existing := stateGetStringSlice(state, key)
	for _, e := range existing {
		if e == value {
			return nil
		}
	}
	existing = append(existing, value)
	return state.Set(key, existing)
}
