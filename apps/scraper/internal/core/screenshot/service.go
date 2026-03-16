package screenshot

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"scraper/internal/browser"
	"scraper/internal/config"
	"scraper/internal/core/job"
	"scraper/internal/logger"
	"scraper/internal/platform/engineapi"
	tasks "scraper/internal/platform/tasks"

	"github.com/antoineross/supabase-go"
	"github.com/chromedp/chromedp"
	"github.com/gofiber/fiber/v2/utils"
	"github.com/hibiken/asynq"
	storage_go "github.com/supabase-community/storage-go"
)

type Service struct {
	log    *logger.Logger
	cfg    config.Config
	jobs   *job.JobService
	pool   *browser.Pool
	engine string

	supabaseClient *supabase.Client
}

// Use the generated OpenAPI type instead of custom struct
type Request = engineapi.ScreenshotCreateRequest

type Payload struct {
	JobID   string  `json:"job_id"`
	UserID  string  `json:"user_id,omitempty"`
	Request Request `json:"request"`
}

const TaskTypeScreenshot = "screenshot:task"

func New(cfg config.Config, jobs *job.JobService, pool *browser.Pool) (*Service, error) {
	engine := os.Getenv("SCREENSHOT_ENGINE")
	if engine == "" {
		engine = "playwright"
	}
	s := &Service{log: logger.New("ScreenshotService"), cfg: cfg, jobs: jobs, pool: pool, engine: engine}
	s.log.LogInfof("Screenshot engine: %s", engine)

	if cfg.SupabaseURL != "" && cfg.SupabaseServiceKey != "" {
		client, err := supabase.NewClient(cfg.SupabaseURL, cfg.SupabaseServiceKey, nil)
		if err != nil {
			s.log.LogWarnf("failed to initialize Supabase client: %v", err)
		} else {
			s.supabaseClient = client
		}
	} else {
		s.log.LogInfof("Supabase not configured, screenshots will use local storage at %s/screenshots", cfg.DataDir)
	}
	return s, nil
}

func (s *Service) Enqueue(ctx context.Context, t *tasks.Client, req Request) (string, error) {
	jobID := utils.UUIDv4()
	payload, _ := json.Marshal(Payload{JobID: jobID, Request: req})
	if err := s.jobs.InitPending(ctx, jobID, job.TypeScreenshot, req.Url); err != nil {
		return "", err
	}
	task := asynq.NewTask(TaskTypeScreenshot, payload)
	if err := t.Enqueue(task, "default", s.cfg.TaskMaxRetries); err != nil {
		return "", err
	}
	return jobID, nil
}

func (s *Service) HandleTask(ctx context.Context, task *asynq.Task) error {
	var p Payload
	if err := json.Unmarshal(task.Payload(), &p); err != nil {
		return err
	}
	if err := s.jobs.SetProcessing(ctx, p.JobID, job.TypeScreenshot); err != nil {
		return err
	}
	// Force async save regardless of Stream setting for background tasks
	req := p.Request
	req.Stream = &[]bool{false}[0] // Create pointer to false
	res, err := s.take(ctx, req)
	if err != nil {
		return s.jobs.Complete(ctx, p.JobID, job.TypeScreenshot, job.StatusFailed, nil)
	}
	jr := job.ScreenshotResult{URL: p.Request.Url, Path: res.Path, PublicURL: res.PublicURL, Metadata: res.Metadata}
	return s.jobs.Complete(ctx, p.JobID, job.TypeScreenshot, job.StatusCompleted, jr)
}

type Result struct {
	Path      string
	PublicURL string
	Metadata  engineapi.ScreenshotMetadata
}

func (s *Service) take(ctx context.Context, r Request) (Result, error) {
	if s.engine == "playwright" {
		return s.takePlaywright(ctx, r)
	}
	return s.takeChromedp(ctx, r)
}

