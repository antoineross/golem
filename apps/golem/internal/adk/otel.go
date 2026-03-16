package adk

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"go.opentelemetry.io/otel/exporters/stdout/stdouttrace"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"google.golang.org/adk/telemetry"
)

// OtelConfig controls OpenTelemetry setup.
type OtelConfig struct {
	// TraceFile is the path to write span JSON. Empty disables file export.
	TraceFile string
	// EnableConsole writes spans to stdout when true.
	EnableConsole bool
	// CaptureContent records full prompts/responses in spans. Default false
	// to avoid persisting sensitive scraped content or credentials.
	CaptureContent bool
}

// LoadOtelConfig reads OTel settings from environment.
func LoadOtelConfig() OtelConfig {
	return OtelConfig{
		TraceFile:      os.Getenv("GOLEM_TRACE_FILE"),
		EnableConsole:  envBool("GOLEM_TRACE_CONSOLE", false),
		CaptureContent: envBool("GOLEM_TRACE_CAPTURE_CONTENT", false),
	}
}

// SetupOtel initializes ADK's built-in OpenTelemetry integration with local
// span exporters. Returns a shutdown function that must be deferred.
func SetupOtel(ctx context.Context, cfg OtelConfig, logger *slog.Logger) (shutdown func(context.Context) error, err error) {
	var spanProcessors []sdktrace.SpanProcessor
	var traceFile *os.File

	if cfg.TraceFile != "" {
		f, err := os.Create(cfg.TraceFile)
		if err != nil {
			return nil, fmt.Errorf("create trace file %s: %w", cfg.TraceFile, err)
		}
		traceFile = f

		fileExporter, err := stdouttrace.New(stdouttrace.WithWriter(f), stdouttrace.WithPrettyPrint())
		if err != nil {
			f.Close()
			return nil, fmt.Errorf("create file span exporter: %w", err)
		}
		spanProcessors = append(spanProcessors, sdktrace.NewSimpleSpanProcessor(fileExporter))
		logger.Info("trace file exporter enabled", "path", cfg.TraceFile)
	}

	if cfg.EnableConsole {
		consoleExporter, err := stdouttrace.New(stdouttrace.WithPrettyPrint())
		if err != nil {
			if traceFile != nil {
				traceFile.Close()
			}
			return nil, fmt.Errorf("create console span exporter: %w", err)
		}
		spanProcessors = append(spanProcessors, sdktrace.NewSimpleSpanProcessor(consoleExporter))
		logger.Info("trace console exporter enabled")
	}

	if len(spanProcessors) == 0 {
		return func(context.Context) error { return nil }, nil
	}

	opts := []telemetry.Option{
		telemetry.WithGenAICaptureMessageContent(cfg.CaptureContent),
	}
	for _, sp := range spanProcessors {
		opts = append(opts, telemetry.WithSpanProcessors(sp))
	}

	providers, err := telemetry.New(ctx, opts...)
	if err != nil {
		if traceFile != nil {
			traceFile.Close()
		}
		return nil, fmt.Errorf("init ADK telemetry: %w", err)
	}
	providers.SetGlobalOtelProviders()
	logger.Info("ADK OpenTelemetry initialized")

	return func(ctx context.Context) error {
		shutdownErr := providers.Shutdown(ctx)
		if traceFile != nil {
			if closeErr := traceFile.Close(); shutdownErr == nil {
				shutdownErr = closeErr
			}
		}
		return shutdownErr
	}, nil
}
