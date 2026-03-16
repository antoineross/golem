package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type agentState struct {
	mu        sync.Mutex
	status    string
	traceFile string
	err       string
	cmd       *exec.Cmd
	cancel    context.CancelFunc
}

var state = &agentState{status: "idle"}

func (s *agentState) get() map[string]string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return map[string]string{
		"status":     s.status,
		"trace_file": s.traceFile,
		"error":      s.err,
	}
}

func (s *agentState) set(status, traceFile, errMsg string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.status = status
	if traceFile != "" {
		s.traceFile = traceFile
	}
	if len(errMsg) > maxErrorLength {
		errMsg = errMsg[:maxErrorLength] + "... [truncated]"
	}
	s.err = errMsg
}

func (s *agentState) stop() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.status != "running" {
		return false
	}
	if s.cancel != nil {
		s.cancel()
	}
	s.status = "error"
	s.err = "agent stopped by user"
	s.cmd = nil
	s.cancel = nil
	return true
}

type runRequest struct {
	Prompt    string `json:"prompt"`
	Harness   string `json:"harness"`
	TraceFile string `json:"trace_file"`
	APIKey    string `json:"api_key,omitempty"`
	Model     string `json:"model,omitempty"`
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(state.get())
	})

	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	mux.HandleFunc("POST /api/stop", func(w http.ResponseWriter, r *http.Request) {
		if state.stop() {
			slog.Info("agent stopped by user request")
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{"status": "stopped"})
		} else {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{"error": "no agent running"})
		}
	})

	mux.HandleFunc("POST /api/run", func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1MB limit

		var req runRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.Header().Set("Content-Type", "application/json")
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}

		if req.Prompt == "" {
			req.Prompt = "Echo 'hello' to verify tool calling works, then list the available payload categories."
		}

		traceDir := os.Getenv("GOLEM_TRACE_DIR")
		if traceDir == "" {
			traceDir = "/data/tmp/tests"
		}
		harness := req.Harness
		if harness == "" {
			harness = "agent"
		}

		if strings.ContainsAny(harness, "/\\..") || strings.Contains(harness, "..") {
			w.Header().Set("Content-Type", "application/json")
			http.Error(w, `{"error":"invalid harness name"}`, http.StatusBadRequest)
			return
		}

		outDir := filepath.Join(traceDir, harness)
		if err := os.MkdirAll(outDir, 0o755); err != nil {
			slog.Error("failed to create trace output directory", "dir", outDir, "error", err)
			w.Header().Set("Content-Type", "application/json")
			http.Error(w, `{"error":"cannot create output directory"}`, http.StatusInternalServerError)
			return
		}

		traceFile := req.TraceFile
		if traceFile == "" {
			ts := time.Now().UTC().Format("20060102_150405")
			traceFile = filepath.Join(outDir, fmt.Sprintf("%s_%s_otel_spans.json", harness, ts))
		} else {
			absTrace := filepath.Clean(traceFile)
			absDir := filepath.Clean(traceDir)
			if !strings.HasPrefix(absTrace, absDir+string(filepath.Separator)) {
				w.Header().Set("Content-Type", "application/json")
				http.Error(w, `{"error":"trace_file must be under trace directory"}`, http.StatusBadRequest)
				return
			}
			traceFile = absTrace
		}

		cliPath := os.Getenv("GOLEM_CLI_PATH")
		if cliPath == "" {
			cliPath = "/app/tmp/golem"
		}

		ctx, cancel := context.WithCancel(context.Background())
		cmd := exec.CommandContext(ctx, cliPath, req.Prompt)
		cmd.Dir = "/app"
		cmd.Env = append(os.Environ(),
			"GOLEM_TRACE_FILE="+traceFile,
			"GOLEM_TRACE_CAPTURE_CONTENT=true",
		)
		if req.APIKey != "" {
			cmd.Env = append(cmd.Env, "GOOGLE_API_KEY="+req.APIKey)
		}
		if req.Model != "" {
			cmd.Env = append(cmd.Env, "DEFAULT_LLM_MODEL="+req.Model)
		}

		// Atomic check-and-set to prevent concurrent runs
		state.mu.Lock()
		if state.status == "running" {
			state.mu.Unlock()
			cancel()
			w.Header().Set("Content-Type", "application/json")
			http.Error(w, `{"error":"agent already running"}`, http.StatusConflict)
			return
		}
		state.status = "running"
		state.traceFile = traceFile
		state.err = ""
		state.cmd = cmd
		state.cancel = cancel
		state.mu.Unlock()

		go func() {
			defer func() {
				if r := recover(); r != nil {
					slog.Error("agent goroutine panicked", "panic", r)
					state.set("error", "", fmt.Sprintf("internal panic: %v", r))
				}
				state.mu.Lock()
				state.cmd = nil
				state.cancel = nil
				state.mu.Unlock()
			}()

			hasCustomKey := req.APIKey != ""
			slog.Info("starting agent run", "prompt", req.Prompt, "trace_file", traceFile, "harness", harness, "custom_key", hasCustomKey)

			var outputBuf cappedBuffer
			cmd.Stdout = io.MultiWriter(os.Stdout, &outputBuf)
			cmd.Stderr = io.MultiWriter(os.Stderr, &outputBuf)

			if err := cmd.Run(); err != nil {
				if ctx.Err() != nil {
					slog.Info("agent run cancelled", "trace_file", traceFile)
					return
				}
				errMsg := extractAgentError(outputBuf.String(), err)
				slog.Error("agent run failed", "error", errMsg)
				state.set("error", "", errMsg)
				return
			}

			slog.Info("agent run complete", "trace_file", traceFile)
			state.set("complete", "", "")
		}()

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status":     "running",
			"trace_file": traceFile,
			"harness":    harness,
		})
	})

	addr := os.Getenv("HTTP_ADDR")
	if addr == "" {
		addr = ":8080"
	}

	slog.Info("golem server starting", "addr", addr)
	if err := http.ListenAndServe(addr, corsMiddleware(mux)); err != nil {
		slog.Error("server failed", "error", err)
		os.Exit(1)
	}
}

const maxOutputCapture = 64 * 1024 // 64KB

type cappedBuffer struct {
	buf bytes.Buffer
}

func (c *cappedBuffer) Write(p []byte) (int, error) {
	remaining := maxOutputCapture - c.buf.Len()
	if remaining <= 0 {
		return len(p), nil
	}
	if len(p) > remaining {
		p = p[:remaining]
	}
	return c.buf.Write(p)
}

func (c *cappedBuffer) String() string {
	return c.buf.String()
}

const maxErrorLength = 512

func extractAgentError(output string, exitErr error) string {
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var entry struct {
			Level string `json:"level"`
			Msg   string `json:"msg"`
			Error string `json:"error"`
		}
		if json.Unmarshal([]byte(line), &entry) == nil && entry.Level == "ERROR" && entry.Error != "" {
			if len(entry.Error) > maxErrorLength {
				return entry.Error[:maxErrorLength] + "... [truncated]"
			}
			return entry.Error
		}
	}
	return exitErr.Error()
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func init() {
	// Ensure SUPACRAWL_API_URL uses internal docker network if not set
	if os.Getenv("SUPACRAWL_API_URL") == "" {
		os.Setenv("SUPACRAWL_API_URL", "http://scraper:8081")
	}
	// Strip any flags from GOOGLE_API_KEY that might have whitespace
	if key := os.Getenv("GOOGLE_API_KEY"); key != "" {
		os.Setenv("GOOGLE_API_KEY", strings.TrimSpace(key))
	}
}
