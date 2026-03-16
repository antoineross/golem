package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"google.golang.org/genai"

	golemAdk "golem/internal/adk"
)

type traceResult struct {
	TestName      string `json:"test_name"`
	Model         string `json:"model"`
	ThinkingLevel string `json:"thinking_level"`

	SystemInstruction string `json:"system_instruction"`
	UserPrompt        string `json:"user_prompt"`

	ElapsedMs      int64 `json:"elapsed_ms"`
	InputTokens    int32 `json:"input_tokens"`
	OutputTokens   int32 `json:"output_tokens"`
	ThoughtsTokens int32 `json:"thoughts_tokens"`
	TotalTokens    int32 `json:"total_tokens"`

	Parts          []partInfo `json:"parts"`
	ThoughtSummary string     `json:"thought_summary"`
	Answer         string     `json:"answer"`
}

type partInfo struct {
	Index        int    `json:"index"`
	Type         string `json:"type"`
	Thought      bool   `json:"thought,omitempty"`
	TextLen      int    `json:"text_len,omitempty"`
	Text         string `json:"text,omitempty"`
	ToolName     string `json:"tool_name,omitempty"`
	ToolArgs     any    `json:"tool_args,omitempty"`
	ToolResponse any    `json:"tool_response,omitempty"`
}

const systemInstruction = `You are a security auditor analyzing web applications for business-logic vulnerabilities. You reason carefully about hidden elements, state manipulation, and privilege escalation vectors before recommending tests.`

const userPrompt = `Analyze this HTML snippet from a shopping cart page and identify potential business-logic vulnerabilities:

<form action="/checkout" method="POST">
  <input type="hidden" name="item_id" value="1234">
  <input type="hidden" name="price" value="29.99">
  <input type="hidden" name="discount" value="0" style="display:none">
  <input type="hidden" name="role" value="customer" disabled>
  <!-- debug: admin_override=true -->
  <button type="submit">Purchase</button>
</form>

List each vulnerability, explain the risk, and suggest a specific test to confirm it.`

func main() {
	cfg := golemAdk.LoadLLMConfig()
	if cfg.APIKey == "" {
		log.Fatal("GOOGLE_API_KEY or GEMINI_API_KEY is required")
	}

	model := cfg.DefaultModel
	if model == "" {
		model = "gemini-3-flash-preview"
	}

	outDir := os.Getenv("OUTPUT_DIR")
	if outDir == "" {
		outDir = "tmp/tests/thinking"
	}
	if err := os.MkdirAll(outDir, 0755); err != nil {
		log.Fatalf("create output dir: %v", err)
	}

	configs := []struct {
		name  string
		level genai.ThinkingLevel
	}{
		{name: "medium", level: genai.ThinkingLevelMedium},
		{name: "low", level: genai.ThinkingLevelLow},
	}

	ctx := context.Background()
	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey:  cfg.APIKey,
		Backend: genai.BackendGeminiAPI,
	})
	if err != nil {
		log.Fatalf("create genai client: %v", err)
	}

	for _, tc := range configs {
		fmt.Printf("\n=== Test: %s (ThinkingLevel=%s) ===\n", tc.name, tc.level)

		genCfg := &genai.GenerateContentConfig{
			SystemInstruction: genai.NewContentFromText(systemInstruction, "user"),
			ThinkingConfig: &genai.ThinkingConfig{
				IncludeThoughts: true,
				ThinkingLevel:   tc.level,
			},
		}

		start := time.Now()
		resp, err := client.Models.GenerateContent(ctx, model, genai.Text(userPrompt), genCfg)
		elapsed := time.Since(start)

		if err != nil {
			log.Printf("[%s] API error: %v", tc.name, err)
			continue
		}

		result := traceResult{
			TestName:          tc.name,
			Model:             model,
			ThinkingLevel:     string(tc.level),
			SystemInstruction: systemInstruction,
			UserPrompt:        userPrompt,
			ElapsedMs:         elapsed.Milliseconds(),
		}

		if resp.UsageMetadata != nil {
			result.InputTokens = resp.UsageMetadata.PromptTokenCount
			result.OutputTokens = resp.UsageMetadata.CandidatesTokenCount
			result.ThoughtsTokens = resp.UsageMetadata.ThoughtsTokenCount
			result.TotalTokens = resp.UsageMetadata.TotalTokenCount
		}

		if len(resp.Candidates) > 0 && resp.Candidates[0].Content != nil {
			for i, part := range resp.Candidates[0].Content.Parts {
				pi := partInfo{
					Index: i,
				}

				if part.Thought {
					pi.Type = "thought"
					pi.Thought = true
					pi.TextLen = len(part.Text)
					pi.Text = part.Text
					result.ThoughtSummary += part.Text
				} else if part.FunctionCall != nil {
					pi.Type = "function_call"
					pi.ToolName = part.FunctionCall.Name
					pi.ToolArgs = part.FunctionCall.Args
				} else if part.FunctionResponse != nil {
					pi.Type = "function_response"
					pi.ToolName = part.FunctionResponse.Name
					pi.ToolResponse = part.FunctionResponse.Response
				} else if part.Text != "" {
					pi.Type = "text"
					pi.TextLen = len(part.Text)
					pi.Text = part.Text
					result.Answer += part.Text
				}

				result.Parts = append(result.Parts, pi)
			}
		}

		jsonBytes, err := json.MarshalIndent(result, "", "  ")
		if err != nil {
			log.Printf("[%s] failed to marshal trace result: %v", tc.name, err)
			continue
		}
		outPath := filepath.Join(outDir, fmt.Sprintf("%s_trace.json", tc.name))
		if err := os.WriteFile(outPath, jsonBytes, 0644); err != nil {
			log.Printf("[%s] write error: %v", tc.name, err)
		}

		fmt.Printf("  Elapsed: %dms\n", elapsed.Milliseconds())
		fmt.Printf("  Input tokens: %d\n", result.InputTokens)
		fmt.Printf("  Output tokens: %d\n", result.OutputTokens)
		fmt.Printf("  Thoughts tokens: %d\n", result.ThoughtsTokens)
		fmt.Printf("  Total tokens: %d\n", result.TotalTokens)
		fmt.Printf("  Thought summary length: %d chars\n", len(result.ThoughtSummary))
		fmt.Printf("  Answer length: %d chars\n", len(result.Answer))
		fmt.Printf("  Parts: %d (types: ", len(result.Parts))
		for i, p := range result.Parts {
			if i > 0 {
				fmt.Print(", ")
			}
			fmt.Print(p.Type)
		}
		fmt.Println(")")
		fmt.Printf("  Saved to: %s\n", outPath)
	}

	fmt.Println("\nDone. Verify thought_summary is non-empty in the trace files.")
}
