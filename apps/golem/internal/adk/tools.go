package adk

import (
	"fmt"

	"google.golang.org/adk/tool"
	"google.golang.org/adk/tool/functiontool"
)

type echoArgs struct {
	Message string `json:"message" jsonschema:"The message to echo back"`
}

type echoResult struct {
	Reply string `json:"reply"`
}

func echo(_ tool.Context, args echoArgs) (echoResult, error) {
	return echoResult{Reply: fmt.Sprintf("echo: %s", args.Message)}, nil
}

func NewEchoTool() (tool.Tool, error) {
	return functiontool.New(
		functiontool.Config{
			Name:        "echo",
			Description: "Echoes back a message. Use this to test that tool calling works.",
		},
		echo,
	)
}
