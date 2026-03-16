package adk

import (
	"golem/internal/adk/prompts"

	"google.golang.org/adk/agent"
	"google.golang.org/adk/agent/llmagent"
	"google.golang.org/adk/model"
	"google.golang.org/adk/tool"
)

// instructionProvider builds a dynamic system prompt by reading session state
// and injecting context (target URL, visited pages, findings count) into the
// composed prompt sections.
func instructionProvider(ctx agent.ReadonlyContext) (string, error) {
	state := ctx.ReadonlyState()

	sc := prompts.StateContext{
		TargetURL:     stateGetString(state, StateKeyTargetURL),
		CurrentStep:   stateGetString(state, StateKeyCurrentStep),
		VisitedURLs:   stateGetStringSlice(state, StateKeyVisitedURLs),
		FindingsCount: stateGetInt(state, StateKeyFindings),
	}

	return prompts.ComposeWithState(sc), nil
}

// NewAuditor creates the golem_auditor agent with a dynamic system prompt
// that adapts based on session state.
func NewAuditor(llm model.LLM, tools []tool.Tool, opts ...AuditorOption) (agent.Agent, error) {
	cfg := auditorConfig{}
	for _, o := range opts {
		o(&cfg)
	}

	agentCfg := llmagent.Config{
		Name:                "golem_auditor",
		Description:         "Autonomous security auditor that finds business-logic vulnerabilities in web applications using visual reasoning and systematic testing",
		Model:               llm,
		InstructionProvider: instructionProvider,
		Tools:               tools,
	}

	if cfg.beforeAgent != nil {
		agentCfg.BeforeAgentCallbacks = []agent.BeforeAgentCallback{cfg.beforeAgent}
	}
	if cfg.afterAgent != nil {
		agentCfg.AfterAgentCallbacks = []agent.AfterAgentCallback{cfg.afterAgent}
	}
	if cfg.beforeModel != nil {
		agentCfg.BeforeModelCallbacks = []llmagent.BeforeModelCallback{cfg.beforeModel}
	}
	if cfg.afterModel != nil {
		agentCfg.AfterModelCallbacks = []llmagent.AfterModelCallback{cfg.afterModel}
	}

	return llmagent.New(agentCfg)
}

type auditorConfig struct {
	beforeAgent agent.BeforeAgentCallback
	afterAgent  agent.AfterAgentCallback
	beforeModel llmagent.BeforeModelCallback
	afterModel  llmagent.AfterModelCallback
}

// AuditorOption configures optional behavior on the auditor agent.
type AuditorOption func(*auditorConfig)

// WithBeforeAgent registers a BeforeAgentCallback.
func WithBeforeAgent(cb agent.BeforeAgentCallback) AuditorOption {
	return func(c *auditorConfig) { c.beforeAgent = cb }
}

// WithAfterAgent registers an AfterAgentCallback.
func WithAfterAgent(cb agent.AfterAgentCallback) AuditorOption {
	return func(c *auditorConfig) { c.afterAgent = cb }
}

// WithBeforeModel registers a BeforeModelCallback.
func WithBeforeModel(cb llmagent.BeforeModelCallback) AuditorOption {
	return func(c *auditorConfig) { c.beforeModel = cb }
}

// WithAfterModel registers an AfterModelCallback.
func WithAfterModel(cb llmagent.AfterModelCallback) AuditorOption {
	return func(c *auditorConfig) { c.afterModel = cb }
}
