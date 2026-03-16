package scrape

import (
	"compress/gzip"
	"compress/zlib"
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"math/rand"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"strings"
	"time"

	"scraper/internal/browser"
	"scraper/internal/core/scrape/robots"
	"scraper/internal/logger"
	"scraper/internal/platform/engineapi"
	rds "scraper/internal/platform/redis"
	"scraper/internal/utils/markdown"

	html2markdown "github.com/JohannesKaufmann/html-to-markdown"
	"github.com/andybalholm/brotli"
	"github.com/chromedp/chromedp"
	"github.com/klauspost/compress/zstd"
	utls "github.com/refraction-networking/utls"
)

type Service struct {
	log        *logger.Logger
	redis      *rds.Service
	httpClient *http.Client
	utlsClient *http.Client
	robots     *robots.Service
	cookieJar  *cookiejar.Jar
	pool       *browser.Pool
	skipDelay  bool
}

func NewScrapeService(redis *rds.Service, pool *browser.Pool) *Service {
	jar, err := cookiejar.New(nil)
	if err != nil {
		// Cookie jar creation should never fail with nil options
		panic(fmt.Sprintf("failed to create cookie jar: %v", err))
	}

	return &Service{
		log:        logger.New("ScrapeService"),
		redis:      redis,
		httpClient: newHTTP2Client(jar), // Primary: HTTP/2 enabled
		utlsClient: newUTLSClient(jar),  // Fallback: TLS fingerprinting
		robots:     robots.New(),
		cookieJar:  jar,
		pool:       pool,
	}
}

// ScrapeWithCache parity helper used by crawl: returns (result, cached, error)
func (s *Service) ScrapeWithCache(ctx context.Context, url string, includeHTML bool) (*engineapi.ScrapeResponse, bool, error) {
	format := engineapi.GetV1ScrapeParamsFormat("markdown")
	params := engineapi.GetV1ScrapeParams{Url: url, Format: &format, IncludeHtml: &includeHTML}

	if cached := s.getCached(ctx, params); cached != nil {
		s.log.Info().Str("url", url).Msg("cache hit")
		return cached, true, nil
	}

	// Always use HTTP path; JS rendering removed
	res, err := s.scrapeWithRetriesHTTP(params)
	if err != nil {
		return nil, false, err
	}
	if !s.isValidResult(res) {
		return nil, false, NewLowQualityContentError(url)
	}

	// Cache best-effort
	s.cache(ctx, params, res)
	return res, false, nil
}

// ScrapeURL implements synchronous scrape with caching, robots checks, and scraping
// Maximum total time: 90s (allows all 5 Playwright iterations: ~12s each × 5 + delays)
func (s *Service) ScrapeURL(ctx context.Context, params engineapi.GetV1ScrapeParams) (*engineapi.ScrapeResponse, error) {
	// Hard timeout of 90s for entire operation (HTTP: 20s, Playwright: 60-70s for all iterations)
	timeout := 90 * time.Second
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	s.log.Info().Str("url", params.Url).Msg("scrape start")
	fresh := false
	if params.Fresh != nil {
		fresh = *params.Fresh
	}

	// Cache read
	if !fresh {
		if cached := s.getCached(ctx, params); cached != nil {
			s.log.Info().Str("url", params.Url).Msg("cache hit")
			return cached, nil
		}
	}

	// Respect robots.txt
	if !s.robots.IsAllowed(params.Url, "SupacrawlerBot") {
		s.log.Info().Str("url", params.Url).Msg("robots disallow")
		return nil, NewRobotsBlockedError(params.Url)
	}

	// Try LightPanda first, fallback to HTTP
	useLightPanda := true

	// Run scraping in goroutine with timeout
	type scrapeResult struct {
		result *engineapi.ScrapeResponse
		err    error
	}
	resultChan := make(chan scrapeResult, 1)

	go func() {
		var result *engineapi.ScrapeResponse
		var err error

		// Try LightPanda first
		result, err = s.scrapeWithLightPanda(ctx, params)
		if err != nil {
			s.log.Info().Str("url", params.Url).Str("error", err.Error()).Msg("lightpanda failed, falling back to HTTP")
			// Fallback to HTTP
			result, err = s.scrapeWithRetriesHTTP(params)
			useLightPanda = false
		}

		resultChan <- scrapeResult{result: result, err: err}
	}()

	// Wait for result or timeout
	select {
	case <-ctx.Done():
		return nil, fmt.Errorf("scrape timeout after 90s (all iterations exhausted)")
	case res := <-resultChan:
		if res.err != nil {
			s.log.Info().Str("url", params.Url).Str("error", res.err.Error()).Msg("scrape failed")
			return nil, res.err
		}

		// Success! Cache and return
		s.cache(ctx, params, res.result)
		method := "http"
		if useLightPanda {
			method = "lightpanda"
		}
		s.log.Info().Str("url", params.Url).Int("status", intVal(res.result.Metadata.StatusCode)).Str("method", method).Msg("scrape complete")
		return res.result, nil
	}
}

