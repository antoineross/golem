package adk

import (
	"context"
	"errors"
	"iter"
	"sync/atomic"
	"testing"
	"time"

	"google.golang.org/adk/model"
	"google.golang.org/genai"
)

type mockLLM struct {
	name      string
	callCount atomic.Int32
	handler   func(attempt int32) iter.Seq2[*model.LLMResponse, error]
}

func (m *mockLLM) Name() string { return m.name }

func (m *mockLLM) GenerateContent(_ context.Context, _ *model.LLMRequest, _ bool) iter.Seq2[*model.LLMResponse, error] {
	n := m.callCount.Add(1)
	return m.handler(n)
}

func yieldOnce(resp *model.LLMResponse, err error) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		yield(resp, err)
	}
}

func testConfig() RetryConfig {
	return RetryConfig{
		MaxRetries: 3,
		BaseDelay:  1 * time.Millisecond,
		MaxDelay:   10 * time.Millisecond,
	}
}

func singleSlot(m *mockLLM) []modelSlot {
	return []modelSlot{{llm: m, keyLabel: "test"}}
}

func TestResilientModel_NoRetryOnSuccess(t *testing.T) {
	inner := &mockLLM{
		name: "test-model",
		handler: func(_ int32) iter.Seq2[*model.LLMResponse, error] {
			return yieldOnce(&model.LLMResponse{
				Content: genai.NewContentFromText("hello", genai.RoleModel),
			}, nil)
		},
	}

	rm := NewResilientModel(singleSlot(inner), testConfig())

	if rm.Name() != "test-model" {
		t.Errorf("Name() = %q, want %q", rm.Name(), "test-model")
	}

	ctx := context.Background()
	var responses []*model.LLMResponse
	for resp, err := range rm.GenerateContent(ctx, &model.LLMRequest{}, false) {
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		responses = append(responses, resp)
	}

	if len(responses) != 1 {
		t.Fatalf("expected 1 response, got %d", len(responses))
	}
	if inner.callCount.Load() != 1 {
		t.Errorf("expected 1 call, got %d", inner.callCount.Load())
	}
}

func TestResilientModel_RetriesOn429(t *testing.T) {
	inner := &mockLLM{
		name: "test-model",
		handler: func(attempt int32) iter.Seq2[*model.LLMResponse, error] {
			if attempt <= 2 {
				return yieldOnce(nil, errors.New("Error 429, Message: Resource has been exhausted (e.g. check quota)., Status: RESOURCE_EXHAUSTED"))
			}
			return yieldOnce(&model.LLMResponse{
				Content: genai.NewContentFromText("success", genai.RoleModel),
			}, nil)
		},
	}

	rm := NewResilientModel(singleSlot(inner), RetryConfig{
		MaxRetries: 5,
		BaseDelay:  1 * time.Millisecond,
		MaxDelay:   10 * time.Millisecond,
	})

	ctx := context.Background()
	var responses []*model.LLMResponse
	for resp, err := range rm.GenerateContent(ctx, &model.LLMRequest{}, false) {
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		responses = append(responses, resp)
	}

	if len(responses) != 1 {
		t.Fatalf("expected 1 response, got %d", len(responses))
	}
	if inner.callCount.Load() != 3 {
		t.Errorf("expected 3 calls (2 retries + 1 success), got %d", inner.callCount.Load())
	}
}

func TestResilientModel_RotatesToNextSlot(t *testing.T) {
	primary := &mockLLM{
		name: "primary-model",
		handler: func(_ int32) iter.Seq2[*model.LLMResponse, error] {
			return yieldOnce(nil, errors.New("Error 429, RESOURCE_EXHAUSTED"))
		},
	}
	backup := &mockLLM{
		name: "backup-model",
		handler: func(_ int32) iter.Seq2[*model.LLMResponse, error] {
			return yieldOnce(&model.LLMResponse{
				Content: genai.NewContentFromText("from backup", genai.RoleModel),
			}, nil)
		},
	}

	slots := []modelSlot{
		{llm: primary, keyLabel: "primary"},
		{llm: backup, keyLabel: "backup"},
	}

	rm := NewResilientModel(slots, RetryConfig{
		MaxRetries: 1,
		BaseDelay:  1 * time.Millisecond,
		MaxDelay:   5 * time.Millisecond,
	})

	ctx := context.Background()
	var responses []*model.LLMResponse
	for resp, err := range rm.GenerateContent(ctx, &model.LLMRequest{}, false) {
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		responses = append(responses, resp)
	}

	if len(responses) != 1 {
		t.Fatalf("expected 1 response, got %d", len(responses))
	}
	if backup.callCount.Load() != 1 {
		t.Errorf("expected backup to be called once, got %d", backup.callCount.Load())
	}
	// primary: 1 initial + 1 retry = 2
	if primary.callCount.Load() != 2 {
		t.Errorf("expected primary to be called 2 times, got %d", primary.callCount.Load())
	}
}

