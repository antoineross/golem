package adk

import (
	"fmt"
	"log/slog"
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"

	"golem/internal/supacrawl"

	"google.golang.org/adk/tool"
	"google.golang.org/adk/tool/functiontool"
)

type findHiddenArgs struct {
	URL string `json:"url" jsonschema:"The URL to scan for hidden DOM elements"`
}

type hiddenElement struct {
	Selector string `json:"selector"`
	Type     string `json:"type"`
	Context  string `json:"context"`
}

type findHiddenResult struct {
	URL      string          `json:"url"`
	Found    int             `json:"found"`
	Elements []hiddenElement `json:"elements"`
	Summary  string          `json:"summary"`
}

// hiddenPattern defines a regex pattern and its classification for hidden element detection.
type hiddenPattern struct {
	Pattern *regexp.Regexp
	Type    string
	Label   string
}

var hiddenPatterns = []hiddenPattern{
	{regexp.MustCompile(`(?i)style\s*=\s*"[^"]*display\s*:\s*none[^"]*"`), "css_hidden", "display:none"},
	{regexp.MustCompile(`(?i)style\s*=\s*'[^']*display\s*:\s*none[^']*'`), "css_hidden", "display:none"},
	{regexp.MustCompile(`(?i)style\s*=\s*"[^"]*visibility\s*:\s*hidden[^"]*"`), "css_hidden", "visibility:hidden"},
	{regexp.MustCompile(`(?i)style\s*=\s*'[^']*visibility\s*:\s*hidden[^']*'`), "css_hidden", "visibility:hidden"},
	{regexp.MustCompile(`(?i)style\s*=\s*"[^"]*opacity\s*:\s*0[^"]*"`), "css_hidden", "opacity:0"},
	{regexp.MustCompile(`(?i)style\s*=\s*'[^']*opacity\s*:\s*0[^']*'`), "css_hidden", "opacity:0"},
	{regexp.MustCompile(`(?i)style\s*=\s*"[^"]*position\s*:\s*absolute[^"]*left\s*:\s*-\d+`), "offscreen", "offscreen element"},
	{regexp.MustCompile(`(?i)type\s*=\s*"hidden"`), "hidden_input", "hidden form input"},
	{regexp.MustCompile(`(?i)aria-hidden\s*=\s*"true"`), "aria_hidden", "aria-hidden"},
	{regexp.MustCompile(`(?i)data-admin\b`), "debug_attr", "data-admin attribute"},
	{regexp.MustCompile(`(?i)data-debug\b`), "debug_attr", "data-debug attribute"},
	{regexp.MustCompile(`(?i)data-test\b`), "debug_attr", "data-test attribute"},
	{regexp.MustCompile(`(?i)<!--[\s\S]*?-->`), "html_comment", "HTML comment"},
	{regexp.MustCompile(`(?i)\sdisabled\b`), "disabled", "disabled element"},
}

// routePatterns detect references to sensitive routes in HTML/JS source.
var routePatterns = []hiddenPattern{
	{regexp.MustCompile(`(?i)["'](/admin[/"'])`), "route_leak", "admin route reference"},
	{regexp.MustCompile(`(?i)["'](/debug[/"'])`), "route_leak", "debug route reference"},
	{regexp.MustCompile(`(?i)["'](/test[/"'])`), "route_leak", "test route reference"},
	{regexp.MustCompile(`(?i)["'](/api/[^"']*["'])`), "route_leak", "API route reference"},
	{regexp.MustCompile(`(?i)__NEXT_DATA__`), "framework_leak", "Next.js data leak"},
	{regexp.MustCompile(`(?i)window\.__[A-Z]`), "framework_leak", "global state leak"},
	{regexp.MustCompile(`(?i)console\.(log|debug|info|warn|error)\s*\(`), "debug_code", "console output in production"},
}

