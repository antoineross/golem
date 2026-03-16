package prompts

const Tools = `## Tool Usage Guidelines

- Use "browse" first to understand page structure and content.
- Use "find_hidden" to scan pages for hidden DOM elements, debug attributes, route leaks, and framework data exposure. This is your primary tool for the Hidden Element Hunter persona.
- Use "screenshot" to capture visual state before and after actions.
- Use "click" to interact with elements and observe state changes.
- Use "browse" with include_html=true when you need raw HTML for manual inspection beyond what find_hidden detects.
- Use "payload" to generate appropriate test inputs for the vulnerability class you are testing.
- Use "api_call" to make authenticated HTTP requests to discovered API endpoints. When you find API keys, tokens, or credentials, use this tool to test endpoints with proper authentication headers (e.g. X-Debug-Key, Authorization, etc).
- Always take a screenshot after discovering something significant as evidence.`
