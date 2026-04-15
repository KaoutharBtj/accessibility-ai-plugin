# CSS Accessibility Checker — VSCode Extension POC

Real-time WCAG accessibility detection for CSS/HTML inside VS Code, powered by **jsdom** + **axe-core**.

---

## Architecture Pipeline

```
User edits HTML or CSS
        │
        ▼
onDidChangeTextDocument (VS Code API)
        │
        ▼
debounce(500ms)          ← avoids analysis on every keystroke
        │
        ▼
cssResolver.ts
  ├── HTML doc?  → extract <link href> → read local .css files
  └── CSS doc?   → find linked HTML files in workspace
        │
        ▼
jsdom: create virtual DOM from HTML string
        │
        ▼
Inject CSS via <style> tag into virtual DOM
        │
        ▼
Inject axe-core script into virtual DOM window
        │
        ▼
axe.run(document, { runOnly: ['wcag2aa'] })
        │
        ▼
Map violations → A11yIssue[]
        │
        ▼
DiagnosticsManager.update(uri, issues)
        │
        ▼
VS Code squiggly lines + Problems panel
```

---

## Project Structure

```
css-a11y-poc/
├── src/
│   ├── extension.ts          # Activation, event listeners, debounce wiring
│   ├── analyzer.ts           # Core jsdom + axe-core analysis pipeline
│   ├── cssResolver.ts        # Finds & loads CSS linked from HTML files
│   ├── diagnosticsManager.ts # Converts issues to VS Code Diagnostics
│   └── utils.ts              # Debounce utility with .flush()
├── test-scenarios/
│   ├── scenario-01-contrast-fail.html        # Basic contrast violations
│   ├── scenario-02-override-contrast.html    # CSS specificity overrides
│   ├── scenario-03-large-text-exception.html # WCAG large text threshold
│   ├── scenario-04-css-variables.html        # CSS custom properties
│   ├── scenario-05-hard-limits.html          # Images, animations, JS styles
│   ├── scenario-06-focus-visibility.html     # Focus outline detection limits
│   └── scenario-07-external-css.html         # CDN / external stylesheets
├── poc-runner.js             # Standalone Node.js test runner
├── package.json
└── tsconfig.json
```

---

## Getting Started

```bash
# Install dependencies
npm install

# Run the standalone POC (no VS Code needed)
node poc-runner.js

# Compile TypeScript for VS Code extension
npm run compile

# Open in VS Code and press F5 to launch Extension Development Host
```

---

## Test Scenarios & Detected Issues

| Scenario | What It Tests | Plugin Detects? |
|---|---|---|
| 01 – Basic contrast fail | `color: #aaa` on `#fff` (2.32:1) | ✅ Yes |
| 02 – CSS override | Inherited low contrast via `.theme-muted` | ✅ Yes (jsdom resolves cascade) |
| 03 – Large text exception | 4.5:1 vs 3.0:1 threshold at 18px+ | ✅ Yes (axe-core handles this) |
| 04 – CSS variables | `color: var(--color-text)` from `:root` | ✅ Partial (see limits below) |
| 05 – Hard limits | Background images, animations, JS styles | ❌ See limitations |
| 06 – Focus visibility | `outline: none` globally | ❌ Static analysis can't detect |
| 07 – External CSS | CDN Bootstrap / local file | ✅ Local / ❌ CDN |

---

## Limitations & WCAG Coverage Boundaries

### ✅ What the approach handles well

| Issue | WCAG Criterion | Notes |
|---|---|---|
| Low contrast text (static) | 1.4.3 (AA), 1.4.6 (AAA) | Core strength — reliable |
| Large text threshold (3:1 ratio) | 1.4.3 | axe-core correctly uses computed font-size |
| CSS cascade & specificity | 1.4.3 | jsdom resolves the cascade correctly |
| Inline style violations | 1.4.3 | Works perfectly |
| Local linked stylesheets | 1.4.3 | cssResolver.ts loads them from disk |
| Missing alt text, ARIA roles | 1.1.1, 4.1.2 | axe-core catches these too (not CSS-specific) |

---

### ⚠️ Partial detection (false negatives possible)

