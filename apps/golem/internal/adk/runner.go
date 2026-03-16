package adk

import (
	"fmt"

	"google.golang.org/adk/agent"
	"google.golang.org/adk/artifact"
	"google.golang.org/adk/runner"
	"google.golang.org/adk/session"
)

// RunnerConfig holds optional services for the runner.
type RunnerConfig struct {
	ArtifactService artifact.Service
}

// NewRunner creates a runner with session and optional artifact services.
// Pass nil for rcfg to use defaults.
func NewRunner(appName string, rootAgent agent.Agent, rcfg *RunnerConfig) (*runner.Runner, session.Service, error) {
	sessionSvc := session.InMemoryService()

	cfg := runner.Config{
		AppName:        appName,
		Agent:          rootAgent,
		SessionService: sessionSvc,
	}

	if rcfg != nil && rcfg.ArtifactService != nil {
		cfg.ArtifactService = rcfg.ArtifactService
	}

	r, err := runner.New(cfg)
	if err != nil {
		return nil, nil, fmt.Errorf("create runner: %w", err)
	}

	return r, sessionSvc, nil
}
