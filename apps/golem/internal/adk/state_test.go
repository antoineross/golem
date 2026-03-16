package adk

import (
	"iter"
	"testing"
)

// mockState implements session.State and session.ReadonlyState for testing.
type mockState struct {
	data map[string]any
}

func newMockState() *mockState {
	return &mockState{data: make(map[string]any)}
}

func (m *mockState) Get(key string) (any, error) {
	return m.data[key], nil
}

func (m *mockState) Set(key string, val any) error {
	m.data[key] = val
	return nil
}

func (m *mockState) All() iter.Seq2[string, any] {
	return func(yield func(string, any) bool) {
		for k, v := range m.data {
			if !yield(k, v) {
				return
			}
		}
	}
}

func TestStateGetString_Present(t *testing.T) {
	s := newMockState()
	s.data["key"] = "value"
	if got := stateGetString(s, "key"); got != "value" {
		t.Errorf("expected 'value', got %q", got)
	}
}

func TestStateGetString_Missing(t *testing.T) {
	s := newMockState()
	if got := stateGetString(s, "missing"); got != "" {
		t.Errorf("expected empty, got %q", got)
	}
}

func TestStateGetString_WrongType(t *testing.T) {
	s := newMockState()
	s.data["key"] = 42
	if got := stateGetString(s, "key"); got != "" {
		t.Errorf("expected empty for non-string, got %q", got)
	}
}

func TestStateGetStringSlice_StringSlice(t *testing.T) {
	s := newMockState()
	s.data["urls"] = []string{"a", "b"}
	got := stateGetStringSlice(s, "urls")
	if len(got) != 2 || got[0] != "a" || got[1] != "b" {
		t.Errorf("expected [a, b], got %v", got)
	}
}

func TestStateGetStringSlice_AnySlice(t *testing.T) {
	s := newMockState()
	s.data["urls"] = []any{"x", "y", "z"}
	got := stateGetStringSlice(s, "urls")
	if len(got) != 3 {
		t.Errorf("expected 3 elements, got %d", len(got))
	}
}

func TestStateGetStringSlice_Missing(t *testing.T) {
	s := newMockState()
	got := stateGetStringSlice(s, "missing")
	if got != nil {
		t.Errorf("expected nil, got %v", got)
	}
}

func TestStateGetInt_IntValue(t *testing.T) {
	s := newMockState()
	s.data["count"] = 5
	if got := stateGetInt(s, "count"); got != 5 {
		t.Errorf("expected 5, got %d", got)
	}
}

func TestStateGetInt_Float64Value(t *testing.T) {
	s := newMockState()
	s.data["count"] = float64(7)
	if got := stateGetInt(s, "count"); got != 7 {
		t.Errorf("expected 7, got %d", got)
	}
}

func TestStateGetInt_Missing(t *testing.T) {
	s := newMockState()
	if got := stateGetInt(s, "missing"); got != 0 {
		t.Errorf("expected 0, got %d", got)
	}
}

func TestStateAppendString_NewKey(t *testing.T) {
	s := newMockState()
	if err := stateAppendString(s, "urls", "https://example.com"); err != nil {
		t.Fatal(err)
	}
	got := stateGetStringSlice(s, "urls")
	if len(got) != 1 || got[0] != "https://example.com" {
		t.Errorf("expected [https://example.com], got %v", got)
	}
}

func TestStateAppendString_Deduplicates(t *testing.T) {
	s := newMockState()
	stateAppendString(s, "urls", "a")
	stateAppendString(s, "urls", "b")
	stateAppendString(s, "urls", "a")
	got := stateGetStringSlice(s, "urls")
	if len(got) != 2 {
		t.Errorf("expected 2 unique elements, got %d: %v", len(got), got)
	}
}

func TestStateAppendString_AppendsNew(t *testing.T) {
	s := newMockState()
	stateAppendString(s, "urls", "a")
	stateAppendString(s, "urls", "b")
	stateAppendString(s, "urls", "c")
	got := stateGetStringSlice(s, "urls")
	if len(got) != 3 {
		t.Errorf("expected 3 elements, got %d", len(got))
	}
}