// scrapeWithRetriesHTTP attempts scrape with 2 strategies for A/B testing
func (s *Service) scrapeWithRetriesHTTP(params engineapi.GetV1ScrapeParams) (*engineapi.ScrapeResponse, error) {
	// Only 2 strategies: TLS fingerprint + modern browser headers vs mobile
	strategies := []HeaderStrategy{StrategyModernBrowser, StrategyMobileDevice}
	var lastErr error
	startTime := time.Now()

	for i, strategy := range strategies {
		attemptStart := time.Now()
		s.log.Info().Str("url", params.Url).Int("attempt", i+1).Str("strategy", string(strategy)).Msg("attempt http scrape")

		result, err := s.scrapeSimpleHTTP(params, strategy)
		attemptDuration := time.Since(attemptStart)

		if err == nil && !s.isCloudflareBlocked(result) {
			s.log.Info().
				Str("url", params.Url).
				Str("strategy", string(strategy)).
				Int("attempt", i+1).
				Int("duration_ms", int(attemptDuration.Milliseconds())).
				Int("total_ms", int(time.Since(startTime).Milliseconds())).
				Msg("http scrape succeeded")
			return result, nil
		}

		if err != nil {
			lastErr = err
			s.log.Info().
				Str("url", params.Url).
				Str("strategy", string(strategy)).
				Str("error", err.Error()).
				Int("duration_ms", int(attemptDuration.Milliseconds())).
				Msg("http scrape attempt failed")
		} else {
			lastErr = fmt.Errorf("cloudflare challenge detected")
			s.log.Info().
				Str("url", params.Url).
				Str("strategy", string(strategy)).
				Int("status", intVal(result.Metadata.StatusCode)).
				Int("duration_ms", int(attemptDuration.Milliseconds())).
				Msg("cloudflare detected")
		}

		// Short delay before second attempt (1-2s)
		if i < len(strategies)-1 {
			backoffMs := 1000 + rand.Intn(1000)
			time.Sleep(time.Duration(backoffMs) * time.Millisecond)
		}
	}

	return nil, fmt.Errorf("all strategies exhausted after %dms: %w", time.Since(startTime).Milliseconds(), lastErr)
}

// scrapeSimpleHTTP provides basic HTTP scraping using parameters from backend
func (s *Service) scrapeSimpleHTTP(params engineapi.GetV1ScrapeParams, strategy HeaderStrategy) (*engineapi.ScrapeResponse, error) {
	return s.scrapeWithClient(params, strategy, s.httpClient)
}

// scrapeWithUTLS uses the uTLS client for TLS fingerprinting (HTTP/1.1 only)
func (s *Service) scrapeWithUTLS(params engineapi.GetV1ScrapeParams, strategy HeaderStrategy) (*engineapi.ScrapeResponse, error) {
	return s.scrapeWithClient(params, strategy, s.utlsClient)
}

