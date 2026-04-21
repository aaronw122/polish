# Polish — Implementation Plan

## Scope

**What we're building:** A minimalist, open-source version of Paper that runs in the browser. A Node CLI tool that lets you visually edit colors, fonts, sizes, and spacing on a live HTML/CSS page. Every change writes to your source files. Inspired by Paper's direct manipulation UX, but local-first, open source, and working on your actual code — not a proprietary canvas.

**What we're NOT building (yet):**
- No AI/prompting integration
- No Claude Code terminal
- No framework support (React, Vue, etc.)
- No Zig/native app
- No webview — just your browser
- No collaboration features
- No undo/redo system (use git)
- No component creation or structural DOM changes

## The Loop

```
npx polish --port 3000
        ↓
Proxy wraps your localhost, injects overlay JS
        ↓
User clicks an element
        ↓
Overlay reads: element tag, bounding box, computed styles
Backend resolves: which source file, which line, which CSS rule
        ↓
Manipulation panel appears (color, font, size, spacing)
        ↓
User adjusts a value
        ↓
Backend writes to .html/.css file
        ↓
Live reload → browser reflects the change
```

## Milestones

### M1: CLI + Proxy + Overlay Injection
**Goal:** `npx polish --port 3000` opens browser with overlay running on your page.

- [x] Node CLI entry point (`bin/polish`)
- [x] Accept `--port` flag (default 3000) pointing at user's existing dev server
- [x] HTTP proxy that sits in front of the user's dev server
- [x] Inject overlay `<script>` tag into HTML responses — the proxy intercepts HTML from the user's dev server and appends a `<script>` tag before `</body>` that loads Polish's overlay JS. Source files are never modified. The injection only exists in the proxied response the browser sees.
- [x] Overlay JS: on hover, highlight elements with a bounding box outline
- [x] Overlay JS: on click, select element, show selection indicator
- [x] Polish runs on its own port (e.g., 3001), proxying to the user's port
- [x] Toggle commands:
  - Keyboard shortcut to toggle overlay on/off (e.g., `Cmd+Shift+P`)
  - When off: page behaves normally, no highlights, no interception
  - When on: hover highlights, click selects, manipulation panel available
  - Visual indicator showing Polish is active (small badge in corner)

**Done when:** You can run `npx polish --port 3000`, open `localhost:3001`, hover over elements and see them highlighted, click to select.

### M2: Source Resolution
**Goal:** Click an element → know which file and line it comes from.

- [x] Parse the user's project directory for `.html` and `.css` files
- [x] Build a map: CSS selectors → file:line (parse CSS files, track rule positions)
- [x] For inline styles: map to the HTML element's line in the `.html` file
- [x] For `<style>` blocks: map to the line within the HTML file
- [x] For linked stylesheets: map to the line in the `.css` file
- [x] WebSocket server (Polish process) ↔ overlay JS (frontend) communication
- [x] On element select: overlay sends element info (tag, id, classes, inline styles) to Polish process
- [x] Backend responds with: source file, line number, current CSS properties, which rule matched

**Done when:** Click any element → Polish process logs the correct source file, line number, and matching CSS rule.

### M3: Manipulation Panel
**Goal:** Visual controls appear when you select an element.

- [x] Floating panel UI anchored near the selected element
- [x] **Color pickers** — background-color, color (text), border-color
- [x] **Font controls** — font-family dropdown, font-size slider, font-weight selector
- [x] **Size controls** — width/height sliders (px, %, auto)
- [x] **Spacing controls** — padding and margin (per-side or uniform), drag handles on box model visualization
- [x] **Border radius** — slider
- [x] **Opacity** — slider
- [x] Panel reads current computed values and initializes controls to match
- [x] Panel sends value changes to Polish process over WebSocket

**Done when:** Select an element → panel shows its current styles → you can adjust values and see them sent to the Polish process.

### M4: Deterministic Write-back
**Goal:** Adjusting a control writes to the source file.

