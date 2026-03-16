package adk

import (
	"fmt"

	"google.golang.org/adk/agent"
	"google.golang.org/adk/runner"
	"google.golang.org/adk/session"
)

func NewRunner(appName string, rootAgent agent.Agent) (*runner.Runner, session.Service, error) {
	sessionSvc := session.InMemoryService()

	r, err := runner.New(runner.Config{
		AppName:        appName,
		Agent:          rootAgent,
		SessionService: sessionSvc,
	})
	if err != nil {
		return nil, nil, fmt.Errorf("create runner: %w", err)
	}

	return r, sessionSvc, nil
}
