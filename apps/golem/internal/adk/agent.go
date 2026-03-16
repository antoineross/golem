package adk

import (
	"golem/internal/adk/prompts"

	"google.golang.org/adk/agent"
	"google.golang.org/adk/agent/llmagent"
	"google.golang.org/adk/model"
	"google.golang.org/adk/tool"
)

// NewAuditor creates the golem_auditor agent with security-focused system prompt.
func NewAuditor(llm model.LLM, tools []tool.Tool) (agent.Agent, error) {
	return llmagent.New(llmagent.Config{
		Name:        "golem_auditor",
		Description: "Autonomous security auditor that finds business-logic vulnerabilities in web applications using visual reasoning and systematic testing",
		Model:       llm,
		Instruction: prompts.Compose(),
		Tools:       tools,
	})
}