#### 1. CSS Custom Properties (`--variables`)
- **Works:** Variables defined on `:root` in the same file
- **Fails:** Variables overridden inside `@media` (no viewport in jsdom)
- **Fails:** Variables set or overridden via JavaScript
- **WCAG impact:** 1.4.3 false negatives in dark mode / theme switching

#### 2. External CSS files
- **Works:** Files linked via `<link href="./local.css">` relative to the HTML
- **Fails:** CDN URLs (`cdn.jsdelivr.net`, `fonts.googleapis.com`, etc.)
- **Fails:** `@import url(...)` with absolute/CDN paths
- **WCAG impact:** Framework utility class violations (Bootstrap, Tailwind) go undetected

#### 3. Font-size in viewport / container units
- `font-size: 5vw` computes to `0px` in jsdom (no viewport simulation)
- This causes incorrect large-text threshold evaluation
- **WCAG impact:** May incorrectly apply 4.5:1 ratio to large text

---

### ❌ Structural limitations (undetectable by this approach)

#### 4. CSS Animations & Transitions
- Analysis runs once on the initial DOM snapshot
- A text color that fades from `#333` to `#eee` fails WCAG during animation
- The animated state is **never evaluated**
- **WCAG impact:** 1.4.3 animated contrast violations missed entirely

#### 5. Hover / Focus / Active pseudo-class states
- `:hover`, `:focus`, `:active`, `:visited` styles are **not applied** in jsdom
- `button:hover { color: #ddd }` contrast violation is invisible to the plugin
- **WCAG impact:** 1.4.3, 2.4.7 — interactive state violations not caught
- **Workaround (partial):** Manually add a static utility class that mimics the hover state for testing

#### 6. JavaScript-applied styles
- `element.style.color = '#ccc'` is not reflected in the static HTML snapshot
- CSS-in-JS (styled-components, Emotion, Tailwind JIT, Vue scoped styles) generates styles at runtime
- **WCAG impact:** Any dynamically themed or JS-driven UI is opaque to the plugin

#### 7. Background images and gradients
- axe-core uses CSS `background-color` property, ignoring `background-image`
- Text on a photo, hero image, or gradient may appear to pass even when visually failing
- **WCAG impact:** 1.4.3 on image backgrounds produces unreliable results

#### 8. Focus visibility (WCAG 2.4.7 / 2.4.11)
- axe-core's `focus-visible` rule requires the element to have received focus
- In a static DOM snapshot, no element is focused → rule cannot be evaluated
- `* { outline: none }` pattern **will not be flagged** reliably
- **WCAG impact:** 2.4.7, 2.4.11 essentially undetectable via this method

#### 9. `color-scheme` and `forced-colors` (Windows High Contrast)
- jsdom does not simulate `prefers-color-scheme: dark` or `forced-colors: active`
- Dark mode color overrides and OS-level color inversion are invisible
- **WCAG impact:** 1.4.3 violations that only appear in dark mode are missed

---

## Recommendations for Production Extension

| Gap | Mitigation |
|---|---|
| CDN stylesheets | Cache commonly used CDN bundles locally; or alert user that CDN CSS is excluded |
| Dark mode | Add a toggle to inject `prefers-color-scheme: dark` via JS before running axe |
| Hover/focus states | Offer a "simulate state" command that applies pseudo-class styles manually |
| Animations | Parse `@keyframes` and check contrast of each color stop separately |
| JS/framework styles | Integrate with a browser DevTools protocol (CDP) for live-page analysis |
| Performance | Worker thread for jsdom to avoid blocking the VS Code UI thread |

---

## WCAG Coverage Summary

| Criterion | Description | Coverage |
|---|---|---|
| 1.4.3 (AA) | Contrast minimum 4.5:1 (3:1 large text) | ✅ Static CSS / ⚠️ Partial dynamic |
| 1.4.6 (AAA) | Enhanced contrast 7:1 | ✅ via `color-contrast-enhanced` rule |
| 1.4.11 (AA) | Non-text contrast (UI components) | ✅ via axe-core |
| 2.4.7 (AA) | Focus visible | ❌ Static analysis insufficient |
| 2.4.11 (AA 2.2) | Focus appearance | ❌ Static analysis insufficient |
| 1.4.1 (A) | Use of color only | ✅ axe-core detects |
| 1.4.4 (AA) | Resize text | ❌ No viewport simulation |
