package adk

import (
	"context"
	"fmt"
	"io"
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
}

// LoadOtelConfig reads OTel settings from environment.
func LoadOtelConfig() OtelConfig {
	return OtelConfig{
		TraceFile:     os.Getenv("GOLEM_TRACE_FILE"),
		EnableConsole: envBool("GOLEM_TRACE_CONSOLE", false),
	}
}

// SetupOtel initializes ADK's built-in OpenTelemetry integration with local
// span exporters. Returns a shutdown function that must be deferred.
func SetupOtel(ctx context.Context, cfg OtelConfig, logger *slog.Logger) (shutdown func(context.Context) error, err error) {
	var spanProcessors []sdktrace.SpanProcessor

	if cfg.TraceFile != "" {
		f, err := os.Create(cfg.TraceFile)
		if err != nil {
			return nil, fmt.Errorf("create trace file %s: %w", cfg.TraceFile, err)
		}
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
			return nil, fmt.Errorf("create console span exporter: %w", err)
		}
		spanProcessors = append(spanProcessors, sdktrace.NewSimpleSpanProcessor(consoleExporter))
		logger.Info("trace console exporter enabled")
	}

	if len(spanProcessors) == 0 {
		return func(context.Context) error { return nil }, nil
	}

	opts := []telemetry.Option{
		telemetry.WithGenAICaptureMessageContent(true),
	}
	for _, sp := range spanProcessors {
		opts = append(opts, telemetry.WithSpanProcessors(sp))
	}

	providers, err := telemetry.New(ctx, opts...)
	if err != nil {
		return nil, fmt.Errorf("init ADK telemetry: %w", err)
	}
	providers.SetGlobalOtelProviders()
	logger.Info("ADK OpenTelemetry initialized")

	return func(ctx context.Context) error {
		err := providers.Shutdown(ctx)
		if cfg.TraceFile != "" {
			if closer, ok := getCloser(spanProcessors); ok {
				closer.Close()
			}
		}
		return err
	}, nil
}

func getCloser(processors []sdktrace.SpanProcessor) (io.Closer, bool) {
	return nil, false
}