func (s *Service) takeChromedp(ctx context.Context, r Request) (Result, error) {
	start := time.Now()
	s.log.LogInfof("Taking chromedp screenshot of %s", r.Url)

	// Create browser context from pool
	browserCtx, cancel := s.pool.NewContext()
	defer cancel()

	// Set timeout (default 30s)
	timeout := 30 * time.Second
	timeoutSeconds := s.getInt(r.Timeout, 0)
	if timeoutSeconds > 0 {
		timeout = time.Duration(timeoutSeconds) * time.Second
	}
	timeoutCtx, timeoutCancel := context.WithTimeout(browserCtx, timeout)
	defer timeoutCancel()

	// Determine viewport size based on device
	width := 1920
	height := 1080
	device := s.getString((*string)(r.Device), "desktop")
	switch device {
	case "mobile":
		width = 375
		height = 667
	case "tablet":
		if s.getBool(r.IsLandscape, false) {
			width = 1024
			height = 768
		} else {
			width = 768
			height = 1024
		}
	case "custom":
		if s.getInt(r.Width, 0) > 0 {
			width = s.getInt(r.Width, 1920)
		}
		if s.getInt(r.Height, 0) > 0 {
			height = s.getInt(r.Height, 1080)
		}
	}

	// Set viewport size
	err := chromedp.Run(timeoutCtx,
		chromedp.EmulateViewport(int64(width), int64(height)),
	)
	if err != nil {
		s.log.LogErrorf("Failed to set viewport: %v", err)
		return Result{}, fmt.Errorf("viewport setup failed: %w", err)
	}

	// Navigate to URL
	s.log.LogDebugf("Navigating to URL: %s", r.Url)
	err = chromedp.Run(timeoutCtx,
		chromedp.Navigate(r.Url),
		chromedp.WaitReady("body", chromedp.ByQuery),
	)
	if err != nil {
		s.log.LogErrorf("Failed to navigate to %s: %v", r.Url, err)
		if strings.Contains(err.Error(), "timeout") || strings.Contains(err.Error(), "deadline exceeded") {
			return Result{}, fmt.Errorf("page load timeout: %w", err)
		}
		return Result{}, fmt.Errorf("navigation failed: %w", err)
	}

	// Wait for content to load
	delay := s.getInt(r.Delay, 0)
	if delay > 0 {
		s.log.LogDebugf("Additional delay: %d seconds", delay)
		time.Sleep(time.Duration(delay) * time.Second)
	} else {
		// Default wait for dynamic content
		time.Sleep(2 * time.Second)
	}

	// Wait for specific selector if requested
	waitSelector := s.getString(r.WaitForSelector, "")
	if waitSelector != "" {
		s.log.LogDebugf("Waiting for selector: %s", waitSelector)
		_ = chromedp.Run(timeoutCtx, chromedp.WaitVisible(waitSelector, chromedp.ByQuery))
		// Ignore errors - we'll take whatever content we got
	}

	// Click element if requested
	clickSelector := s.getString(r.ClickSelector, "")
	if clickSelector != "" {
		s.log.LogDebugf("Clicking selector: %s", clickSelector)
		_ = chromedp.Run(timeoutCtx, chromedp.Click(clickSelector, chromedp.ByQuery))
		// Wait a moment after clicking
		time.Sleep(1 * time.Second)
	}

	// Hide elements if requested
	hideSelectors := s.getStringSlice(r.HideSelectors, nil)
	if len(hideSelectors) > 0 {
		for _, selector := range hideSelectors {
			s.log.LogDebugf("Hiding selector: %s", selector)
			_ = chromedp.Run(timeoutCtx, chromedp.Evaluate(fmt.Sprintf(`
				document.querySelectorAll('%s').forEach(el => el.style.display = 'none')
			`, selector), nil))
		}
	}

	// Take screenshot
	var buf []byte
	format := s.getString((*string)(r.Format), "png")
	quality := s.getInt(r.Quality, 85)
	fullPage := s.getBool(r.FullPage, false)

	s.log.LogDebugf("Taking screenshot with format %s, fullpage: %v", format, fullPage)
	screenshotStart := time.Now()

	// Determine screenshot options based on format
	var screenshotAction chromedp.Action
	switch strings.ToLower(format) {
	case "jpeg", "jpg":
		if fullPage {
			screenshotAction = chromedp.FullScreenshot(&buf, quality)
		} else {
			screenshotAction = chromedp.CaptureScreenshot(&buf)
		}
	default:
		if fullPage {
			screenshotAction = chromedp.FullScreenshot(&buf, 100)
		} else {
			screenshotAction = chromedp.CaptureScreenshot(&buf)
		}
	}

	err = chromedp.Run(timeoutCtx, screenshotAction)
	if err != nil {
		s.log.LogErrorf("Failed to capture screenshot: %v", err)
		if strings.Contains(err.Error(), "timeout") || strings.Contains(err.Error(), "deadline exceeded") {
			return Result{}, fmt.Errorf("screenshot capture timeout: %w", err)
		}
		return Result{}, fmt.Errorf("screenshot capture failed: %w", err)
	}

	// Validate screenshot buffer
	if len(buf) == 0 {
		s.log.LogError("Screenshot buffer is empty", nil)
		return Result{}, fmt.Errorf("screenshot capture resulted in empty image")
	}

	// Check for reasonable file size limits (warn if over 10MB)
	fileSize := len(buf)
	if fileSize > 10*1024*1024 {
		s.log.LogWarnf("Large screenshot file size: %d bytes for URL %s", fileSize, r.Url)
	}

	formatStr := strings.ToLower(format)
	load := int(time.Since(screenshotStart).Milliseconds())

	meta := engineapi.ScreenshotMetadata{
		Width:    &width,
		Height:   &height,
		Format:   &formatStr,
		FileSize: &fileSize,
		LoadTime: &load,
	}

	s.log.LogDebugf("Screenshot captured: %dx%d, %s, %d bytes, %dms", width, height, formatStr, fileSize, load)

	path, public, err := s.save(buf, r)
	if err != nil {
		s.log.LogErrorf("Failed to save screenshot: %v", err)
		return Result{}, fmt.Errorf("screenshot save failed: %w", err)
	}

	s.log.LogInfof("Screenshot completed successfully for %s: %s (took %v)", r.Url, public, time.Since(start))
	return Result{Path: path, PublicURL: public, Metadata: meta}, nil
}

