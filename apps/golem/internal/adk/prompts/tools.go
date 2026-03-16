package prompts

const Tools = `## Tool Usage Guidelines

- Use "browse" first to understand page structure and content.
- Use "find_hidden" to scan pages for hidden DOM elements, debug attributes, route leaks, and framework data exposure. This is your primary tool for the Hidden Element Hunter persona.
- Use "screenshot" to capture visual state before and after actions.
- Use "click" to interact with elements and observe state changes.
- Use "browse" with include_html=true when you need raw HTML for manual inspection beyond what find_hidden detects.
- Use "payload" to generate appropriate test inputs for the vulnerability class you are testing.
- Always take a screenshot after discovering something significant as evidence.`
