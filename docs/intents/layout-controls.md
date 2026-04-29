---
title: "Layout Controls"
author: "human:aaron"
version: 1
created: 2026-04-23
---

# Layout Controls

## WANT

A new "Layout" section in the Polish panel that exposes flexbox properties through intuitive, beginner-friendly controls. Users think in terms of screen directions (horizontal/vertical), not CSS axes (main/cross). The panel handles the axis mapping internally based on the current flex-direction.

**Controls (Figma-inspired naming, explicit labeled rows):**

- **Direction**: Row / Column icon buttons (`flex-direction`)
- **Align**: Start / Center / End / Stretch icon buttons (`align-items` — cross-axis)
- **Distribute**: Start / Center / End / Space Between / Space Around / Space Evenly icon buttons (`justify-content` — main-axis)
- **Gap**: Slider in `rem` only, no unit toggle (`gap`)

Icons rotate based on current direction so they always visually represent the axis they control. A Figma user recognizes Align/Distribute immediately; a beginner sees labeled rows with visual icons and can experiment.

Auto-sets `display: flex` when any layout property is changed on a non-flex element.

## DON'T

- Don't expose raw CSS property names in labels (no "justify-content" or "align-items" — use "Align" and "Distribute")
- Don't add unit toggles to the gap slider — `rem` only for now
- Don't add flex-wrap, flex-grow, flex-shrink, or order — keep scope tight

## LIKE

- Consistent with existing panel controls (color pickers, sliders, box model)
- Visual button groups similar to alignment icons in Figma or browser dev tools
- Same live preview pattern: inline style immediately, debounced write-back to source

## FOR

Developers and designers using Polish to visually edit layouts. Leans beginner-friendly — simple labels, no axis terminology — but doesn't hide power. A developer will figure it out; a beginner needs the help.

## ENSURE

- Align always maps to `align-items`, Distribute always maps to `justify-content` — no axis swapping needed
- Icons rotate based on direction so they visually show the correct axis
- Works on elements that aren't already flex (auto-sets `display: flex`)
- Live preview works identically to other panel controls (inline style + debounced write-back)
- Distribute and gap work together (gap acts as minimum when a space-* distribution is active)
- All layout changes write back to source files correctly via the existing writer

## TRUST

- `[autonomous]` Implementation of schema, panel rendering, axis mapping logic
- `[autonomous]` Control component creation following existing patterns
- `[ask]` Any changes to the writer or resolver to support new properties
- `[ask]` UX decisions not covered in this spec