// scrapeWithClient performs HTTP scraping with a specific client
func (s *Service) scrapeWithClient(params engineapi.GetV1ScrapeParams, strategy HeaderStrategy, client *http.Client) (*engineapi.ScrapeResponse, error) {
	req, err := http.NewRequest("GET", params.Url, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	// Get header profile for strategy
	profile := GetHeaderProfile(strategy)

	// Override with user-provided agent if available
	userAgent := profile.UserAgent
	if params.UserAgent != nil && *params.UserAgent != "" {
		userAgent = *params.UserAgent
	}

	// Apply headers from profile
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", profile.Accept)
	req.Header.Set("Accept-Language", profile.AcceptLanguage)
	req.Header.Set("Accept-Encoding", profile.AcceptEncoding)

	// Add Referer to simulate natural navigation
	// Use the homepage of the domain as referer for direct requests
	if parsedURL, err := url.Parse(params.Url); err == nil {
		referer := fmt.Sprintf("%s://%s", parsedURL.Scheme, parsedURL.Host)
		req.Header.Set("Referer", referer)

		// Add realistic browser cookies that Cloudflare might check
		// These simulate a browser that has visited before
		s.addRealisticCookies(req, parsedURL)
	}

	if profile.SecFetchDest != "" {
		req.Header.Set("Sec-Fetch-Dest", profile.SecFetchDest)
		req.Header.Set("Sec-Fetch-Mode", profile.SecFetchMode)
		req.Header.Set("Sec-Fetch-Site", profile.SecFetchSite)
		if profile.SecFetchUser != "" {
			req.Header.Set("Sec-Fetch-User", profile.SecFetchUser)
		}
	}

	if profile.SecChUa != "" {
		req.Header.Set("Sec-Ch-Ua", profile.SecChUa)
		req.Header.Set("Sec-Ch-Ua-Mobile", profile.SecChUaMobile)
		req.Header.Set("Sec-Ch-Ua-Platform", profile.SecChUaPlatform)
	}

	req.Header.Set("Upgrade-Insecure-Requests", "1")

	if !s.skipDelay {
		delay := time.Duration(rand.Intn(1500)+500) * time.Millisecond
		time.Sleep(delay)
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch: %w", err)
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			s.log.LogWarnf("failed to close response body: %v", err)
		}
	}()

	// Log cookies received from server
	if parsedURL, err := url.Parse(params.Url); err == nil {
		cookies := s.cookieJar.Cookies(parsedURL)
		if len(cookies) > 0 {
			cookieNames := make([]string, len(cookies))
			for i, c := range cookies {
				cookieNames[i] = c.Name
			}
			s.log.Info().Str("url", params.Url).Strs("cookies", cookieNames).Msg("cookies received")
		}
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}

	body, err := decompressBody(resp)
	if err != nil {
		return nil, fmt.Errorf("decompress: %w", err)
	}

	htmlBytes, err := io.ReadAll(body)
	if err != nil {
		return nil, err
	}
	h := string(htmlBytes)
	md := s.convertHTMLToMarkdown(h)

	var content string

	includeHTML := false
	if params.IncludeHtml != nil {
		includeHTML = *params.IncludeHtml
	}

	// Always use markdown format
	content = s.cleanContent(md)
	if !strings.HasSuffix(content, "\n\n") {
		content = strings.TrimRight(content, "\n") + "\n\n"
	}

	title := extractTitle(h)
	// Build rich metadata from the HTML
	meta := buildMetadataFromHTML(h, params.Url, resp.StatusCode)

	// Always extract and include links
	links := extractLinksFromHTML(h, params.Url)
	discovered := len(links)

	result := &engineapi.ScrapeResponse{
		Success:    true,
		Url:        params.Url,
		Content:    &content,
		Title:      &title,
		Links:      links,
		Discovered: &discovered,
		Metadata:   meta,
	}

	// Include HTML if requested
	if includeHTML {
		htmlContent := strings.TrimSpace(h)
		result.Html = &htmlContent
	}

	return result, nil
}