- [x] Receive property change from overlay (e.g., `{ file: "styles.css", selector: ".card", property: "padding", value: "24px" }`)
- [x] Read the source file and re-parse it with PostCSS at write time
- [x] Locate the target declaration by selector + property name (AST-based) — line numbers from M2 source resolution serve as a search hint only, not the primary locator, because line numbers shift after every write
- [x] Write the new value (or add the declaration if it doesn't exist in the rule)
- [x] Handle shorthand expansion: when editing a longhand property (e.g., `padding-left`) and the source uses a shorthand (`padding: 10px 20px`), expand the shorthand into individual longhand declarations (e.g., `padding-top`, `padding-right`, `padding-bottom`, `padding-left`) before writing the target value. Required for M3's per-side spacing controls to function.
- [x] Handle inline styles: modify the `style=""` attribute in the HTML file
- [x] Handle `<style>` blocks: modify within the HTML file
- [x] Handle linked `.css` files: modify the CSS file directly
- [x] Preserve formatting — don't rewrite the entire file, surgical edit only

**Done when:** Change a color in the panel → the correct hex value appears in the correct CSS file at the correct line.

### M5: Live Reload
**Goal:** After writing to a file, the browser reflects the change instantly.

- [x] File watcher on the project directory (`.html`, `.css`, `.js`)
- [x] On file change: send reload signal over WebSocket to overlay
- [x] For CSS changes: hot-swap the stylesheet without full page reload (inject updated `<link>` or `<style>`)
- [x] For HTML changes: full page reload (preserve selection state if possible)
- [x] Debounce rapid changes (e.g., dragging a slider)

**Done when:** Drag a padding slider → file updates → page reflects the new padding in real-time as you drag. No manual refresh.

### M6: Polish & Edge Cases
**Goal:** Handle real-world HTML/CSS projects without breaking.

- [x] Multiple CSS files — resolve specificity, know which rule wins
- [x] Cascading rules — show which rule is active vs overridden
- [x] Media queries — handle responsive rules (show which breakpoint is active)
- [x] Shorthand properties — UI for showing when a longhand value was expanded from a shorthand (expansion itself handled in M4)
- [x] `!important` — handle and display
- [x] Pseudo-classes — indicate hover/focus/active states exist (but don't edit them in v1)
- [x] Elements with no explicit styles — adding a new rule when none exists
- [x] Nested elements — clear visual indication of what's selected vs parent
- [x] Keyboard shortcuts — Escape to deselect, Tab to cycle elements
- [x] Panel positioning — keep it on-screen, avoid overlapping the selected element

## Tech Stack

| Component | Choice | Why |
|-----------|--------|-----|
| CLI | Node.js + `commander` or `yargs` | Standard, everyone has Node |
| Proxy | `http-proxy` or `http-proxy-middleware` | Mature, handles WebSocket passthrough |
| WebSocket | `ws` | Standard Node WebSocket library |
| CSS parsing | `postcss` | Read/write CSS with full position tracking |
| HTML parsing | `htmlparser2` or `parse5` | Position-aware HTML parsing |
| File watching | `chokidar` | Cross-platform, reliable |
| Overlay UI | Vanilla JS + CSS | No framework dependency injected into user's page |

## File Structure

```
polish/
├── bin/
│   └── polish              # CLI entry point
├── src/
│   ├── cli.js              # Argument parsing, startup
│   ├── proxy.js            # HTTP proxy + script injection
│   ├── server.js           # WebSocket server
│   ├── resolver.js         # Source resolution (element → file:line)
│   ├── writer.js           # Deterministic file writes
│   ├── watcher.js          # File watching + reload signals
│   └── overlay/
│       ├── overlay.js      # Injected into user's page — element selection, panel UI
│       └── overlay.css     # Styles for the overlay (scoped, won't leak)
├── package.json
└── README.md
```

## Open Decisions

- **Panel design** — Minimal floating card? Sidebar? Bottom bar? Start with floating card near element, iterate.
- **CSS specificity conflicts** — When multiple rules match, which one does Polish edit? Start with: edit the most specific matching rule. Show a dropdown if ambiguous.
- **New properties** — If an element has no `border-radius` rule, where does Polish add one? To the most specific existing rule for that element.
- **npm package name** — Check if `polish` is available on npm. Fallback: `polish-ui`, `polishcss`, `polish-dev`.
