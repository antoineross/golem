package screenshot

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"scraper/internal/platform/engineapi"

	"github.com/gofiber/fiber/v2/utils"
)

type playwrightArgs struct {
	URL             string `json:"url"`
	Output          string `json:"output"`
	Width           int    `json:"width"`
	Height          int    `json:"height"`
	FullPage        bool   `json:"fullPage"`
	Delay           int    `json:"delay"`
	ClickSelector   string `json:"clickSelector,omitempty"`
	WaitForSelector string `json:"waitForSelector,omitempty"`
	Timeout         int    `json:"timeout"`
}

type playwrightResult struct {
	Success bool   `json:"success"`
	Path    string `json:"path"`
	Width   int    `json:"width"`
	Height  int    `json:"height"`
	Format  string `json:"format"`
	Error   string `json:"error,omitempty"`
}

func (s *Service) takePlaywright(ctx context.Context, r Request) (Result, error) {
	start := time.Now()
	s.log.LogInfof("Taking Playwright screenshot of %s", r.Url)

	width := 1920
	height := 1080
	device := s.getString((*string)(r.Device), "desktop")
	switch device {
	case "mobile":
		width = 375
		height = 667
	case "tablet":
		width = 768
		height = 1024
		if s.getBool(r.IsLandscape, false) {
			width = 1024
			height = 768
		}
	case "custom":
		if s.getInt(r.Width, 0) > 0 {
			width = s.getInt(r.Width, 1920)
		}
		if s.getInt(r.Height, 0) > 0 {
			height = s.getInt(r.Height, 1080)
		}
	}

	dir := filepath.Join(s.cfg.DataDir, "screenshots")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return Result{}, fmt.Errorf("create screenshot directory: %w", err)
	}

	ext := strings.ToLower(s.getString((*string)(r.Format), "png"))
	name := time.Now().Format("20060102_150405") + "_" + utils.UUIDv4()[:8] + "_" + sanitize(r.Url) + "." + ext
	outPath := filepath.Join(dir, name)

	timeout := 30000
	if t := s.getInt(r.Timeout, 0); t > 0 {
		timeout = t * 1000
	}

	args := playwrightArgs{
		URL:             r.Url,
		Output:          outPath,
		Width:           width,
		Height:          height,
		FullPage:        s.getBool(r.FullPage, false),
		Delay:           s.getInt(r.Delay, 0),
		ClickSelector:   s.getString(r.ClickSelector, ""),
		WaitForSelector: s.getString(r.WaitForSelector, ""),
		Timeout:         timeout,
	}

	argsJSON, err := json.Marshal(args)
	if err != nil {
		return Result{}, fmt.Errorf("marshal playwright args: %w", err)
	}

	scriptPath := os.Getenv("PLAYWRIGHT_SCRIPT_PATH")
	if scriptPath == "" {
		scriptPath = "/app/scripts/playwright-screenshot.js"
	}

	cmdCtx, cancel := context.WithTimeout(ctx, time.Duration(timeout+10000)*time.Millisecond)
	defer cancel()

	cmd := exec.CommandContext(cmdCtx, "node", scriptPath, string(argsJSON))
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	output, err := cmd.Output()
	if err != nil {
		s.log.LogErrorf("Playwright screenshot failed: %v, stderr: %s", err, stderr.String())
		return Result{}, fmt.Errorf("playwright screenshot failed: %w (stderr: %s)", err, stderr.String())
	}

	var result playwrightResult
	if err := json.Unmarshal(output, &result); err != nil {
		return Result{}, fmt.Errorf("parse playwright result: %w", err)
	}

	if !result.Success {
		return Result{}, fmt.Errorf("playwright screenshot error: %s", result.Error)
	}

	fi, err := os.Stat(outPath)
	if err != nil {
		return Result{}, fmt.Errorf("screenshot file not found: %w", err)
	}
	fileSize := int(fi.Size())
	formatStr := ext
	load := int(time.Since(start).Milliseconds())

	meta := engineapi.ScreenshotMetadata{
		Width:    &width,
		Height:   &height,
		Format:   &formatStr,
		FileSize: &fileSize,
		LoadTime: &load,
	}

	publicURL := "/files/screenshots/" + name
	s.log.LogInfof("Playwright screenshot completed for %s: %s (%d bytes, %dms)", r.Url, publicURL, fileSize, load)

	if s.supabaseClient != nil && s.cfg.SupabaseBucket != "" {
		data, readErr := os.ReadFile(outPath)
		if readErr == nil {
			_, pubURL, saveErr := s.save(data, r)
			if saveErr == nil && pubURL != "" {
				return Result{Path: outPath, PublicURL: pubURL, Metadata: meta}, nil
			}
		}
	}

	return Result{Path: outPath, PublicURL: publicURL, Metadata: meta}, nil
}
