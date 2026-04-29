# Polish

Visual CSS editor that runs on your live page. Click any element, tweak its styles in a properties panel, and changes write back to your source CSS files.

## Usage

### Static site (HTML + CSS)

Polish serves your site and injects the editor overlay:

```bash
polish --dir ./my-site
# → open http://localhost:3000
```

### Existing dev server (React, Vite, etc.)

If you already have a dev server running, Polish runs alongside it as a side-channel. It watches your source files and serves only the overlay — your dev server handles everything else.

```bash
# Terminal 1: your dev server
npm run dev  # → running on http://localhost:5173

# Terminal 2: start Polish
polish --src ./src --port 3456
```

Polish prints a one-liner to paste in your browser console. This injects the overlay into your running page:

```js
(()=>{let s=document.createElement('script');s.src='http://localhost:3456/overlay.js';document.body.appendChild(s)})()
```

**Why a separate port?** Polish needs a WebSocket connection between the browser overlay and the Node.js process that reads/writes your CSS files. Your dev server doesn't know about Polish, so Polish runs its own lightweight server for this communication channel. The overlay is injected into your page cross-origin — your dev server, HMR, and everything else continue working normally.

### Options

| Flag | Description |
|------|-------------|
| `--dir <path>` | Serve a static site directory and inject the overlay |
| `--src <path>` | Watch source files for CSS (use with your own dev server) |
| `--port <number>` | Port for Polish server (default: 3000) |

## How it works

1. **Resolver** scans your project for CSS rules and maps elements to their source declarations
2. **Overlay** injects a properties panel into your page (inside a shadow DOM so it doesn't affect your styles)
3. **Live preview** applies changes instantly via inline styles on the element
4. **Writer** writes changes back to your CSS source files, matching the original selector and rule location
5. **Watcher** detects file changes and triggers CSS hot-reload in the browser

## Panel controls

- **Colors** — background, text, border color pickers
- **Typography** — font family, size, weight, line height
- **Size** — width, height sliders
- **Spacing** — visual box model editor (margin, padding, border)
- **Layout** — flex direction, align, distribute, gap
- **Effects** — opacity, border radius
