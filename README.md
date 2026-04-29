# Polish

Visual CSS editor that runs on your live page. Click any element, tweak its styles in a properties panel, and changes write back to your source CSS files.

## Usage

Polish proxies your running dev server and injects the editor overlay:

```bash
# Start your dev server first
npm run dev  # → running on http://localhost:3000

# Then start Polish, pointing at your dev server
polish --proxy http://localhost:3000
# → open http://localhost:3333
```

Polish sits between you and your dev server. You open Polish's URL instead of your dev server's URL, and Polish proxies all requests through while injecting the visual editor overlay.

### Options

| Flag | Description |
|------|-------------|
| `--proxy <url>` | **(required)** Upstream server to proxy (e.g. `http://localhost:3000`) |
| `--port <number>` | Port for Polish server (default: 3333) |
| `--dir <path>` | Source directory to watch for CSS files (default: `.`) |

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
