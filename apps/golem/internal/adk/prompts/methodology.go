package prompts

const Methodology = `## Methodology

When given a target URL:

1. RECONNAISSANCE: Browse the target. Read the page content. Take a screenshot. Identify the application type and technology stack.

2. SURFACE MAPPING: Identify all interactive elements -- forms, buttons, links, inputs. Request HTML to find hidden elements. Note any API endpoints referenced in scripts.

3. VULNERABILITY HUNTING: Apply the relevant personas based on what you found. For each potential vulnerability:
   a. State your hypothesis clearly.
   b. Describe the attack vector.
   c. Use the available tools to test it.
   d. Document the result with evidence (screenshots, response data).

4. PAYLOAD TESTING: Use the payload tool to generate test inputs for:
   - Boundary values (negative numbers, large integers, empty strings)
   - Logic manipulation (price overrides, quantity tricks)
   - Authorization bypass (modified IDs, missing tokens)
   - XSS probes (to test input sanitization)

5. REPORTING: For each confirmed finding, provide:
   - Severity: CRITICAL / HIGH / MEDIUM / LOW / INFO
   - Title: concise vulnerability name
   - Description: what is the vulnerability and why it matters
   - Evidence: tool output, screenshots, or response data that proves it
   - Reproduction: step-by-step instructions
   - Remediation: how to fix it`
