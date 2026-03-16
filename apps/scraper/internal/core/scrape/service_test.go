package scrape

import (
	"bytes"
	"compress/gzip"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"strings"
	"testing"

	"scraper/internal/logger"
	"scraper/internal/platform/engineapi"
)

func newTestLogger() *logger.Logger {
	return logger.New("test")
}

func newTestService(t *testing.T) *Service {
	t.Helper()
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("cookiejar.New: %v", err)
	}
	return &Service{
		log:       newTestLogger(),
		cookieJar: jar,
		skipDelay: true,
	}
}

func TestScrapeWithClientDecompressesGzip(t *testing.T) {
	const html = `<!DOCTYPE html><html><head><title>Test Page</title></head><body><h1>Hello</h1><p>World</p></body></html>`

	var buf bytes.Buffer
	w := gzip.NewWriter(&buf)
	if _, err := w.Write([]byte(html)); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}

	srv := httptest.NewServer(http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		ae := r.Header.Get("Accept-Encoding")
		if !strings.Contains(ae, "gzip") {
			t.Errorf("expected Accept-Encoding to contain gzip, got %q", ae)
		}
		rw.Header().Set("Content-Encoding", "gzip")
		rw.Header().Set("Content-Type", "text/html; charset=utf-8")
		rw.WriteHeader(http.StatusOK)
		rw.Write(buf.Bytes())
	}))
	defer srv.Close()

	svc := newTestService(t)
	params := engineapi.GetV1ScrapeParams{Url: srv.URL}
	result, err := svc.scrapeWithClient(params, StrategyModernBrowser, srv.Client())
	if err != nil {
		t.Fatalf("scrapeWithClient() error = %v", err)
	}

	if result.Content == nil {
		t.Fatal("expected content, got nil")
	}

	if !strings.Contains(*result.Content, "Hello") || !strings.Contains(*result.Content, "World") {
		t.Errorf("expected content to contain 'Hello' and 'World', got %q", *result.Content)
	}

	if result.Title == nil || *result.Title != "Test Page" {
		title := ""
		if result.Title != nil {
			title = *result.Title
		}
		t.Errorf("expected title 'Test Page', got %q", title)
	}
}

func TestScrapeWithClientPlainResponse(t *testing.T) {
	const html = `<!DOCTYPE html><html><head><title>Plain</title></head><body><p>No compression</p></body></html>`

	srv := httptest.NewServer(http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		rw.Header().Set("Content-Type", "text/html; charset=utf-8")
		rw.WriteHeader(http.StatusOK)
		rw.Write([]byte(html))
	}))
	defer srv.Close()

	svc := newTestService(t)
	params := engineapi.GetV1ScrapeParams{Url: srv.URL}
	result, err := svc.scrapeWithClient(params, StrategyModernBrowser, srv.Client())
	if err != nil {
		t.Fatalf("scrapeWithClient() error = %v", err)
	}

	if result.Content == nil || !strings.Contains(*result.Content, "No compression") {
		t.Error("expected uncompressed content to pass through correctly")
	}
}