func TestResilientModel_AllSlotsExhausted(t *testing.T) {
	m1 := &mockLLM{
		name: "model-a",
		handler: func(_ int32) iter.Seq2[*model.LLMResponse, error] {
			return yieldOnce(nil, errors.New("Error 429, RESOURCE_EXHAUSTED"))
		},
	}
	m2 := &mockLLM{
		name: "model-b",
		handler: func(_ int32) iter.Seq2[*model.LLMResponse, error] {
			return yieldOnce(nil, errors.New("Error 429, RESOURCE_EXHAUSTED"))
		},
	}

	slots := []modelSlot{
		{llm: m1, keyLabel: "key-a"},
		{llm: m2, keyLabel: "key-b"},
	}

	rm := NewResilientModel(slots, RetryConfig{
		MaxRetries: 1,
		BaseDelay:  1 * time.Millisecond,
		MaxDelay:   5 * time.Millisecond,
	})

	ctx := context.Background()
	var lastErr error
	for _, err := range rm.GenerateContent(ctx, &model.LLMRequest{}, false) {
		lastErr = err
	}

	if lastErr == nil {
		t.Fatal("expected error after all slots exhausted")
	}
}

func TestResilientModel_NoRetryOnNonRetryableError(t *testing.T) {
	inner := &mockLLM{
		name: "test-model",
		handler: func(_ int32) iter.Seq2[*model.LLMResponse, error] {
			return yieldOnce(nil, errors.New("invalid API key"))
		},
	}

	rm := NewResilientModel(singleSlot(inner), testConfig())

	ctx := context.Background()
	var lastErr error
	for _, err := range rm.GenerateContent(ctx, &model.LLMRequest{}, false) {
		lastErr = err
	}

	if lastErr == nil {
		t.Fatal("expected error")
	}
	if inner.callCount.Load() != 1 {
		t.Errorf("expected 1 call (no retry), got %d", inner.callCount.Load())
	}
}

