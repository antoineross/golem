package adk

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strings"

	"google.golang.org/adk/model"
	"google.golang.org/adk/model/gemini"
	"google.golang.org/genai"
)

// NewModel creates a resilient model that rotates through API keys and falls
// back to lighter models on 429 errors. The slot order is:
//
//  1. Primary model + primary key
//  2. Primary model + backup key (if GOOGLE_API_KEY_BACKUP is set)
//  3. Fallback model + primary key
//  4. Fallback model + backup key (if GOOGLE_API_KEY_BACKUP is set)
//
// Each slot gets its own retry budget with exponential backoff before the
// next slot is tried.
func NewModel(ctx context.Context, logger *slog.Logger) (model.LLM, error) {
	cfg := LoadLLMConfig()

	primaryKey := cfg.APIKey
	backupKey := os.Getenv("GOOGLE_API_KEY_BACKUP")

	if primaryKey == "" && backupKey == "" {
		return nil, fmt.Errorf("GOOGLE_API_KEY or GEMINI_API_KEY is required")
	}

	// If primary is missing but backup exists, swap them
	if primaryKey == "" {
		primaryKey = backupKey
		backupKey = ""
	}

	type keyEntry struct {
		key   string
		label string
	}

	keys := []keyEntry{{key: primaryKey, label: "primary"}}
	if backupKey != "" && backupKey != primaryKey {
		keys = append(keys, keyEntry{key: backupKey, label: "backup"})
	}

	models := []string{cfg.DefaultModel, cfg.FallbackModel}
	var slots []modelSlot
	var initErrors []string

	for _, modelName := range models {
		if modelName == "" {
			continue
		}
		for _, k := range keys {
			clientCfg := &genai.ClientConfig{APIKey: k.key}
			llm, err := gemini.NewModel(ctx, modelName, clientCfg)
			if err != nil {
				initErrors = append(initErrors, fmt.Sprintf("%s/%s: %v", modelName, k.label, err))
				continue
			}
			slots = append(slots, modelSlot{llm: llm, keyLabel: k.label})
			logger.Info("model slot initialized",
				"model", modelName,
				"key", k.label,
				"slot", len(slots)-1,
			)
		}
	}

	if len(slots) == 0 {
		return nil, fmt.Errorf("all model slots failed to initialize: %s", strings.Join(initErrors, "; "))
	}

	retryCfg := cfg.RetryConfigFromEnv()
	resilient := NewResilientModel(slots, retryCfg)

	logger.Info("resilient model ready",
		"total_slots", len(slots),
		"max_retries_per_slot", retryCfg.MaxRetries,
		"base_delay", retryCfg.BaseDelay,
		"max_delay", retryCfg.MaxDelay,
		"has_backup_key", backupKey != "",
	)

	return resilient, nil
}
