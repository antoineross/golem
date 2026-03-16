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

func NewRunner(appName string, rootAgent agent.Agent, opts ...RunnerConfig) (*runner.Runner, session.Service, error) {
	sessionSvc := session.InMemoryService()

	cfg := runner.Config{
		AppName:        appName,
		Agent:          rootAgent,
		SessionService: sessionSvc,
	}

	if len(opts) > 0 && opts[0].ArtifactService != nil {
		cfg.ArtifactService = opts[0].ArtifactService
	}

	r, err := runner.New(cfg)
	if err != nil {
		return nil, nil, fmt.Errorf("create runner: %w", err)
	}

	return r, sessionSvc, nil
}