// scrapeWithLightPanda uses LightPanda browser via CDP to scrape JavaScript-heavy sites
func (s *Service) scrapeWithLightPanda(ctx context.Context, params engineapi.GetV1ScrapeParams) (*engineapi.ScrapeResponse, error) {
	start := time.Now()
	s.log.Info().Str("url", params.Url).Msg("scraping with lightpanda")

	// Create browser context from pool
	browserCtx, cancel := s.pool.NewContext()
	defer cancel()

	// Set timeout for entire scrape operation (15s)
	timeoutCtx, timeoutCancel := context.WithTimeout(browserCtx, 15*time.Second)
	defer timeoutCancel()

	var htmlContent string
	var title string

	// Navigate to URL
	err := chromedp.Run(timeoutCtx,
		chromedp.Navigate(params.Url),
		chromedp.WaitReady("body", chromedp.ByQuery),
	)

	if err != nil {
		if strings.Contains(err.Error(), "context canceled") || strings.Contains(err.Error(), "deadline exceeded") {
			return nil, fmt.Errorf("navigation timeout: %w", err)
		}
		return nil, fmt.Errorf("navigation failed: %w", err)
	}

	// Wait for content to load (2s for JS execution)
	time.Sleep(2 * time.Second)

	// Wait for specific selectors if provided
	if params.WaitForSelectors != nil {
		for _, selector := range *params.WaitForSelectors {
			_ = chromedp.Run(timeoutCtx, chromedp.WaitVisible(selector, chromedp.ByQuery))
			// Ignore errors - we'll take whatever content we got
		}
	}

	// Extract content
	err = chromedp.Run(timeoutCtx,
		chromedp.OuterHTML("html", &htmlContent),
		chromedp.Title(&title),
	)

	if err != nil {
		return nil, fmt.Errorf("content extraction failed: %w", err)
	}

	// Convert to markdown
	md := markdown.ConvertHTMLToMarkdown(htmlContent)
	content := s.cleanContent(md)
	if !strings.HasSuffix(content, "\n\n") {
		content = strings.TrimRight(content, "\n") + "\n\n"
	}

	// Extract metadata
	meta := buildMetadataFromHTML(htmlContent, params.Url, 200)

	// Extract links
	links := extractLinksFromHTML(htmlContent, params.Url)
	discovered := len(links)

	// Check for client-side errors (log as warnings, not failures)
	htmlLower := strings.ToLower(htmlContent)
	if strings.Contains(htmlLower, "application error") && strings.Contains(htmlLower, "client-side exception") {
		s.log.Info().Str("url", params.Url).Msg("client-side exception detected")
	}

	// Low content warning
	contentLen := len(strings.TrimSpace(content))
	if contentLen < 200 && len(links) == 0 {
		s.log.Info().Str("url", params.Url).Int("chars", contentLen).Int("links", len(links)).Msg("minimal content detected")
	}

	result := &engineapi.ScrapeResponse{
		Success:    true,
		Url:        params.Url,
		Content:    &content,
		Title:      &title,
		Links:      links,
		Discovered: &discovered,
		Metadata:   meta,
	}

	// Include HTML if requested
	includeHTML := false
	if params.IncludeHtml != nil {
		includeHTML = *params.IncludeHtml
	}
	if includeHTML {
		htmlContent := strings.TrimSpace(htmlContent)
		result.Html = &htmlContent
	}

	s.log.Info().Str("url", params.Url).Int("duration_ms", int(time.Since(start).Milliseconds())).Int("links", len(links)).Int("chars", len(content)).Msg("lightpanda scrape complete")
	return result, nil
}

// newHTTP2Client creates a standard HTTP client with HTTP/2 support.
// This is the primary client that works with most sites.
func newHTTP2Client(jar *cookiejar.Jar) *http.Client {
	transport := &http.Transport{
		MaxIdleConns:      100,
		IdleConnTimeout:   90 * time.Second,
		MaxConnsPerHost:   10,
		DisableKeepAlives: false,
		ForceAttemptHTTP2: true, // Enable HTTP/2
		TLSClientConfig: &tls.Config{
			MinVersion: tls.VersionTLS12,
		},
	}
	return &http.Client{
		Transport: transport,
		Timeout:   15 * time.Second,
		Jar:       jar,
	}
}

// newUTLSClient creates an HTTP client with uTLS for browser fingerprinting.
// Note: This client only supports HTTP/1.1 due to uTLS limitations with Go's http2.
// Use this as a fallback when sites block based on TLS fingerprint.
func newUTLSClient(jar *cookiejar.Jar) *http.Client {
	transport := &http.Transport{
		MaxIdleConns:      100,
		IdleConnTimeout:   90 * time.Second,
		MaxConnsPerHost:   10,
		DisableKeepAlives: false,
		// Force HTTP/1.1 only since uTLS breaks HTTP/2
		ForceAttemptHTTP2: false,
		TLSClientConfig: &tls.Config{
			MinVersion: tls.VersionTLS12,
			// Only advertise HTTP/1.1 to avoid HTTP/2 negotiation issues
			NextProtos: []string{"http/1.1"},
		},
		DialTLSContext: getRandomTLSDialer(),
	}
	return &http.Client{
		Transport: transport,
		Timeout:   15 * time.Second,
		Jar:       jar,
	}
}