// extractContext returns surrounding text around a match for context.
func extractContext(html string, matchStart, matchEnd int) string {
	contextRadius := 80
	start := matchStart - contextRadius
	if start < 0 {
		start = 0
	}
	end := matchEnd + contextRadius
	if end > len(html) {
		end = len(html)
	}

	ctx := html[start:end]
	ctx = strings.ReplaceAll(ctx, "\n", " ")
	ctx = strings.ReplaceAll(ctx, "\r", " ")
	ctx = strings.Join(strings.Fields(ctx), " ")

	const maxContextLen = 300
	if utf8.RuneCountInString(ctx) > maxContextLen {
		ctx = truncateUTF8(ctx, maxContextLen)
	}

	if start > 0 {
		ctx = "..." + ctx
	}
	if end < len(html) {
		ctx = ctx + "..."
	}
	return ctx
}

func scanForHidden(html string) []hiddenElement {
	const maxElements = 50

	var results []hiddenElement
	seen := make(map[string]bool)

	allPatterns := append(hiddenPatterns, routePatterns...)

	for _, p := range allPatterns {
		if len(results) >= maxElements {
			break
		}
		matches := p.Pattern.FindAllStringIndex(html, maxElements-len(results))
		for _, loc := range matches {
			key := fmt.Sprintf("%s:%d:%d", p.Type, loc[0], loc[1])
			if seen[key] {
				continue
			}
			seen[key] = true

			ctx := extractContext(html, loc[0], loc[1])
			results = append(results, hiddenElement{
				Selector: p.Label,
				Type:     p.Type,
				Context:  ctx,
			})

			if len(results) >= maxElements {
				break
			}
		}
	}

	return results
}

func summarize(elements []hiddenElement) string {
	counts := make(map[string]int)
	for _, e := range elements {
		counts[e.Type]++
	}

	types := make([]string, 0, len(counts))
	for typ := range counts {
		types = append(types, typ)
	}
	sort.Strings(types)

	var parts []string
	for _, typ := range types {
		parts = append(parts, fmt.Sprintf("%s: %d", typ, counts[typ]))
	}

	if len(parts) == 0 {
		return "No hidden elements detected."
	}

	return fmt.Sprintf("Found %d hidden elements. Breakdown: %s", len(elements), strings.Join(parts, ", "))
}

// NewFindHiddenTool creates an ADK tool that scans page HTML for hidden DOM elements,
// debug attributes, route leaks, and other indicators of hidden functionality.
func NewFindHiddenTool(client *supacrawl.Client) (tool.Tool, error) {
	findHiddenFn := func(tc tool.Context, args findHiddenArgs) (findHiddenResult, error) {
		resp, err := client.Scrape(tc, args.URL, supacrawl.ScrapeOptions{
			Format:      "markdown",
			IncludeHTML: true,
			Fresh:       true,
		})
		if err != nil {
			return findHiddenResult{}, fmt.Errorf("find_hidden scrape %s: %w", args.URL, err)
		}

		if err := stateAppendString(tc.State(), StateKeyVisitedURLs, args.URL); err != nil {
			slog.Warn("failed to update visited_urls state", "url", args.URL, "error", err)
		}

		html := resp.HTML
		if html == "" {
			return findHiddenResult{
				URL:     args.URL,
				Found:   0,
				Summary: "No HTML content returned. The page may require JavaScript rendering or the scraper could not retrieve the source.",
			}, nil
		}

		elements := scanForHidden(html)

		result := findHiddenResult{
			URL:      args.URL,
			Found:    len(elements),
			Elements: elements,
			Summary:  summarize(elements),
		}

		if utf8.RuneCountInString(result.Summary) > 2000 {
			result.Summary = truncateUTF8(result.Summary, 2000) + "... [truncated]"
		}

		return result, nil
	}

	return functiontool.New(
		functiontool.Config{
			Name:        "find_hidden",
			Description: "Scan a web page for hidden DOM elements, debug attributes, sensitive route references, and framework data leaks. Returns categorized findings with surrounding context. Use this when you suspect a page has hidden admin panels, debug tools, or client-side secrets.",
		},
		findHiddenFn,
	)
}