// Helper methods for safely dereferencing pointers
func (s *Service) getBool(ptr *bool, def bool) bool {
	if ptr == nil {
		return def
	}
	return *ptr
}

func (s *Service) getInt(ptr *int, def int) int {
	if ptr == nil {
		return def
	}
	return *ptr
}

func (s *Service) getString(ptr *string, def string) string {
	if ptr == nil {
		return def
	}
	return *ptr
}

func (s *Service) getFloat32(ptr *float32, def float32) float32 {
	if ptr == nil {
		return def
	}
	return *ptr
}

func (s *Service) getStringSlice(ptr *[]string, def []string) []string {
	if ptr == nil {
		return def
	}
	return *ptr
}

func (s *Service) getStringMap(ptr *map[string]string, def map[string]string) map[string]string {
	if ptr == nil {
		return def
	}
	return *ptr
}

func (s *Service) getCookies(ptr *[]map[string]interface{}, def []map[string]interface{}) []map[string]interface{} {
	if ptr == nil {
		return def
	}
	return *ptr
}

func (s *Service) save(data []byte, r Request) (string, string, error) {
	// If supabase configured, upload to bucket and return signed URL
	if s.supabaseClient != nil && s.cfg.SupabaseBucket != "" && s.cfg.SupabaseURL != "" && s.cfg.SupabaseServiceKey != "" {
		s.log.LogDebugf("Attempting Supabase upload...")
		name := time.Now().Format("20060102_150405") + "_" + sanitize(r.Url) + "." + strings.ToLower(s.getString((*string)(r.Format), "png"))
		bucketPath := filepath.ToSlash(filepath.Join("screenshots", name))

		// Determine mime type from filename extension
		mimeType := mime.TypeByExtension(filepath.Ext(bucketPath))
		if mimeType == "" {
			format := s.getString((*string)(r.Format), "png")
			if strings.EqualFold(format, "jpeg") || strings.EqualFold(format, "jpg") {
				mimeType = "image/jpeg"
			} else {
				mimeType = "image/png"
			}
		}

		reader := bytes.NewReader(data)
		if _, err := s.supabaseClient.Storage.UploadFile(s.cfg.SupabaseBucket, bucketPath, reader, storage_go.FileOptions{ContentType: &mimeType}); err != nil {
			s.log.LogWarnf("Supabase upload failed, falling back to local storage: %v", err)
			goto LOCAL
		}
		s.log.LogDebugf("Supabase upload successful, creating signed URL...")

		signed, err := s.createSignedURLWorkaround(s.cfg.SupabaseBucket, bucketPath, 15*60)
		if err != nil {
			s.log.LogWarnf("Supabase signed URL creation failed, falling back to local storage: %v", err)
			goto LOCAL
		}
		s.log.LogInfof("Successfully created Supabase signed URL: %s", signed)
		return "", signed, nil
	}

LOCAL:
	dir := filepath.Join(s.cfg.DataDir, "screenshots")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", "", fmt.Errorf("create screenshot directory %s: %w", dir, err)
	}
	ext := strings.ToLower(s.getString((*string)(r.Format), "png"))
	name := time.Now().Format("20060102_150405") + "_" + utils.UUIDv4()[:8] + "_" + sanitize(r.Url) + "." + ext
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return "", "", fmt.Errorf("write screenshot %s: %w", path, err)
	}
	return path, "/files/screenshots/" + name, nil
}

