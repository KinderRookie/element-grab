# Element Grab

Chrome extension that ports Orca's in-browser element tools to any tab:

- **Grab** (crosshair) — hover to highlight, click to copy the element's context (selector,
  accessible name, React component tree, text, HTML, computed styles, nearby text) in Orca's
  exact text format. Right-click for a menu; while hovering, `C` copies text and `S` copies a
  cropped screenshot without clicking. `Esc` exits.
- **Annotate** — pick elements, write a Change/Question comment, collect them in a tray, copy
  them all as Orca's "Design Feedback" Markdown. Annotations survive reloads within the tab.
- **Markup** — freeze the viewport and draw on it (pen, highlighter, arrow, rectangle, ellipse,
  text, eraser, undo/redo), then copy the composed PNG.

## Install (unpacked)

```sh
pnpm install
pnpm build            # → .output/chrome-mv3
```

Open `chrome://extensions`, enable Developer mode, **Load unpacked**, pick `.output/chrome-mv3`.
For development, `pnpm dev` opens a Chrome with the extension and reloads on change.

## Use

The extension only runs on a tab after you invoke it (`activeTab`), so it needs no site access.

| Shortcut | Action |
|---|---|
| `Alt+Shift+E` / toolbar icon | Show / hide the floating toolbar |
| `Alt+Shift+G` | Grab |
| `Alt+Shift+N` | Annotate |
| `Alt+Shift+M` | Draw on screenshot |

Rebind them at `chrome://extensions/shortcuts`. After a reload or navigation the toolbar is gone
until you invoke it again; the tab's annotations come back with it.

Limits: top frame only (no cross-origin iframes); Chrome blocks extensions on `chrome://` pages,
the Web Store and the PDF viewer (the icon shows a red `!` there). Image copy needs an https or
localhost page.

## Develop

```sh
pnpm compile      # type-check
pnpm test         # unit tests (Orca's formatter, geometry and markup suites)
pnpm test:e2e     # Playwright: loads the extension into Chromium against a React fixture
```

Design: `docs/superpowers/specs/2026-10-24-element-grab-design.md`.
Ported from Orca (MIT) — see `NOTICE`.
