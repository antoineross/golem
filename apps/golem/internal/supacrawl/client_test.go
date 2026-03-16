package supacrawl

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNewClient_MissingEnv(t *testing.T) {
	t.Setenv("SUPACRAWL_API_URL", "")
	_, err := NewClient()
	if err == nil {
		t.Fatal("expected error for missing SUPACRAWL_API_URL")
	}
}

func TestNewClient_WithEnv(t *testing.T) {
	t.Setenv("SUPACRAWL_API_URL", "http://localhost:8082")
	c, err := NewClient()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if c.baseURL != "http://localhost:8082" {
		t.Errorf("expected baseURL http://localhost:8082, got %s", c.baseURL)
	}
}

func TestNewClientWithURL(t *testing.T) {
	c := NewClientWithURL("http://example.com/")
	if c.baseURL != "http://example.com" {
		t.Errorf("expected trailing slash stripped, got %s", c.baseURL)
	}
}

func TestHealth_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/health" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer srv.Close()

	c := NewClientWithURL(srv.URL)
	if err := c.Health(context.Background()); err != nil {
		t.Fatalf("health check failed: %v", err)
	}
}

func TestHealth_Failure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	c := NewClientWithURL(srv.URL)
	if err := c.Health(context.Background()); err == nil {
		t.Fatal("expected error for unhealthy service")
	}
}

func TestScrape_Success(t *testing.T) {
	expected := ScrapeResponse{
		Success: true,
		URL:     "https://example.com",
		Title:   "Example",
		Content: "# Hello World",
		Links:   []string{"https://example.com/about"},
		Metadata: ScrapeMetadata{
			StatusCode: 200,
			Title:      "Example",
		},
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/scrape" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("url") != "https://example.com" {
			t.Errorf("unexpected url param: %s", r.URL.Query().Get("url"))
		}
		if r.URL.Query().Get("format") != "markdown" {
			t.Errorf("unexpected format param: %s", r.URL.Query().Get("format"))
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(expected)
	}))
	defer srv.Close()

	c := NewClientWithURL(srv.URL)
	resp, err := c.Scrape(context.Background(), "https://example.com", ScrapeOptions{
		Format: "markdown",
	})
	if err != nil {
		t.Fatalf("scrape failed: %v", err)
	}
	if resp.Title != "Example" {
		t.Errorf("expected title Example, got %s", resp.Title)
	}
	if resp.Content != "# Hello World" {
		t.Errorf("expected content '# Hello World', got %s", resp.Content)
	}
	if resp.Metadata.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.Metadata.StatusCode)
	}
}

func TestScrape_HTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"success":false,"error":"invalid url"}`))
	}))
	defer srv.Close()

	c := NewClientWithURL(srv.URL)
	_, err := c.Scrape(context.Background(), "bad-url", ScrapeOptions{})
	if err == nil {
		t.Fatal("expected error for bad request")
	}
}

func TestScrape_APIError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(ScrapeResponse{
			Success: false,
			Error:   "page not found",
		})
	}))
	defer srv.Close()

	c := NewClientWithURL(srv.URL)
	_, err := c.Scrape(context.Background(), "https://example.com/404", ScrapeOptions{})
	if err == nil {
		t.Fatal("expected error for API failure")
	}
}

func TestScrape_WithOptions(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		if q.Get("include_html") != "true" {
			t.Error("expected include_html=true")
		}
		if q.Get("fresh") != "true" {
			t.Error("expected fresh=true")
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(ScrapeResponse{
			Success: true,
			URL:     "https://example.com",
			HTML:    "<h1>Hello</h1>",
		})
	}))
	defer srv.Close()

	c := NewClientWithURL(srv.URL)
	resp, err := c.Scrape(context.Background(), "https://example.com", ScrapeOptions{
		IncludeHTML: true,
		Fresh:       true,
	})
	if err != nil {
		t.Fatalf("scrape failed: %v", err)
	}
	if resp.HTML != "<h1>Hello</h1>" {
		t.Errorf("expected HTML content, got %s", resp.HTML)
	}
}

func TestCreateScreenshot_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == "/v1/screenshots" {
			var req ScreenshotRequest
			json.NewDecoder(r.Body).Decode(&req)
			if req.URL != "https://example.com" {
				t.Errorf("expected url https://example.com, got %s", req.URL)
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(ScreenshotJobResponse{
				Success: true,
				JobID:   "job-123",
				Status:  "processing",
			})
			return
		}
		if r.Method == http.MethodGet && r.URL.Path == "/v1/screenshots" {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(ScreenshotGetResponse{
				Success:    true,
				JobID:      "job-123",
				Screenshot: "https://cdn.example.com/screenshot.png",
				Status:     "completed",
				Metadata: &ScreenshotMetadata{
					Width:  1280,
					Height: 720,
					Format: "png",
				},
			})
			return
		}
		t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
	}))
	defer srv.Close()

	c := NewClientWithURL(srv.URL)
	resp, err := c.Screenshot(context.Background(), ScreenshotRequest{
		URL: "https://example.com",
	})
	if err != nil {
		t.Fatalf("screenshot failed: %v", err)
	}
	if resp.Screenshot != "https://cdn.example.com/screenshot.png" {
		t.Errorf("expected screenshot URL, got %s", resp.Screenshot)
	}
	if resp.Metadata.Width != 1280 {
		t.Errorf("expected width 1280, got %d", resp.Metadata.Width)
	}
}

func TestCreateScreenshot_Failed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(ScreenshotJobResponse{
				Success: true,
				JobID:   "job-fail",
				Status:  "processing",
			})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(ScreenshotGetResponse{
			Success: false,
			Status:  "failed",
			Error:   "timeout loading page",
		})
	}))
	defer srv.Close()

	c := NewClientWithURL(srv.URL)
	_, err := c.Screenshot(context.Background(), ScreenshotRequest{
		URL: "https://slow-site.example.com",
	})
	if err == nil {
		t.Fatal("expected error for failed screenshot")
	}
}

func TestCreateScreenshot_PostFailed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]any{"success": false, "error": "missing url"})
	}))
	defer srv.Close()

	c := NewClientWithURL(srv.URL)
	_, err := c.Screenshot(context.Background(), ScreenshotRequest{})
	if err == nil {
		t.Fatal("expected error for bad request")
	}
}