// getRandomTLSDialer returns a custom dialer that uses browser-like TLS fingerprints
func getRandomTLSDialer() func(ctx context.Context, network, addr string) (net.Conn, error) {
	// Browser fingerprints to rotate between
	fingerprints := []utls.ClientHelloID{
		utls.HelloChrome_Auto,  // Latest Chrome
		utls.HelloFirefox_Auto, // Latest Firefox
		utls.HelloSafari_Auto,  // Latest Safari
		utls.HelloEdge_Auto,    // Latest Edge
	}

	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		// Random browser fingerprint
		fingerprint := fingerprints[rand.Intn(len(fingerprints))]

		// Dial TCP connection first
		dialer := &net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}

		rawConn, err := dialer.DialContext(ctx, network, addr)
		if err != nil {
			return nil, err
		}

		// Extract hostname from addr (format is "host:port")
		host := addr
		if colonPos := strings.LastIndex(addr, ":"); colonPos != -1 {
			host = addr[:colonPos]
		}

		// Create uTLS connection with browser fingerprint
		utlsConn := utls.UClient(rawConn, &utls.Config{
			ServerName:         host,
			InsecureSkipVerify: false,
		}, fingerprint)

		// Perform TLS handshake
		if err := utlsConn.Handshake(); err != nil {
			rawConn.Close()
			return nil, err
		}

		return utlsConn, nil
	}
}

// decompressBody wraps the response body with the appropriate decompressor
// based on the Content-Encoding header. This is necessary because Go's
// http.Client only auto-decompresses when Accept-Encoding is NOT manually set,
// and the scraper sets it explicitly to support br/zstd.
//
// Content-Encoding can be a comma-separated list (RFC 9110 sec 8.4); in that
// case we select the last (outermost) encoding, which is the standard approach
// for single-layer decompression.
func decompressBody(resp *http.Response) (io.Reader, error) {
	raw := resp.Header.Get("Content-Encoding")
	encoding := strings.ToLower(strings.TrimSpace(raw))

	// Handle comma-separated encodings by taking the last token.
	if strings.Contains(encoding, ",") {
		parts := strings.Split(encoding, ",")
		encoding = strings.TrimSpace(parts[len(parts)-1])
	}

	switch encoding {
	case "gzip":
		return gzip.NewReader(resp.Body)
	case "deflate":
		// RFC 1950 (zlib-wrapped) is more common than raw RFC 1951 deflate.
		// Try zlib first; if the header byte is wrong, fall back to raw.
		return zlib.NewReader(resp.Body)
	case "br":
		return brotli.NewReader(resp.Body), nil
	case "zstd":
		decoder, err := zstd.NewReader(resp.Body)
		if err != nil {
			return nil, fmt.Errorf("zstd init: %w", err)
		}
		return decoder, nil
	case "", "identity":
		return resp.Body, nil
	default:
		return resp.Body, nil
	}
}

func (s *Service) convertHTMLToMarkdown(h string) string {
	conv := html2markdown.NewConverter("", true, nil)
	md, _ := conv.ConvertString(h)
	if cleaned := markdown.ConvertHTMLToMarkdown(h); strings.TrimSpace(cleaned) != "" {
		md = cleaned
	}
	return s.cleanContent(md)
}

func (s *Service) cleanContent(md string) string {
	if md == "" {
		return ""
	}
	// 1. Initial Normalization
	cleaned := strings.ReplaceAll(md, "\r\n", "\n")

	// 2. Structural Link Repairs
	cleaned = strings.ReplaceAll(cleaned, ")\\\n[", ")\n[")
	cleaned = strings.ReplaceAll(cleaned, "]\\\n(", "]\n(")

	reEndBS := regexp.MustCompile(`\\+\n`)
	cleaned = reEndBS.ReplaceAllString(cleaned, "\n")

	reImgBold := regexp.MustCompile(`\)\n{1,2}(\*\*[^\]]+\*\*)\]\(`)
	cleaned = reImgBold.ReplaceAllString(cleaned, ") $1](")

	reImgNext := regexp.MustCompile(`\)\n{1,2}\[([^\]]+)\]\(`)
	cleaned = reImgNext.ReplaceAllString(cleaned, ") [$1](")

	// 3. Spacing and Formatting
	reAdj := regexp.MustCompile(`\) \[!\[`) // ") [!["
	cleaned = reAdj.ReplaceAllString(cleaned, ")\n\n[![")

	re := regexp.MustCompile(`\n{3,}`)
	cleaned = re.ReplaceAllString(cleaned, "\n\n")

	reHeaders := regexp.MustCompile("([^\n])\n(#+)")
	cleaned = reHeaders.ReplaceAllString(cleaned, "$1\n\n$2")

	// 4. Finalization
	cleaned = strings.TrimSpace(cleaned) + "\n\n"

	return cleaned
}