func TestResilientModel_RespectsContextCancellation(t *testing.T) {
	inner := &mockLLM{
		name: "test-model",
		handler: func(_ int32) iter.Seq2[*model.LLMResponse, error] {
			return yieldOnce(nil, errors.New("Error 429, RESOURCE_EXHAUSTED"))
		},
	}

	rm := NewResilientModel(singleSlot(inner), RetryConfig{
		MaxRetries: 5,
		BaseDelay:  500 * time.Millisecond,
		MaxDelay:   2 * time.Second,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	var lastErr error
	for _, err := range rm.GenerateContent(ctx, &model.LLMRequest{}, false) {
		lastErr = err
	}

	if lastErr == nil {
		t.Fatal("expected context error")
	}
	if !errors.Is(lastErr, context.DeadlineExceeded) {
		t.Errorf("expected context.DeadlineExceeded, got: %v", lastErr)
	}
}

func TestResilientModel_RetryableResponse(t *testing.T) {
	inner := &mockLLM{
		name: "test-model",
		handler: func(attempt int32) iter.Seq2[*model.LLMResponse, error] {
			if attempt == 1 {
				return yieldOnce(&model.LLMResponse{
					ErrorCode:    "RESOURCE_EXHAUSTED",
					ErrorMessage: "quota exceeded",
				}, nil)
			}
			return yieldOnce(&model.LLMResponse{
				Content: genai.NewContentFromText("ok", genai.RoleModel),
			}, nil)
		},
	}

	rm := NewResilientModel(singleSlot(inner), testConfig())

	ctx := context.Background()
	var responses []*model.LLMResponse
	for resp, err := range rm.GenerateContent(ctx, &model.LLMRequest{}, false) {
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		responses = append(responses, resp)
	}

	if len(responses) != 1 {
		t.Fatalf("expected 1 response, got %d", len(responses))
	}
	if inner.callCount.Load() != 2 {
		t.Errorf("expected 2 calls (1 retry + 1 success), got %d", inner.callCount.Load())
	}
}

func TestResilientModel_FourSlotRotation(t *testing.T) {
	// Simulates: primary/key1, primary/key2, fallback/key1, fallback/key2
	// First 3 all return 429, 4th succeeds
	callOrder := make([]string, 0)
	makeSlot := func(name, key string, fail bool) modelSlot {
		m := &mockLLM{
			name: name,
			handler: func(_ int32) iter.Seq2[*model.LLMResponse, error] {
				callOrder = append(callOrder, name+"/"+key)
				if fail {
					return yieldOnce(nil, errors.New("Error 429, RESOURCE_EXHAUSTED"))
				}
				return yieldOnce(&model.LLMResponse{
					Content: genai.NewContentFromText("slot4 success", genai.RoleModel),
				}, nil)
			},
		}
		return modelSlot{llm: m, keyLabel: key}
	}

	slots := []modelSlot{
		makeSlot("flash", "primary", true),
		makeSlot("flash", "backup", true),
		makeSlot("flash-lite", "primary", true),
		makeSlot("flash-lite", "backup", false),
	}

	rm := NewResilientModel(slots, RetryConfig{
		MaxRetries: 0, // no retries per slot, immediate rotation
		BaseDelay:  1 * time.Millisecond,
		MaxDelay:   5 * time.Millisecond,
	})

	ctx := context.Background()
	var responses []*model.LLMResponse
	for resp, err := range rm.GenerateContent(ctx, &model.LLMRequest{}, false) {
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		responses = append(responses, resp)
	}

	if len(responses) != 1 {
		t.Fatalf("expected 1 response, got %d", len(responses))
	}
	if len(callOrder) != 4 {
		t.Errorf("expected 4 slot calls, got %d: %v", len(callOrder), callOrder)
	}
}

func TestBackoffDelay(t *testing.T) {
	base := 2 * time.Second
	max := 30 * time.Second

	for attempt := 0; attempt < 10; attempt++ {
		d := backoffDelay(attempt, base, max)
		if d > max {
			t.Errorf("attempt %d: delay %v exceeds max %v", attempt, d, max)
		}
		if d <= 0 {
			t.Errorf("attempt %d: delay must be positive, got %v", attempt, d)
		}
	}
}

func TestIsRetryableError(t *testing.T) {
	tests := []struct {
		err  string
		want bool
	}{
		{"Error 429, Message: Resource has been exhausted", true},
		{"RESOURCE_EXHAUSTED", true},
		{"quota exceeded", true},
		{"invalid API key", false},
		{"connection refused", false},
		{"failed to call model: Error 429, Message: Resource has been exhausted (e.g. check quota)., Status: RESOURCE_EXHAUSTED, Details: []", true},
	}

	for _, tt := range tests {
		got := isRetryableError(errors.New(tt.err))
		if got != tt.want {
			t.Errorf("isRetryableError(%q) = %v, want %v", tt.err, got, tt.want)
		}
	}
}

func TestStreamingRetry(t *testing.T) {
	inner := &mockLLM{
		name: "test-model",
		handler: func(attempt int32) iter.Seq2[*model.LLMResponse, error] {
			if attempt == 1 {
				return yieldOnce(nil, errors.New("Error 429, RESOURCE_EXHAUSTED"))
			}
			return func(yield func(*model.LLMResponse, error) bool) {
				if !yield(&model.LLMResponse{
					Content: genai.NewContentFromText("chunk1", genai.RoleModel),
					Partial: true,
				}, nil) {
					return
				}
				yield(&model.LLMResponse{
					Content:      genai.NewContentFromText("chunk2", genai.RoleModel),
					TurnComplete: true,
				}, nil)
			}
		},
	}

	rm := NewResilientModel(singleSlot(inner), testConfig())

	ctx := context.Background()
	var responses []*model.LLMResponse
	for resp, err := range rm.GenerateContent(ctx, &model.LLMRequest{}, true) {
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		responses = append(responses, resp)
	}

	if len(responses) != 2 {
		t.Fatalf("expected 2 streaming responses, got %d", len(responses))
	}
	if inner.callCount.Load() != 2 {
		t.Errorf("expected 2 calls, got %d", inner.callCount.Load())
	}
}

func TestResilientModel_EmptySlots(t *testing.T) {
	rm := NewResilientModel(nil, testConfig())
	if rm.Name() != "resilient-model" {
		t.Errorf("expected default name, got %q", rm.Name())
	}
}
