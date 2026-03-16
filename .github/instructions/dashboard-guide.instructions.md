# Observer Dashboard Guide

Standard for building and reviewing the G.O.L.E.M. observer UI.

Applies to all files under `apps/observer/src/`. Covers component selection, UX patterns, accessibility, and theme compliance.

---

## 1. Page Structure

The observer is a single-page dashboard for viewing agent traces:

```
App (root)
  Header (branding, mode toggles, reload)
  ScenarioLauncher (run controls)
  TracePicker (file selector)
  SummaryHeader (KPI cards)
  ReplayControls (when replay mode active)
  Tabs
    Timeline (event list with expandable detail)
    Raw JSON (formatted trace dump)
    Screenshots (image gallery)
```

Split concerns into co-located files. No file should exceed 300 lines. Extract components when it grows.

---

## 2. Component Selection

### Hard rules

- Never use raw `<button>` -- use shadcn `Button` with appropriate `variant` and `size`.
- Never use raw `<input>` -- use shadcn `Input`.
- Never use raw `<select>` -- use `ToggleGroup` for 2-5 options, `Combobox` for more.
- Never build custom progress bars -- use shadcn `Progress`.
- Never build custom toggle groups -- use shadcn `ToggleGroup`.
- All icon-only buttons must have `aria-label`.

### When to use what

| Need | Component |
|------|-----------|
| KPI display | `Card` with compact layout |
| Event list | `ScrollArea` + `Accordion` |
| File selector (2-8 items) | `ToggleGroup` or `Button` row |
| Speed selector (fixed set) | `ToggleGroup` |
| Progress indicator | `Progress` |
| Hover detail on badges | `Tooltip` |
| Status indicators | `Badge` with semantic color |
| Mode toggles | `Button` with `variant="outline"` or `variant="ghost"` |

### Installed shadcn components

accordion, badge, button, card, input, progress, scroll-area, separator, skeleton, tabs, toggle, toggle-group, tooltip

---

## 3. UX Principles

### 3.1 Information density

- Use `text-xs` and `text-sm` for data. Reserve `text-base`+ for headings only.
- Use `max-w-[1600px]` for the main content area -- `max-w-6xl` wastes space.
- Compact padding in data-dense areas (`p-3` or `p-4`, not `p-8`).

### 3.2 Color is semantic

| Color | Meaning |
|-------|---------|
| Green | Success, healthy, complete |
| Red | Error, failure, destructive |
| Blue | LLM calls, informational, running |
| Purple | Thinking, agent events |
| Orange | Tool calls, warnings |
| Cyan | Supplementary info |
| Muted (gray) | Inactive, neutral |

Never use color decoratively. If a badge is green, the user must infer "good" without reading.

### 3.3 Theme compliance

Use CSS custom properties for all neutral colors:

| Instead of | Use |
|------------|-----|
| `bg-zinc-950` | `bg-background` |
| `bg-zinc-900` | `bg-card` or `bg-muted` |
| `text-zinc-100` | `text-foreground` |
| `text-zinc-400` | `text-muted-foreground` |
| `text-zinc-500` | `text-muted-foreground` |
| `border-zinc-800` | `border-border` |
| `border-zinc-700` | `border-input` |

Semantic colors (green, red, blue, purple, orange) keep explicit Tailwind classes since they carry meaning.

### 3.4 Detail on demand

- Level 0: Summary cards (scannable in 2 seconds)
- Level 1: Timeline rows (type, title, duration visible)
- Level 2: Expand row (tool args, response text, thoughts)
- Level 3: Raw JSON tab (full trace data)

### 3.5 Tooltips

- Icon-only buttons: always add a `Tooltip`.
- Badges with abbreviations: add a `Tooltip`.
- Truncated text: add a `Tooltip` with full content.
- Keep tooltip text to 1-2 sentences max.

---

## 4. Accessibility

Baseline for every PR:

- [ ] All interactive elements reachable via Tab key
- [ ] Focus indicators visible (never remove `outline`)
- [ ] All icon-only buttons have `aria-label`
- [ ] Tooltips accessible via keyboard focus
- [ ] Color is never the only state indicator (pair with text or icon)

---

## 5. Code Review Checklist

### Components

- [ ] No raw `<button>`, `<input>`, or `<select>` -- use shadcn equivalents
- [ ] Tooltips on icon-only buttons and truncated text
- [ ] `ToggleGroup` for 2-5 option selectors
- [ ] Loading and error states handled in every data-dependent component
- [ ] No file exceeds 300 lines

### Theme

- [ ] No hardcoded zinc/gray colors for neutrals -- use CSS variables
- [ ] Semantic colors (green, red, blue) used consistently
- [ ] Tested in both light and dark themes (apply `.dark` class to `<html>`)

### Data

- [ ] API calls use centralized `API_BASE` constant
- [ ] Hooks in separate files, not inline
- [ ] Types in `types/` directory

---

## 6. Anti-Patterns

| Anti-pattern | Do this instead |
|-------------|-----------------|
| Raw `<button>` with inline styles | `Button variant="outline" size="sm"` |
| Raw `<input>` with inline styles | `Input` component |
| Custom progress bar div | `Progress` component |
| Hardcoded `bg-zinc-*` for neutrals | `bg-background`, `bg-card`, `bg-muted` |
| Icon button without label | Add `aria-label` prop |
| Custom toggle with state | `ToggleGroup` |
