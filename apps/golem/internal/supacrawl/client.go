package supacrawl

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func NewClient() (*Client, error) {
	base := os.Getenv("SUPACRAWL_API_URL")
	if base == "" {
		return nil, fmt.Errorf("SUPACRAWL_API_URL is required")
	}
	base = strings.TrimRight(base, "/")

	return &Client{
		baseURL: base,
		httpClient: &http.Client{
			Timeout: 60 * time.Second,
		},
	}, nil
}

func NewClientWithURL(baseURL string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{
			Timeout: 60 * time.Second,
		},
	}
}

// ScrapeResponse represents the scraper API response for /v1/scrape.
type ScrapeResponse struct {
	Success    bool           `json:"success"`
	URL        string         `json:"url"`
	Title      string         `json:"title"`
	Content    string         `json:"content"`
	HTML       string         `json:"html,omitempty"`
	Links      []string       `json:"links"`
	Discovered int            `json:"discovered"`
	Metadata   ScrapeMetadata `json:"metadata"`
	Error      string         `json:"error,omitempty"`
}

type ScrapeMetadata struct {
	StatusCode    int    `json:"status_code"`
	Title         string `json:"title"`
	Description   string `json:"description"`
	Language      string `json:"language"`
	OgTitle       string `json:"og_title"`
	OgDescription string `json:"og_description"`
	OgImage       string `json:"og_image"`
}

type ScrapeOptions struct {
	Format      string // markdown, links
	IncludeHTML bool
	Fresh       bool
}

// Scrape fetches and returns the markdown content + metadata for a URL.
func (c *Client) Scrape(ctx context.Context, targetURL string, opts ScrapeOptions) (*ScrapeResponse, error) {
	params := url.Values{}
	params.Set("url", targetURL)
	if opts.Format != "" {
		params.Set("format", opts.Format)
	}
	if opts.IncludeHTML {
		params.Set("include_html", "true")
	}
	if opts.Fresh {
		params.Set("fresh", "true")
	}

	endpoint := fmt.Sprintf("%s/v1/scrape?%s", c.baseURL, params.Encode())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("build scrape request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("scrape request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read scrape response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("scrape returned %d: %s", resp.StatusCode, string(body))
	}

	var result ScrapeResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("decode scrape response: %w", err)
	}

	if !result.Success {
		return nil, fmt.Errorf("scrape failed: %s", result.Error)
	}

	return &result, nil
}

// ScreenshotRequest represents the POST body for /v1/screenshots.
type ScreenshotRequest struct {
	URL             string `json:"url"`
	FullPage        bool   `json:"full_page,omitempty"`
	Format          string `json:"format,omitempty"`
	Width           int    `json:"width,omitempty"`
	Height          int    `json:"height,omitempty"`
	WaitUntil       string `json:"wait_until,omitempty"`
	WaitForSelector string `json:"wait_for_selector,omitempty"`
	ClickSelector   string `json:"click_selector,omitempty"`
	BlockAds        bool   `json:"block_ads,omitempty"`
	DarkMode        bool   `json:"dark_mode,omitempty"`
	Delay           int    `json:"delay,omitempty"`
}

type ScreenshotJobResponse struct {
	Success  bool                `json:"success"`
	JobID    string              `json:"job_id"`
	Status   string              `json:"status"`
	URL      string              `json:"url"`
	Metadata *ScreenshotMetadata `json:"metadata,omitempty"`
	Error    string              `json:"error,omitempty"`
}

type ScreenshotGetResponse struct {
	Success    bool                `json:"success"`
	JobID      string              `json:"job_id"`
	URL        string              `json:"url"`
	Screenshot string              `json:"screenshot"`
	Status     string              `json:"status"`
	Metadata   *ScreenshotMetadata `json:"metadata,omitempty"`
	Error      string              `json:"error,omitempty"`
}

type ScreenshotMetadata struct {
	Width       int     `json:"width"`
	Height      int     `json:"height"`
	Format      string  `json:"format"`
	FileSize    int     `json:"file_size"`
	LoadTime    int     `json:"load_time"`
	Device      string  `json:"device"`
	DeviceScale float64 `json:"device_scale"`
}

// Screenshot creates a screenshot job and polls until complete.
func (c *Client) Screenshot(ctx context.Context, req ScreenshotRequest) (*ScreenshotGetResponse, error) {
	jobResp, err := c.createScreenshot(ctx, req)
	if err != nil {
		return nil, err
	}

	return c.pollScreenshot(ctx, jobResp.JobID)
}

func (c *Client) createScreenshot(ctx context.Context, req ScreenshotRequest) (*ScreenshotJobResponse, error) {
	payload, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal screenshot request: %w", err)
	}

	endpoint := fmt.Sprintf("%s/v1/screenshots", c.baseURL)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("build screenshot request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("screenshot request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read screenshot response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("screenshot returned %d: %s", resp.StatusCode, string(body))
	}

	var result ScreenshotJobResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("decode screenshot response: %w", err)
	}

	if !result.Success {
		return nil, fmt.Errorf("screenshot job creation failed: %s", result.Error)
	}

	return &result, nil
}

func (c *Client) pollScreenshot(ctx context.Context, jobID string) (*ScreenshotGetResponse, error) {
	params := url.Values{}
	params.Set("job_id", jobID)
	endpoint := fmt.Sprintf("%s/v1/screenshots?%s", c.baseURL, params.Encode())

	maxAttempts := 30
	for i := 0; i < maxAttempts; i++ {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			return nil, fmt.Errorf("build screenshot poll request: %w", err)
		}

		resp, err := c.httpClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("screenshot poll failed: %w", err)
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return nil, fmt.Errorf("read screenshot poll response: %w", err)
		}

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("screenshot poll returned %d: %s", resp.StatusCode, string(body))
		}

		var result ScreenshotGetResponse
		if err := json.Unmarshal(body, &result); err != nil {
			return nil, fmt.Errorf("decode screenshot poll response: %w", err)
		}

		switch result.Status {
		case "completed":
			return &result, nil
		case "failed":
			return nil, fmt.Errorf("screenshot job failed: %s", result.Error)
		case "processing":
			time.Sleep(time.Second)
			continue
		default:
			return nil, fmt.Errorf("unexpected screenshot status: %s", result.Status)
		}
	}

	return nil, fmt.Errorf("screenshot job %s timed out after %d attempts", jobID, maxAttempts)
}

// Health checks the scraper service health.
func (c *Client) Health(ctx context.Context) error {
	endpoint := fmt.Sprintf("%s/v1/health", c.baseURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return fmt.Errorf("build health request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("health check failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("health check returned %d", resp.StatusCode)
	}

	return nil
}
