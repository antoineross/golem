package adk

import (
	"fmt"
	"log/slog"
	"strings"
	"unicode/utf8"

	"golem/internal/supacrawl"

	"google.golang.org/adk/tool"
	"google.golang.org/adk/tool/functiontool"
)

type echoArgs struct {
	Message string `json:"message" jsonschema:"The message to echo back"`
}

type echoResult struct {
	Reply string `json:"reply"`
}

func echo(_ tool.Context, args echoArgs) (echoResult, error) {
	return echoResult{Reply: fmt.Sprintf("echo: %s", args.Message)}, nil
}

func NewEchoTool() (tool.Tool, error) {
	return functiontool.New(
		functiontool.Config{
			Name:        "echo",
			Description: "Echoes back a message. Use this to test that tool calling works.",
		},
		echo,
	)
}

type browseArgs struct {
	URL         string `json:"url" jsonschema:"The URL to browse and scrape content from"`
	IncludeHTML bool   `json:"include_html,omitempty" jsonschema:"Whether to include raw HTML in the response"`
	Fresh       bool   `json:"fresh,omitempty" jsonschema:"Bypass cache and fetch fresh content"`
}

type browseResult struct {
	URL        string   `json:"url"`
	Title      string   `json:"title"`
	Content    string   `json:"content"`
	HTML       string   `json:"html,omitempty"`
	Links      []string `json:"links"`
	StatusCode int      `json:"status_code"`
}

// NewBrowseTool creates an ADK tool that scrapes a URL via the Supacrawl API.
// The agent sees the page as markdown + metadata, enabling DOM-level reasoning.
func NewBrowseTool(client *supacrawl.Client, guard ...*ToolGuard) (tool.Tool, error) {
	var g *ToolGuard
	if len(guard) > 0 {
		g = guard[0]
	}
	browseFn := func(tc tool.Context, args browseArgs) (browseResult, error) {
		if g != nil {
			if warn, err := g.RecordCall(); err != nil {
				return browseResult{}, err
			} else if warn != "" {
				slog.Warn(warn, "tool", "browse")
			}
		}
		resp, err := client.Scrape(tc, args.URL, supacrawl.ScrapeOptions{
			Format:      "markdown",
			IncludeHTML: args.IncludeHTML,
			Fresh:       args.Fresh,
		})
		if err != nil {
			return browseResult{}, fmt.Errorf("browse %s: %w", args.URL, err)
		}

		if err := stateAppendString(tc.State(), StateKeyVisitedURLs, args.URL); err != nil {
			slog.Warn("failed to update visited_urls state", "url", args.URL, "error", err)
		}

		links := resp.Links
		if len(links) > 50 {
			links = links[:50]
		}

		content := resp.Content
		if utf8.RuneCountInString(content) > 8000 {
			content = truncateUTF8(content, 8000) + "\n... [truncated]"
		}

		html := resp.HTML
		if utf8.RuneCountInString(html) > 8000 {
			html = truncateUTF8(html, 8000) + "\n... [truncated]"
		}

		return browseResult{
			URL:        resp.URL,
			Title:      resp.Title,
			Content:    content,
			HTML:       html,
			Links:      links,
			StatusCode: resp.Metadata.StatusCode,
		}, nil
	}

	return functiontool.New(
		functiontool.Config{
			Name:        "browse",
			Description: "Browse a web page and get its content as markdown. Returns the page title, markdown content, links, and HTTP status. Use this to read and analyze web pages.",
		},
		browseFn,
	)
}

type screenshotArgs struct {
	URL             string `json:"url" jsonschema:"The URL to take a screenshot of"`
	FullPage        bool   `json:"full_page,omitempty" jsonschema:"Capture the full scrollable page instead of just the viewport"`
	ClickSelector   string `json:"click_selector,omitempty" jsonschema:"CSS selector of an element to click before taking the screenshot"`
	WaitForSelector string `json:"wait_for_selector,omitempty" jsonschema:"CSS selector to wait for before taking the screenshot"`
}

type screenshotResult struct {
	URL           string `json:"url"`
	ScreenshotURL string `json:"screenshot_url"`
	Width         int    `json:"width"`
	Height        int    `json:"height"`
	Format        string `json:"format"`
	LoadTime      int    `json:"load_time_ms"`
}

