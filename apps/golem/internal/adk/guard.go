package adk

import (
	"fmt"
	"sync"
)

type failureKey struct {
	tool string
	url  string
}

// ToolGuard tracks per-tool retry counts and enforces a global step budget.
// Shared across all tool closures via capture. Safe for concurrent use.
type ToolGuard struct {
	mu             sync.Mutex
	maxRetries     int
	maxTotalCalls  int
	totalCalls     int
	failures       map[failureKey]int
	warnThreshold  float64
	warningEmitted bool
}

func NewToolGuard(maxRetries, maxTotalCalls int) *ToolGuard {
	return &ToolGuard{
		maxRetries:    maxRetries,
		maxTotalCalls: maxTotalCalls,
		failures:      make(map[failureKey]int),
		warnThreshold: 0.8,
	}
}

// RecordCall increments the total call counter.
// Returns an error if the global step budget is exhausted.
// Returns a warning string (non-empty) when approaching the budget limit.
func (g *ToolGuard) RecordCall() (warning string, err error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	g.totalCalls++
	if g.maxTotalCalls > 0 && g.totalCalls > g.maxTotalCalls {
		return "", fmt.Errorf("step budget exhausted: %d/%d tool calls used", g.totalCalls, g.maxTotalCalls)
	}
	if g.maxTotalCalls > 0 && !g.warningEmitted {
		threshold := int(float64(g.maxTotalCalls) * g.warnThreshold)
		if g.totalCalls >= threshold {
			g.warningEmitted = true
			return fmt.Sprintf("approaching step budget: %d/%d calls used", g.totalCalls, g.maxTotalCalls), nil
		}
	}
	return "", nil
}

// RecordFailure increments the failure count for a tool+url pair.
// Returns true if the retry limit has been exceeded.
func (g *ToolGuard) RecordFailure(toolName, url string) bool {
	g.mu.Lock()
	defer g.mu.Unlock()

	k := failureKey{tool: toolName, url: url}
	g.failures[k]++
	return g.maxRetries > 0 && g.failures[k] > g.maxRetries
}

// RetriesExceeded returns true if the configured retry limit has been
// reached for the given tool+url pair. Returns false when maxRetries is 0
// (unlimited mode).
func (g *ToolGuard) RetriesExceeded(toolName, url string) bool {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.maxRetries <= 0 {
		return false
	}
	return g.failures[failureKey{tool: toolName, url: url}] >= g.maxRetries
}

// FailureCount returns the current failure count for a tool+url pair.
func (g *ToolGuard) FailureCount(toolName, url string) int {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.failures[failureKey{tool: toolName, url: url}]
}

// TotalCalls returns the current total call count.
func (g *ToolGuard) TotalCalls() int {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.totalCalls
}