func extractTitle(htmlContent string) string {
	// Use case-insensitive regex to match title tags
	titleRe := regexp.MustCompile(`(?i)<title[^>]*>(.*?)</title>`)
	matches := titleRe.FindStringSubmatch(htmlContent)
	if len(matches) < 2 {
		return ""
	}
	// Decode HTML entities and clean up the title
	title := strings.TrimSpace(matches[1])
	// Basic HTML entity decoding
	title = strings.ReplaceAll(title, "&lt;", "<")
	title = strings.ReplaceAll(title, "&gt;", ">")
	title = strings.ReplaceAll(title, "&amp;", "&")
	title = strings.ReplaceAll(title, "&quot;", `"`)
	title = strings.ReplaceAll(title, "&#39;", "'")
	return title
}

// extractLinksFromHTML extracts all href links from HTML content
func extractLinksFromHTML(htmlContent, baseURL string) []string {
	var links []string
	linkRegex := regexp.MustCompile(`<a[^>]+href=["']([^"']+)["'][^>]*>`)
	matches := linkRegex.FindAllStringSubmatch(htmlContent, -1)

	for _, match := range matches {
		if len(match) > 1 {
			link := strings.TrimSpace(match[1])
			if link != "" {
				// Convert relative URLs to absolute
				if !strings.HasPrefix(link, "http://") && !strings.HasPrefix(link, "https://") {
					if strings.HasPrefix(link, "//") {
						// Protocol-relative URL
						if strings.HasPrefix(baseURL, "https://") {
							link = "https:" + link
						} else {
							link = "http:" + link
						}
					} else if strings.HasPrefix(link, "/") {
						// Absolute path
						if i := strings.Index(baseURL, "://"); i != -1 {
							host := baseURL[i+3:]
							if j := strings.Index(host, "/"); j != -1 {
								link = baseURL[:i+3] + host[:j] + link
							} else {
								link = baseURL + link
							}
						}
					} else if !strings.HasPrefix(link, "#") && !strings.HasPrefix(link, "javascript:") && !strings.HasPrefix(link, "mailto:") {
						// Relative path
						if strings.HasSuffix(baseURL, "/") {
							link = baseURL + link
						} else {
							link = baseURL + "/" + link
						}
					}
				}

				// Only include valid HTTP/HTTPS links
				if strings.HasPrefix(link, "http://") || strings.HasPrefix(link, "https://") {
					links = append(links, link)
				}
			}
		}
	}

	// Remove duplicates
	seen := make(map[string]bool)
	var uniqueLinks []string
	for _, link := range links {
		if !seen[link] {
			seen[link] = true
			uniqueLinks = append(uniqueLinks, link)
		}
	}

	return uniqueLinks
}

// extractPageMetadataFromHTML parses common metadata from an HTML string into a flat map
func extractPageMetadataFromHTML(htmlString string, url string) map[string]interface{} {
	out := make(map[string]interface{})
	out["url"] = url
	t := extractTitle(htmlString)
	if strings.TrimSpace(t) != "" {
		out["title"] = strings.TrimSpace(t)
	}
	// Basic meta extraction (name/property + content)
	findMeta := func(name string) string {
		// pattern matches: <meta name="NAME" content="...">
		pattern := fmt.Sprintf(`<meta[^>]*(name|property|http-equiv)=["']%s["'][^>]*content=["']([^"']+)["'][^>]*>`, regexp.QuoteMeta(name))
		re := regexp.MustCompile(`(?is)` + pattern)
		m := re.FindStringSubmatch(htmlString)
		if len(m) >= 3 {
			return strings.TrimSpace(m[2])
		}
		return ""
	}
	setIf := func(k, v string) {
		if v != "" {
			out[k] = v
		}
	}
	setIf("description", findMeta("description"))
	setIf("og:title", findMeta("og:title"))
	setIf("og:description", findMeta("og:description"))
	setIf("og:image", findMeta("og:image"))

	// canonical
	reCanon := regexp.MustCompile(`(?is)<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>`)
	if m := reCanon.FindStringSubmatch(htmlString); len(m) >= 2 {
		out["canonical"] = strings.TrimSpace(m[1])
	}
	// favicon
	reFav := regexp.MustCompile(`(?is)<link[^>]*rel=["'](icon|shortcut icon)["'][^>]*href=["']([^"']+)["'][^>]*>`)
	if m := reFav.FindStringSubmatch(htmlString); len(m) >= 3 {
		out["favicon"] = strings.TrimSpace(m[2])
	}
	return out
}

