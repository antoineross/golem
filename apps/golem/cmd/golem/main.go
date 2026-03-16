package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"google.golang.org/adk/agent"
	"google.golang.org/adk/artifact"
	"google.golang.org/adk/session"
	"google.golang.org/adk/tool"
	"google.golang.org/genai"

	golemAdk "golem/internal/adk"
	"golem/internal/supacrawl"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	ctx := context.Background()

	llm, err := golemAdk.NewModel(ctx, logger)
	if err != nil {
		slog.Error("failed to initialize model", "error", err)
		os.Exit(1)
	}

	tools, hasBrowse, err := buildTools(ctx)
	if err != nil {
		slog.Error("failed to create tools", "error", err)
		os.Exit(1)
	}

	callbacks := golemAdk.NewCallbacks(logger)

	auditor, err := golemAdk.NewAuditor(llm, tools,
		golemAdk.WithBeforeAgent(callbacks.BeforeAgent),
		golemAdk.WithAfterAgent(callbacks.AfterAgent),
		golemAdk.WithBeforeModel(callbacks.BeforeModel),
		golemAdk.WithAfterModel(callbacks.AfterModel),
	)
	if err != nil {
		slog.Error("failed to create auditor agent", "error", err)
		os.Exit(1)
	}

	artifactSvc := artifact.InMemoryService()

	r, sessionSvc, err := golemAdk.NewRunner("golem", auditor, &golemAdk.RunnerConfig{
		ArtifactService: artifactSvc,
	})
	if err != nil {
		slog.Error("failed to create runner", "error", err)
		os.Exit(1)
	}

	resp, err := sessionSvc.Create(ctx, &session.CreateRequest{
		AppName: "golem",
		UserID:  "user1",
	})
	if err != nil {
		slog.Error("failed to create session", "error", err)
		os.Exit(1)
	}

	prompt := defaultPrompt(hasBrowse)
	if len(os.Args) > 1 {
		prompt = os.Args[1]
	}

	slog.Info("starting agent run", "prompt", prompt)

	msg := genai.NewContentFromText(prompt, genai.RoleUser)
	for event, err := range r.Run(ctx, resp.Session.UserID(), resp.Session.ID(), msg, agent.RunConfig{}) {
		if err != nil {
			slog.Error("agent error", "error", err)
			break
		}

		if event.Content == nil {
			continue
		}

		for _, part := range event.Content.Parts {
			if part.FunctionCall != nil {
				slog.Info("tool call",
					"tool", part.FunctionCall.Name,
					"args", part.FunctionCall.Args,
				)
			}
			if part.FunctionResponse != nil {
				slog.Info("tool response",
					"tool", part.FunctionResponse.Name,
					"result", part.FunctionResponse.Response,
				)
			}
			if part.Text != "" {
				if event.IsFinalResponse() {
					fmt.Println("\n--- AGENT RESPONSE ---")
					fmt.Println(part.Text)
					fmt.Println("--- END ---")
				} else {
					slog.Info("agent thinking", "text", part.Text)
				}
			}
		}
	}

	slog.Info("agent run complete")
}

func defaultPrompt(hasBrowse bool) string {
	if hasBrowse {
		return "Browse https://example.com and describe what you see."
	}
	return "Echo 'hello' to verify tool calling works, then list the available payload categories."
}

// buildTools creates the agent tool set and reports whether browse-capable tools are available.
func buildTools(ctx context.Context) ([]tool.Tool, bool, error) {
	echoTool, err := golemAdk.NewEchoTool()
	if err != nil {
		return nil, false, fmt.Errorf("create echo tool: %w", err)
	}

	payloadTool, err := golemAdk.NewPayloadTool()
	if err != nil {
		return nil, false, fmt.Errorf("create payload tool: %w", err)
	}

	tools := []tool.Tool{echoTool, payloadTool}

	client, err := supacrawl.NewClient()
	if err != nil {
		slog.Warn("supacrawl not configured, running with echo and payload tools only", "error", err)
		return tools, false, nil
	}

	if err := client.Health(ctx); err != nil {
		slog.Warn("supacrawl not reachable, running with echo and payload tools only", "error", err)
		return tools, false, nil
	}

	slog.Info("supacrawl connected")

	supacrawlTools, err := golemAdk.NewSupacrawlTools(client)
	if err != nil {
		return nil, false, fmt.Errorf("create supacrawl tools: %w", err)
	}

	tools = append(tools, supacrawlTools...)
	return tools, true, nil
}
