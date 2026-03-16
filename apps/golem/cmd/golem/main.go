package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"google.golang.org/adk/agent"
	"google.golang.org/adk/session"
	"google.golang.org/adk/tool"
	"google.golang.org/genai"

	golemAdk "golem/internal/adk"
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

	echoTool, err := golemAdk.NewEchoTool()
	if err != nil {
		slog.Error("failed to create echo tool", "error", err)
		os.Exit(1)
	}

	auditor, err := golemAdk.NewAuditor(llm, []tool.Tool{echoTool})
	if err != nil {
		slog.Error("failed to create auditor agent", "error", err)
		os.Exit(1)
	}

	r, sessionSvc, err := golemAdk.NewRunner("golem", auditor)
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

	prompt := "Use the echo tool to say 'hello from golem'. Then confirm it worked."
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

		if event.Content != nil {
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
	}

	slog.Info("agent run complete")
}
