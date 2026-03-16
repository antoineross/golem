package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	slog.Info("golem agent starting")

	// Placeholder: ADK wiring goes here in v0.1.2+
	fmt.Println("golem: ready (no agent wired yet)")

	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-shutdown:
		slog.Info("received signal, shutting down", "signal", sig)
	case <-ctx.Done():
	}

	slog.Info("golem agent stopped")
}
