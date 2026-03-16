package adk

import (
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
		return nil, nil, err
	}

	return r, sessionSvc, nil
}