// createSignedURLWorkaround performs a direct REST call to sign objects with fresh headers
func (s *Service) createSignedURLWorkaround(bucket string, objectPath string, expiresIn int) (string, error) {
	if s.cfg.SupabaseURL == "" {
		return "", fmt.Errorf("supabase URL not configured")
	}
	serviceKey := s.cfg.SupabaseServiceKey
	if serviceKey == "" {
		return "", fmt.Errorf("supabase service key not configured")
	}

	signURL := fmt.Sprintf("%s/storage/v1/object/sign/%s/%s", strings.TrimRight(s.cfg.SupabaseURL, "/"), bucket, objectPath)
	body := map[string]int{"expiresIn": expiresIn}
	buf := new(bytes.Buffer)
	if err := json.NewEncoder(buf).Encode(body); err != nil {
		return "", fmt.Errorf("failed to encode sign body: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, signURL, buf)
	if err != nil {
		return "", fmt.Errorf("failed to build sign request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+serviceKey)
	req.Header.Set("apikey", serviceKey)

	httpClient := &http.Client{Timeout: 15 * time.Second}
	resp, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to request signed URL: %w", err)
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			s.log.LogWarnf("failed to close response body: %v", err)
		}
	}()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("failed to create signed URL: status %d", resp.StatusCode)
	}

	var signed struct {
		SignedURL string `json:"signedURL"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&signed); err != nil {
		return "", fmt.Errorf("failed to decode signed URL response: %w", err)
	}

	base := strings.TrimRight(s.cfg.SupabaseURL, "/")
	path := signed.SignedURL
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	if !strings.HasPrefix(path, "/storage/v1/") {
		path = "/storage/v1" + path
	}
	finalURL := base + path
	if s.cfg.AppEnv == "local" || s.cfg.AppEnv == "development" {
		finalURL = strings.Replace(finalURL, "host.docker.internal", "127.0.0.1", 1)
	}

	s.log.LogDebugf("Workaround returned signed URL: %s", finalURL)
	return finalURL, nil
}

func sanitize(u string) string {
	replacer := strings.NewReplacer(":", "-", "/", "-", "?", "-", "&", "-", "=", "-", "#", "-", "%", "")
	out := replacer.Replace(u)
	if len(out) > 64 {
		out = out[:64]
	}
	return out
}

// Helper functions for URL blocking
func (s *Service) isAdUrl(url string) bool {
	adPatterns := []string{
		"googlesyndication.com", "doubleclick.net", "googleadservices.com", "googletag",
		"amazon-adsystem.com", "facebook.com/plugins", "fbcdn.net", "outbrain.com",
		"taboola.com", "adsystem.amazon", "googleads", "/ads/", "/ad?", "adsense",
	}
	for _, pattern := range adPatterns {
		if strings.Contains(url, pattern) {
			return true
		}
	}
	return false
}

func (s *Service) isCookieUrl(url string) bool {
	cookiePatterns := []string{
		"cookielaw.org", "onetrust.com", "quantcast.com", "cookiebot.com",
		"trustarc.com", "cookie-consent", "gdpr", "/privacy", "/consent",
	}
	for _, pattern := range cookiePatterns {
		if strings.Contains(url, pattern) {
			return true
		}
	}
	return false
}

func (s *Service) isChatUrl(url string) bool {
	chatPatterns := []string{
		"intercom.io", "zendesk.com", "livechat.com", "drift.com", "helpscout.com",
		"freshchat.com", "tawk.to", "crisp.chat", "messenger.com", "widget",
		"/chat", "/support", "customer-service",
	}
	for _, pattern := range chatPatterns {
		if strings.Contains(url, pattern) {
			return true
		}
	}
	return false
}

func (s *Service) isTrackerUrl(url string) bool {
	trackerPatterns := []string{
		"google-analytics.com", "googletagmanager.com", "hotjar.com", "mixpanel.com",
		"segment.com", "amplitude.com", "fullstory.com", "logrocket.com",
		"mouseflow.com", "smartlook.com", "/analytics", "/tracking", "/metrics",
		"facebook.com/tr", "linkedin.com/px",
	}
	for _, pattern := range trackerPatterns {
		if strings.Contains(url, pattern) {
			return true
		}
	}
	return false
}