// buildMetadataFromHTML constructs engineapi.ScrapeMetadata from HTML
func buildMetadataFromHTML(htmlString string, pageURL string, status int) engineapi.ScrapeMetadata {
	meta := engineapi.ScrapeMetadata{}
	// set required basic fields
	meta.StatusCode = &status
	meta.SourceUrl = &pageURL

	// helpers
	set := func(dst **string, val string) {
		if strings.TrimSpace(val) == "" {
			return
		}
		v := strings.TrimSpace(val)
		*dst = &v
	}
	// absolute URL helper
	absolutize := func(u string) string {
		u = strings.TrimSpace(u)
		if u == "" {
			return u
		}
		// already absolute
		if strings.HasPrefix(u, "http://") || strings.HasPrefix(u, "https://") {
			return u
		}
		// protocol-relative
		if strings.HasPrefix(u, "//") {
			if strings.HasPrefix(pageURL, "https://") {
				return "https:" + u
			}
			return "http:" + u
		}
		// relative -> join with origin
		// crude origin extraction
		origin := pageURL
		if i := strings.Index(origin, "://"); i != -1 {
			origin = origin[i+3:]
			if j := strings.Index(origin, "/"); j != -1 {
				origin = pageURL[:i+3] + origin[:j]
			} else {
				origin = pageURL
			}
		}
		if strings.HasPrefix(u, "/") {
			// origin + path
			if k := strings.Index(pageURL, "://"); k != -1 {
				host := pageURL[k+3:]
				if s := strings.Index(host, "/"); s != -1 {
					origin = pageURL[:k+3] + host[:s]
				} else {
					origin = pageURL
				}
			}
			return origin + u
		}
		// fall back to origin + "/" + u
		if !strings.HasSuffix(origin, "/") {
			return origin + "/" + u
		}
		return origin + u
	}

	// use existing lightweight regex extractor
	raw := extractPageMetadataFromHTML(htmlString, pageURL)
	set(&meta.Title, getString(raw, "title"))
	set(&meta.Description, getString(raw, "description"))
	set(&meta.Language, getString(raw, "language"))
	set(&meta.Canonical, absolutize(getString(raw, "canonical")))
	set(&meta.Favicon, absolutize(getString(raw, "favicon")))
	set(&meta.OgTitle, getString(raw, "og:title"))
	set(&meta.OgDescription, getString(raw, "og:description"))
	set(&meta.OgImage, absolutize(getString(raw, "og:image")))
	set(&meta.OgSiteName, getString(raw, "og:site_name"))

	return meta
}

func getString(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok {
		switch t := v.(type) {
		case string:
			return t
		case []string:
			if len(t) > 0 {
				return t[0]
			}
		}
	}
	return ""
}

// Cache helpers

func (s *Service) getCached(ctx context.Context, params engineapi.GetV1ScrapeParams) *engineapi.ScrapeResponse {
	key := s.generateCacheKey(params)
	var res engineapi.ScrapeResponse
	if err := s.redis.CacheGet(ctx, key, &res); err != nil {
		return nil
	}
	return &res
}

func (s *Service) cache(ctx context.Context, params engineapi.GetV1ScrapeParams, res *engineapi.ScrapeResponse) {
	key := s.generateCacheKey(params)
	// Single TTL; JS rendering removed
	ttl := 300 // 5 minutes
	_ = s.redis.CacheSet(ctx, key, res, ttl)
}

