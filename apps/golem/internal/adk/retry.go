package adk

import (
	"context"
	"errors"
	"iter"
	"log/slog"
	"math"
	"math/rand/v2"
	"strings"
	"time"

	"google.golang.org/adk/model"
)

// RetryConfig controls retry behavior for rate-limited model calls.
type RetryConfig struct {
	MaxRetries int
	BaseDelay  time.Duration
	MaxDelay   time.Duration
}

// DefaultRetryConfig returns the Google-recommended defaults for handling
// Gemini API 429 errors: 5 retries with exponential backoff from 2s to 30s.
func DefaultRetryConfig() RetryConfig {
	return RetryConfig{
		MaxRetries: 5,
		BaseDelay:  2 * time.Second,
		MaxDelay:   30 * time.Second,
	}
}

// modelSlot is a named LLM with its API key label for logging.
type modelSlot struct {
	llm      model.LLM
	keyLabel string
}

// ResilientModel wraps multiple model.LLM instances (different API keys and/or
// model names) and rotates through them on 429 errors. Each slot gets its own
// retry budget with exponential backoff before moving to the next slot.
type ResilientModel struct {
	slots  []modelSlot
	config RetryConfig
}

// NewResilientModel creates a resilient model from one or more LLM slots.
// On 429 errors, it retries with backoff on the current slot, then rotates
// to the next slot. The name returned is from the first slot.
func NewResilientModel(slots []modelSlot, cfg RetryConfig) *ResilientModel {
	return &ResilientModel{slots: slots, config: cfg}
}

func (m *ResilientModel) Name() string {
	if len(m.slots) == 0 {
		return "resilient-model"
	}
	return m.slots[0].llm.Name()
}

// GenerateContent tries each model slot in order. Per slot, it retries up to
// MaxRetries on 429 errors with exponential backoff. If a slot exhausts its
// retries, the next slot is tried. If all slots fail, the last error is yielded.
func (m *ResilientModel) GenerateContent(ctx context.Context, req *model.LLMRequest, stream bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		if len(m.slots) == 0 {
			yield(nil, errors.New("no model slots configured"))
			return
		}

		var lastErr error

		for slotIdx, slot := range m.slots {
			if m.trySlot(ctx, slotIdx, slot, req, stream, yield, &lastErr) {
				return
			}
		}

		if lastErr != nil {
			yield(nil, lastErr)
		}
	}
}

// trySlot attempts the given slot up to MaxRetries. Returns true if it
// successfully yielded responses to the caller (meaning we're done).
// Returns false if the slot was exhausted by retryable errors.
func (m *ResilientModel) trySlot(
	ctx context.Context,
	slotIdx int,
	slot modelSlot,
	req *model.LLMRequest,
	stream bool,
	yield func(*model.LLMResponse, error) bool,
	lastErr *error,
) bool {
	for attempt := 0; attempt <= m.config.MaxRetries; attempt++ {
		outcome := m.tryOnce(ctx, slotIdx, slot, attempt, req, stream, yield, lastErr)
		switch outcome {
		case outcomeSuccess:
			return true
		case outcomeFatalError:
			return true
		case outcomeContextDone:
			yield(nil, ctx.Err())
			return true
		case outcomeRetry:
			continue
		case outcomeSlotExhausted:
			return false
		}
	}
	return false
}

type callOutcome int

const (
	outcomeSuccess callOutcome = iota
	outcomeRetry
	outcomeSlotExhausted
	outcomeFatalError
	outcomeContextDone
)

func (m *ResilientModel) tryOnce(
	ctx context.Context,
	slotIdx int,
	slot modelSlot,
	attempt int,
	req *model.LLMRequest,
	stream bool,
	yield func(*model.LLMResponse, error) bool,
	lastErr *error,
) callOutcome {
	for resp, err := range slot.llm.GenerateContent(ctx, req, stream) {
		if err != nil && isRetryableError(err) {
			*lastErr = err
			if attempt < m.config.MaxRetries {
				delay := backoffDelay(attempt, m.config.BaseDelay, m.config.MaxDelay)
				slog.Warn("model rate limited, retrying",
					"slot", slotIdx,
					"key", slot.keyLabel,
					"model", slot.llm.Name(),
					"attempt", attempt+1,
					"max_retries", m.config.MaxRetries,
					"delay", delay,
				)
				if !waitWithContext(ctx, delay) {
					return outcomeContextDone
				}
				return outcomeRetry
			}
			slog.Warn("retries exhausted on slot, rotating",
				"slot", slotIdx,
				"key", slot.keyLabel,
				"model", slot.llm.Name(),
			)
			return outcomeSlotExhausted
		}

		if resp != nil && isRetryableResponse(resp) {
			*lastErr = &rateLimitError{code: resp.ErrorCode, message: resp.ErrorMessage}
			if attempt < m.config.MaxRetries {
				delay := backoffDelay(attempt, m.config.BaseDelay, m.config.MaxDelay)
				slog.Warn("model returned retryable error code, retrying",
					"slot", slotIdx,
					"key", slot.keyLabel,
					"model", slot.llm.Name(),
					"attempt", attempt+1,
					"max_retries", m.config.MaxRetries,
					"delay", delay,
					"error_code", resp.ErrorCode,
				)
				if !waitWithContext(ctx, delay) {
					return outcomeContextDone
				}
				return outcomeRetry
			}
			slog.Warn("retries exhausted on slot, rotating",
				"slot", slotIdx,
				"key", slot.keyLabel,
				"model", slot.llm.Name(),
			)
			return outcomeSlotExhausted
		}

		if err != nil {
			yield(nil, err)
			return outcomeFatalError
		}

		if !yield(resp, nil) {
			return outcomeSuccess
		}
	}
	return outcomeSuccess
}

type rateLimitError struct {
	code    string
	message string
}

func (e *rateLimitError) Error() string {
	return "rate limited: " + e.code + " " + e.message
}

func isRetryableError(err error) bool {
	msg := err.Error()
	return strings.Contains(msg, "429") ||
		strings.Contains(msg, "Error 500") ||
		strings.Contains(msg, "Error 503") ||
		strings.Contains(msg, "RESOURCE_EXHAUSTED") ||
		strings.Contains(msg, "resource has been exhausted") ||
		strings.Contains(msg, "Resource has been exhausted") ||
		strings.Contains(msg, "INTERNAL") ||
		strings.Contains(msg, "UNAVAILABLE") ||
		strings.Contains(msg, "quota")
}

func isRetryableResponse(resp *model.LLMResponse) bool {
	if resp.ErrorCode == "" {
		return false
	}
	code := strings.ToUpper(resp.ErrorCode)
	return code == "429" || code == "500" || code == "503" ||
		strings.Contains(code, "RESOURCE_EXHAUSTED") ||
		strings.Contains(code, "INTERNAL") ||
		strings.Contains(code, "UNAVAILABLE") ||
		strings.Contains(strings.ToUpper(resp.ErrorMessage), "RESOURCE_EXHAUSTED") ||
		strings.Contains(strings.ToUpper(resp.ErrorMessage), "INTERNAL ERROR")
}

// backoffDelay computes delay = min(baseDelay * 2^attempt, maxDelay) with
// random jitter in [0.5*delay, delay] to avoid thundering herd.
func backoffDelay(attempt int, base, max time.Duration) time.Duration {
	delay := time.Duration(float64(base) * math.Pow(2, float64(attempt)))
	if delay > max {
		delay = max
	}
	jitter := 0.5 + rand.Float64()*0.5
	return time.Duration(float64(delay) * jitter)
}

func waitWithContext(ctx context.Context, d time.Duration) bool {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}
