# Copilot Review Handler

When the user asks you to address GitHub Copilot's or Gemini's review on a PR, follow this exact workflow:

## Step 1: Read All Review Comments

```bash
gh api repos/{owner}/{repo}/pulls/{pr}/comments --paginate -q '.[] | {id, path, line, body}'
```

Also read the review summary:

```bash
gh pr view {pr} --json reviews
```

## Step 2: Triage Each Comment

For each comment, decide one of three verdicts:

- **fix** -- Copilot/Gemini is correct. Implement the change.
- **reject** -- Copilot/Gemini is wrong or the suggestion would hurt the codebase. Explain why.
- **defer** -- Valid concern but out of scope for this PR. **You must have a GH issue number before you can use this verdict.** If the fix is small (< 20 lines, no behavioral risk), prefer **fix** over **defer**.

### Triage Criteria

1. **Is it factually correct?** Does the code actually have this problem?
2. **Is it a real risk?** Would this cause a bug, security issue, or maintenance burden?
3. **Is it in scope?** Does fixing it belong in this PR or a future one?
4. **Does the suggestion break anything?** Some suggestions introduce new issues.
5. **Can I just fix it now?** If the fix is small and safe, fix it instead of deferring.

## Step 3: Implement Fixes

For comments with verdict **fix**:

1. Make the code change
2. Run `go build ./...`, `go vet ./...`, `go test ./...`, `pre-commit run --all-files`
3. Stage all fixes into a single commit with message format:

```
fix({scope}): address review feedback

- {description of fix 1}
- {description of fix 2}
```

4. Push the commit

## Step 4: Reply to Every Comment

Reply to **every single comment** on GitHub:

```bash
gh api repos/{owner}/{repo}/pulls/{pr}/comments/{comment_id}/replies -f body='{reply}'
```

### Reply templates:

**For fixes:**
> Fixed in {commit_sha}. {Brief description of what changed}.

**For rejections:**
> {Explain why the current code is correct}. {Reference docs, patterns, or architectural decisions}.

**For deferrals:**
> Valid concern -- tracked in #{issue_number}. {Explain why it's out of scope}.

The `#{issue_number}` is **mandatory** for deferrals.

### Rules for replies:
- Be specific, not dismissive.
- If rejecting, explain the architectural reasoning.
- If deferring, always reference a specific issue number.
- Keep replies concise (2-3 sentences max).

## Step 4b: Track Deferred Items on GitHub Issues

**Complete Step 4b BEFORE Step 4 for any deferred items.** Create or identify the GH issue first, then write the reply with the issue number.

## Step 5: Resolve Threads

After replying, resolve review threads using GraphQL:

```bash
gh api graphql -f query='
query {
  repository(owner: "{owner}", name: "{repo}") {
    pullRequest(number: {pr}) {
      reviewThreads(first: 100) {
        nodes { id isResolved comments(first: 1) { nodes { body } } }
      }
    }
  }
}'

gh api graphql -f query='
mutation {
  resolveReviewThread(input: {threadId: "{thread_id}"}) {
    thread { isResolved }
  }
}'
```

### What to resolve

- **fix**: Always resolve after the fix is committed.
- **reject**: Resolve after replying with the rejection rationale. The thread is settled.
- **defer**: Resolve ONLY IF the reply contains a concrete `#{issue_number}`. The issue is now the tracking mechanism, not the thread.

### What to keep open

- Deferred items where no issue has been created yet (this should not happen -- see Step 4b).
- Items that need the human reviewer's input or decision before proceeding.

## Step 6: Summarize to User

| # | File | Comment | Verdict | Action |
|---|------|---------|---------|--------|
| 1 | file.go | description | [fix] | Fixed in abc123 |
| 2 | file.go | description | [reject] | Reason |
| 3 | file.go | description | [defer] | Tracked in #N |

## When to Push Back (reject)

### Valid reasons to reject
- **Framework constraint**: The suggestion is incompatible with how ADK-Go v0.6.0 actually works (e.g., OutputSchema and Tools are mutually exclusive).
- **Architectural conflict**: Contradicts a documented design decision in AGENTS.md.
- **Introduces a new bug**: The suggestion would break existing behavior.
- **Misunderstands the code path**: The reviewer misread the code (e.g., `iter.Seq2` vs two channels).

### How to reject properly
1. **Cite the source**: link to framework source, docs, or AGENTS.md.
2. **Explain the constraint**: why the suggestion cannot work.
3. **Propose the alternative**: what we do instead and why.

## Common AI Reviewer False Positives

- **`for event, err := range r.Run(...)`**: ADK v0.6.0 `runner.Run` returns `iter.Seq2`, making this valid Go 1.23+ syntax. Reviewers may incorrectly flag this as needing a `select` statement.
- **Framework feature suggestions**: Suggesting ADK features without checking version constraints.
- **Intentionally lenient validation**: When a safety net exists at a higher level.
- **Missing error handling**: Sometimes errors are intentionally propagated to a higher-level handler.