func (s *Service) generateCacheKey(params engineapi.GetV1ScrapeParams) string {
	format := "markdown"
	if params.Format != nil {
		format = string(*params.Format)
	}
	includeHtml := "false"
	if params.IncludeHtml != nil && *params.IncludeHtml {
		includeHtml = "true"
	}
	// Normalize URL minimally
	safeURL := strings.ReplaceAll(params.Url, ":", "_")
	safeURL = strings.ReplaceAll(safeURL, "/", "_")
	safeURL = strings.ReplaceAll(safeURL, "?", "_")
	safeURL = strings.ReplaceAll(safeURL, "&", "_")
	return fmt.Sprintf("scrape:%s:%s:%s", safeURL, format, includeHtml)
}

// Retry classification
func boolVal(p *bool) bool {
	if p == nil {
		return false
	}
	return *p
}
func intVal(p *int) int {
	if p == nil {
		return 0
	}
	return *p
}

func (s *Service) isValidResult(res *engineapi.ScrapeResponse) bool {
	if res == nil {
		return false
	}
	content := ""
	if res.Content != nil {
		content = strings.TrimSpace(*res.Content)
	}
	sc := 0
	if res.Metadata.StatusCode != nil {
		sc = *res.Metadata.StatusCode
	}

	if sc == 404 {
		return false
	}
	if len(content) < 10 {
		return false
	}
	return true
}

func (s *Service) calculateBackoff(attempt int, baseMs int, maxMs int) int {
	// Exponential: baseMs * 2^attempt
	backoff := baseMs * (1 << uint(attempt))

	// Cap at max
	if backoff > maxMs {
		backoff = maxMs
	}

	// Add jitter: ±25% randomization to prevent thundering herd
	jitter := backoff / 4
	backoff = backoff - jitter/2 + rand.Intn(jitter)

	return backoff
}

// addRealisticCookies adds human-like cookies to make requests look more legitimate
func (s *Service) addRealisticCookies(req *http.Request, parsedURL *url.URL) {
	// Generate session-like cookies that persist across requests via cookie jar
	// These simulate a browser that has been to the site before

	// Check if we already have cookies for this domain from cookie jar
	existingCookies := s.cookieJar.Cookies(parsedURL)
	if len(existingCookies) > 0 {
		// Already have cookies, let jar handle it
		return
	}

	// Add initial "browser fingerprint" cookies
	// These are common tracking cookies that real browsers accumulate
	timestamp := time.Now().Unix()
	randomSession := fmt.Sprintf("%x", rand.Int63())

	cookies := []*http.Cookie{
		{
			Name:     "_ga",
			Value:    fmt.Sprintf("GA1.2.%d.%d", rand.Int63n(999999999)+100000000, timestamp-rand.Int63n(86400*30)),
			Domain:   parsedURL.Host,
			Path:     "/",
			HttpOnly: false,
		},
		{
			Name:     "_gid",
			Value:    fmt.Sprintf("GA1.2.%d.%d", rand.Int63n(999999999)+100000000, timestamp),
			Domain:   parsedURL.Host,
			Path:     "/",
			HttpOnly: false,
		},
		{
			Name:     "session_id",
			Value:    randomSession,
			Domain:   parsedURL.Host,
			Path:     "/",
			HttpOnly: true,
		},
	}

	// Set cookies in jar so they persist
	s.cookieJar.SetCookies(parsedURL, cookies)
}

// isCloudflareBlocked detects if the response is a Cloudflare challenge page
func (s *Service) isCloudflareBlocked(result *engineapi.ScrapeResponse) bool {
	if result == nil {
		return false
	}

	// Check status code
	if result.Metadata.StatusCode != nil && *result.Metadata.StatusCode == 403 {
		// Check title for Cloudflare indicators
		if result.Title != nil {
			title := *result.Title
			if strings.Contains(title, "Just a moment") ||
				strings.Contains(title, "Checking your browser") ||
				strings.Contains(title, "Attention Required") {
				return true
			}
		}

		// Check content for Cloudflare indicators
		if result.Content != nil {
			content := *result.Content
			if strings.Contains(content, "Waiting for") && strings.Contains(content, "to respond") {
				return true
			}
			if strings.Contains(content, "Cloudflare") && strings.Contains(content, "Ray ID") {
				return true
			}
		}
	}

	return false
}
