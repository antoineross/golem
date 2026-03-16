package adk

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"golem/internal/supacrawl"
)

func TestScanForHidden_DisplayNone(t *testing.T) {
	html := `<div style="display: none" id="admin-panel"><a href="/admin">Admin</a></div>`
	elements := scanForHidden(html)

	found := false
	for _, e := range elements {
		if e.Type == "css_hidden" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected to find css_hidden element for display:none")
	}
}

func TestScanForHidden_VisibilityHidden(t *testing.T) {
	html := `<div style="visibility: hidden"><button>Delete All Users</button></div>`
	elements := scanForHidden(html)

	found := false
	for _, e := range elements {
		if e.Type == "css_hidden" && e.Selector == "visibility:hidden" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected to find css_hidden element for visibility:hidden")
	}
}

func TestScanForHidden_HiddenInput(t *testing.T) {
	html := `<input type="hidden" name="is_admin" value="false">`
	elements := scanForHidden(html)

	found := false
	for _, e := range elements {
		if e.Type == "hidden_input" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected to find hidden_input element")
	}
}

func TestScanForHidden_DebugAttribute(t *testing.T) {
	html := `<div data-admin="true" data-debug="verbose">Secret Panel</div>`
	elements := scanForHidden(html)

	count := 0
	for _, e := range elements {
		if e.Type == "debug_attr" {
			count++
		}
	}
	if count < 2 {
		t.Errorf("expected at least 2 debug_attr findings, got %d", count)
	}
}

func TestScanForHidden_AdminRoute(t *testing.T) {
	html := `<script>const routes = ["/admin", "/api/users"];</script>`
	elements := scanForHidden(html)

	foundAdmin := false
	foundAPI := false
	for _, e := range elements {
		if e.Type == "route_leak" && e.Selector == "admin route reference" {
			foundAdmin = true
		}
		if e.Type == "route_leak" && e.Selector == "API route reference" {
			foundAPI = true
		}
	}
	if !foundAdmin {
		t.Error("expected to find admin route_leak")
	}
	if !foundAPI {
		t.Error("expected to find API route_leak")
	}
}

func TestScanForHidden_NextData(t *testing.T) {
	html := `<script id="__NEXT_DATA__" type="application/json">{"props":{"user":"admin"}}</script>`
	elements := scanForHidden(html)

	found := false
	for _, e := range elements {
		if e.Type == "framework_leak" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected to find framework_leak for __NEXT_DATA__")
	}
}

func TestScanForHidden_ConsoleLog(t *testing.T) {
	html := `<script>console.log("debug: user token = abc123");</script>`
	elements := scanForHidden(html)

	found := false
	for _, e := range elements {
		if e.Type == "debug_code" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected to find debug_code for console.log")
	}
}

func TestScanForHidden_Deduplication(t *testing.T) {
	html := `<div style="display: none">A</div><div style="display: none">B</div>`
	elements := scanForHidden(html)

	cssCount := 0
	for _, e := range elements {
		if e.Type == "css_hidden" && e.Selector == "display:none" {
			cssCount++
		}
	}
	if cssCount != 2 {
		t.Errorf("expected 2 css_hidden display:none elements (different positions), got %d", cssCount)
	}
}

func TestScanForHidden_EmptyHTML(t *testing.T) {
	elements := scanForHidden("")
	if len(elements) != 0 {
		t.Errorf("expected 0 elements for empty HTML, got %d", len(elements))
	}
}

func TestScanForHidden_MaxElements(t *testing.T) {
	var html string
	for i := 0; i < 100; i++ {
		html += fmt.Sprintf(`<input type="hidden" name="field_%d" value="%d">`, i, i)
	}
	elements := scanForHidden(html)

	if len(elements) > 50 {
		t.Errorf("expected max 50 elements, got %d", len(elements))
	}
}

func TestSummarize_NoElements(t *testing.T) {
	summary := summarize(nil)
	if summary != "No hidden elements detected." {
		t.Errorf("unexpected summary for nil: %q", summary)
	}
}

func TestSummarize_WithElements(t *testing.T) {
	elements := []hiddenElement{
		{Type: "css_hidden"},
		{Type: "css_hidden"},
		{Type: "hidden_input"},
	}
	summary := summarize(elements)
	if summary == "" || summary == "No hidden elements detected." {
		t.Error("expected non-empty summary with elements")
	}
}

func TestExtractContext_Short(t *testing.T) {
	html := `<div style="display:none">secret</div>`
	ctx := extractContext(html, 5, 26)
	if ctx == "" {
		t.Error("expected non-empty context")
	}
	if len(ctx) > 300 {
		t.Error("context should be bounded")
	}
}

func TestNewFindHiddenTool_Registration(t *testing.T) {
	client := supacrawl.NewClientWithURL("http://localhost:9999")
	tool, err := NewFindHiddenTool(client)
	if err != nil {
		t.Fatalf("NewFindHiddenTool() error: %v", err)
	}
	if tool.Name() != "find_hidden" {
		t.Errorf("expected tool name 'find_hidden', got %q", tool.Name())
	}
}

func TestScanForHidden_OpacityZero(t *testing.T) {
	html := `<div style="opacity: 0"><form action="/admin/delete">Delete</form></div>`
	elements := scanForHidden(html)

	found := false
	for _, e := range elements {
		if e.Type == "css_hidden" && e.Selector == "opacity:0" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected to find css_hidden element for opacity:0")
	}
}

func TestScanForHidden_HTMLComment(t *testing.T) {
	html := `<!-- TODO: remove admin bypass: /admin?bypass=true --><div>normal content</div>`
	elements := scanForHidden(html)

	found := false
	for _, e := range elements {
		if e.Type == "html_comment" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected to find html_comment element")
	}
}

func TestFindHiddenTool_Integration(t *testing.T) {
	mockHTML := `<html>
<body>
  <div style="display: none" id="admin-panel">
    <a href="/admin/dashboard">Admin Dashboard</a>
    <input type="hidden" name="role" value="admin">
  </div>
  <div data-debug="true">Debug info</div>
  <script>console.log("token: abc123");</script>
  <!-- Secret API: /api/internal/users -->
</body>
</html>`

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := map[string]any{
			"success": true,
			"url":     "http://example.com",
			"title":   "Test Page",
			"content": "Test content",
			"html":    mockHTML,
			"links":   []string{},
			"metadata": map[string]any{
				"status_code": 200,
			},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := supacrawl.NewClientWithURL(server.URL)

	_, err := NewFindHiddenTool(client)
	if err != nil {
		t.Fatalf("NewFindHiddenTool() error: %v", err)
	}

	// ADK tool.Context cannot be constructed outside the ADK internals,
	// so we test scanForHidden directly with the mock HTML.
	elements := scanForHidden(mockHTML)
	if len(elements) < 5 {
		t.Errorf("expected at least 5 hidden elements from mock HTML, got %d", len(elements))
	}

	typesSeen := make(map[string]bool)
	for _, e := range elements {
		typesSeen[e.Type] = true
	}
	for _, expected := range []string{"css_hidden", "hidden_input", "debug_attr", "debug_code", "html_comment"} {
		if !typesSeen[expected] {
			t.Errorf("expected to find type %q in scan results", expected)
		}
	}
}
