package adk

import (
	"testing"
)

func TestToolGuard_RecordCall_Budget(t *testing.T) {
	g := NewToolGuard(3, 5)

	for i := 0; i < 5; i++ {
		_, err := g.RecordCall()
		if err != nil {
			t.Fatalf("call %d should succeed, got: %v", i+1, err)
		}
	}

	_, err := g.RecordCall()
	if err == nil {
		t.Fatal("expected budget exhaustion error on call 6")
	}
}

func TestToolGuard_RecordCall_Warning(t *testing.T) {
	g := NewToolGuard(3, 10)

	var warnings []string
	for i := 0; i < 10; i++ {
		warn, err := g.RecordCall()
		if err != nil {
			t.Fatalf("call %d should succeed, got: %v", i+1, err)
		}
		if warn != "" {
			warnings = append(warnings, warn)
		}
	}

	if len(warnings) != 1 {
		t.Errorf("expected exactly 1 warning, got %d", len(warnings))
	}
}

func TestToolGuard_RecordFailure_Limit(t *testing.T) {
	g := NewToolGuard(3, 50)

	for i := 0; i < 3; i++ {
		exceeded := g.RecordFailure("screenshot", "https://example.com")
		if exceeded {
			t.Fatalf("failure %d should not exceed limit", i+1)
		}
	}

	exceeded := g.RecordFailure("screenshot", "https://example.com")
	if !exceeded {
		t.Fatal("failure 4 should exceed the 3-retry limit")
	}
}

func TestToolGuard_RecordFailure_DifferentURLs(t *testing.T) {
	g := NewToolGuard(2, 50)

	g.RecordFailure("screenshot", "https://a.com")
	g.RecordFailure("screenshot", "https://a.com")
	g.RecordFailure("screenshot", "https://b.com")

	if g.FailureCount("screenshot", "https://a.com") != 2 {
		t.Errorf("expected 2 failures for a.com, got %d", g.FailureCount("screenshot", "https://a.com"))
	}
	if g.FailureCount("screenshot", "https://b.com") != 1 {
		t.Errorf("expected 1 failure for b.com, got %d", g.FailureCount("screenshot", "https://b.com"))
	}
}

func TestToolGuard_TotalCalls(t *testing.T) {
	g := NewToolGuard(3, 50)

	g.RecordCall()
	g.RecordCall()
	g.RecordCall()

	if g.TotalCalls() != 3 {
		t.Errorf("expected 3 total calls, got %d", g.TotalCalls())
	}
}

func TestToolGuard_NoBudget(t *testing.T) {
	g := NewToolGuard(0, 0)

	for i := 0; i < 100; i++ {
		_, err := g.RecordCall()
		if err != nil {
			t.Fatalf("call %d should succeed with no budget limit, got: %v", i+1, err)
		}
	}

	exceeded := g.RecordFailure("screenshot", "https://example.com")
	if exceeded {
		t.Fatal("should not exceed limit when maxRetries is 0")
	}
}

func TestToolGuard_RetriesExceeded(t *testing.T) {
	g := NewToolGuard(2, 50)

	if g.RetriesExceeded("screenshot", "https://example.com") {
		t.Fatal("should not be exceeded with 0 failures")
	}

	g.RecordFailure("screenshot", "https://example.com")
	if g.RetriesExceeded("screenshot", "https://example.com") {
		t.Fatal("should not be exceeded after 1 failure (limit=2)")
	}

	g.RecordFailure("screenshot", "https://example.com")
	if !g.RetriesExceeded("screenshot", "https://example.com") {
		t.Fatal("should be exceeded after 2 failures (limit=2)")
	}

	if g.RetriesExceeded("screenshot", "https://other.com") {
		t.Fatal("different URL should not be exceeded")
	}
}

func TestToolGuard_RetriesExceeded_Unlimited(t *testing.T) {
	g := NewToolGuard(0, 50)

	for i := 0; i < 100; i++ {
		g.RecordFailure("screenshot", "https://example.com")
	}

	if g.RetriesExceeded("screenshot", "https://example.com") {
		t.Fatal("RetriesExceeded should always return false when maxRetries=0")
	}
}

func TestToolGuard_KeyCollisionSafe(t *testing.T) {
	g := NewToolGuard(3, 50)

	g.RecordFailure("a:b", "c")
	g.RecordFailure("a", "b:c")

	if g.FailureCount("a:b", "c") != 1 {
		t.Errorf("expected 1 failure for tool=a:b url=c, got %d", g.FailureCount("a:b", "c"))
	}
	if g.FailureCount("a", "b:c") != 1 {
		t.Errorf("expected 1 failure for tool=a url=b:c, got %d", g.FailureCount("a", "b:c"))
	}
}