// NewScreenshotTool creates an ADK tool that takes screenshots via the Supacrawl API.
// Returns the screenshot URL which can be fetched for multimodal analysis.
func NewScreenshotTool(client *supacrawl.Client, guard ...*ToolGuard) (tool.Tool, error) {
	var g *ToolGuard
	if len(guard) > 0 {
		g = guard[0]
	}
	screenshotFn := func(tc tool.Context, args screenshotArgs) (screenshotResult, error) {
		if g != nil {
			if warn, err := g.RecordCall(); err != nil {
				return screenshotResult{}, err
			} else if warn != "" {
				slog.Warn(warn, "tool", "screenshot")
			}
			if g.FailureCount("screenshot", args.URL) >= 3 {
				return screenshotResult{}, fmt.Errorf("screenshot for %s has failed %d times, try a different approach", args.URL, g.FailureCount("screenshot", args.URL))
			}
		}
		resp, err := client.Screenshot(tc, supacrawl.ScreenshotRequest{
			URL:             args.URL,
			FullPage:        args.FullPage,
			Format:          "png",
			WaitUntil:       "networkidle",
			ClickSelector:   args.ClickSelector,
			WaitForSelector: args.WaitForSelector,
			BlockAds:        true,
		})
		if err != nil {
			if g != nil {
				g.RecordFailure("screenshot", args.URL)
			}
			return screenshotResult{}, fmt.Errorf("screenshot %s: %w", args.URL, err)
		}

		if err := stateAppendString(tc.State(), StateKeyScreenshots, resp.Screenshot); err != nil {
			slog.Warn("failed to update screenshots state", "url", args.URL, "error", err)
		}

		width, height, format := 0, 0, "png"
		loadTime := 0
		if resp.Metadata != nil {
			width = resp.Metadata.Width
			height = resp.Metadata.Height
			if resp.Metadata.Format != "" {
				format = resp.Metadata.Format
			}
			loadTime = resp.Metadata.LoadTime
		}

		return screenshotResult{
			URL:           resp.URL,
			ScreenshotURL: resp.Screenshot,
			Width:         width,
			Height:        height,
			Format:        format,
			LoadTime:      loadTime,
		}, nil
	}

	return functiontool.New(
		functiontool.Config{
			Name:        "screenshot",
			Description: "Take a screenshot of a web page. Returns a URL to the screenshot image. Use this to visually inspect pages, find hidden elements, verify UI state, or capture evidence of vulnerabilities.",
		},
		screenshotFn,
	)
}

type clickArgs struct {
	URL      string `json:"url" jsonschema:"The URL of the page to interact with"`
	Selector string `json:"selector" jsonschema:"CSS selector of the element to click"`
}

type clickResult struct {
	URL           string `json:"url"`
	Clicked       string `json:"clicked_selector"`
	ScreenshotURL string `json:"screenshot_url"`
	Content       string `json:"content_after_click"`
}

// NewClickTool creates an ADK tool that clicks an element and returns the resulting state.
// Screenshot capture is best-effort: if it fails, click still returns the scraped content.
func NewClickTool(client *supacrawl.Client, guard ...*ToolGuard) (tool.Tool, error) {
	var g *ToolGuard
	if len(guard) > 0 {
		g = guard[0]
	}
	clickFn := func(tc tool.Context, args clickArgs) (clickResult, error) {
		if g != nil {
			if warn, err := g.RecordCall(); err != nil {
				return clickResult{}, err
			} else if warn != "" {
				slog.Warn(warn, "tool", "click")
			}
		}
		var screenshotURL string

		screenshotResp, err := client.Screenshot(tc, supacrawl.ScreenshotRequest{
			URL:           args.URL,
			ClickSelector: args.Selector,
			Format:        "png",
			WaitUntil:     "networkidle",
			BlockAds:      true,
			Delay:         2,
		})
		if err != nil {
			slog.Warn("click screenshot failed, continuing with scrape",
				"url", args.URL, "selector", args.Selector, "error", err)
		} else {
			screenshotURL = screenshotResp.Screenshot
			if err := stateAppendString(tc.State(), StateKeyScreenshots, screenshotURL); err != nil {
				slog.Warn("failed to update screenshots state", "url", args.URL, "error", err)
			}
		}

		if err := stateAppendString(tc.State(), StateKeyVisitedURLs, args.URL); err != nil {
			slog.Warn("failed to update visited_urls state", "url", args.URL, "error", err)
		}

		scrapeResp, scrapeErr := client.Scrape(tc, args.URL, supacrawl.ScrapeOptions{
			Format: "markdown",
			Fresh:  true,
		})

		content := ""
		if scrapeErr != nil {
			content = fmt.Sprintf("[scrape after click failed: %v]", scrapeErr)
		} else if scrapeResp != nil {
			content = scrapeResp.Content
			if utf8.RuneCountInString(content) > 4000 {
				content = truncateUTF8(content, 4000) + "\n... [truncated]"
			}
		}

		return clickResult{
			URL:           args.URL,
			Clicked:       args.Selector,
			ScreenshotURL: screenshotURL,
			Content:       content,
		}, nil
	}

	return functiontool.New(
		functiontool.Config{
			Name:        "click",
			Description: "Click an element on a web page by CSS selector. Takes a screenshot after clicking and returns the new page state. Use this to interact with buttons, links, forms, and other clickable elements.",
		},
		clickFn,
	)
}

// NewSupacrawlTools creates all Supacrawl-powered tools for the agent.
// A shared ToolGuard enforces per-tool retry limits (3 per URL) and a
// global step budget (50 tool calls).
func NewSupacrawlTools(client *supacrawl.Client) ([]tool.Tool, error) {
	guard := NewToolGuard(3, 50)
	var tools []tool.Tool
	var errs []string

	browse, err := NewBrowseTool(client, guard)
	if err != nil {
		errs = append(errs, fmt.Sprintf("browse: %v", err))
	} else {
		tools = append(tools, browse)
	}

	screenshot, err := NewScreenshotTool(client, guard)
	if err != nil {
		errs = append(errs, fmt.Sprintf("screenshot: %v", err))
	} else {
		tools = append(tools, screenshot)
	}

	click, err := NewClickTool(client, guard)
	if err != nil {
		errs = append(errs, fmt.Sprintf("click: %v", err))
	} else {
		tools = append(tools, click)
	}

	findHidden, err := NewFindHiddenTool(client)
	if err != nil {
		errs = append(errs, fmt.Sprintf("find_hidden: %v", err))
	} else {
		tools = append(tools, findHidden)
	}

	if len(errs) > 0 {
		return nil, fmt.Errorf("failed to create tools: %s", strings.Join(errs, "; "))
	}

	return tools, nil
}
