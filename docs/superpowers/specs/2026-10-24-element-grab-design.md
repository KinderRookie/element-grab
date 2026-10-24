# Element Grab — Chrome Extension Design

Date: 2026-10-24
Status: Implemented (M1–M3). See "Implementation notes" at the end for deviations.

## 1. Goal

Port Orca's built-in browser element tools to a standalone Chrome (MV3) extension with
behavioral and visual parity:

- **Grab** (crosshair): hover-highlight a page element, copy its context to the clipboard.
- **Annotate**: attach comments to elements, collect them in a tray, copy as Markdown.
- **Markup**: freeze a viewport screenshot, draw on it, copy the composed image.

Primary use is personal; the design must stay Chrome Web Store–submittable.

Source of truth for behavior: Orca (`/Users/snagreakim/Devs/orca`, MIT, © 2026 Lovecast Inc.).
The repo keeps Orca's copyright notice in `LICENSE` / `NOTICE`.

### Non-goals

- "Attach to AI" / "Send to agent" (no agent target exists in an extension). Replaced by Copy.
- Selecting inside cross-origin iframes (top frame only).
- Running on `chrome://`, Chrome Web Store, PDF viewer, or other unscriptable pages
  (show Orca's "not ready" error instead).
- Annotation persistence beyond the tab's lifetime.

## 2. Orca reference map

| Concern | Orca source |
|---|---|
| Injected picker (overlay, highlight, label, freeze) | `src/main/browser/grab-guest-overlay-script.ts` |
| Extraction budget, sanitizing, text helpers | `src/main/browser/grab-guest-foundation-script.ts` |
| Selected text, HTML snippet, safe attrs, a11y | `src/main/browser/grab-guest-content-script.ts` |
| Selector, paths, styles, nearby text/elements | `src/main/browser/grab-guest-element-context-script.ts` |
| React fiber metadata, `extractPayload` | `src/main/browser/grab-guest-react-script.ts` |
| Click / context-click / hover-extract / teardown | `src/main/browser/grab-guest-selection-scripts.ts` |
| Screenshot (hide overlays → capture → crop) | `src/main/browser/browser-grab-screenshot.ts` |
| Payload & annotation types, budgets, secret patterns | `src/shared/browser-grab-types.ts` |
| Grab state machine | `src/renderer/.../annotate/useGrabMode.ts` |
| Grab/annotate orchestration, toast placement | `src/renderer/.../annotate/use-browser-page-grab-annotations.ts` |
| C / S shortcut behavior | `src/renderer/.../annotate/browser-page-grab-action.ts` |
| Text formatter `formatGrabPayloadAsText` | `src/renderer/.../annotate/GrabConfirmationSheet.tsx` |
| Markdown formatter `formatBrowserAnnotationsAsMarkdown` | `src/renderer/.../annotate/browser-annotation-output.ts` |
| Toast + right-click menu | `src/renderer/.../annotate/browser-page-grab-toast.tsx`, `browser-guest-annotate-overlays.tsx` |
| Comment card | `src/renderer/.../annotate/pending-browser-annotation-card.tsx` |
| Card anchoring geometry, intent options | `src/renderer/.../describe-page/browser-annotation-geometry.ts` |
| Annotation tray | `src/renderer/.../annotate/browser-page-annotation-tray.tsx` |
| Markup model/gesture/render/compose/editor/toolbar | `src/renderer/.../annotate/markup-*.ts`, `useMarkup*.ts`, `MarkupToolbar.tsx`, `MarkupOverlay.tsx` |
| Toolbar buttons (Crosshair, MessageSquarePlus) | `src/renderer/.../assemble-chrome/browser-chrome-element-tool-buttons.tsx` |

(`src/renderer/...` = `src/renderer/src/components/browser-pane`.)

Ported files carry a header comment naming their Orca origin.

## 3. Stack

- **WXT** (MV3 build, dev reload, `createShadowRootUi`)
- **React 19 + TypeScript**
- **Tailwind CSS** inside the shadow root; Radix primitives (Popover, DropdownMenu, ToggleGroup,
  Tooltip) and lucide-react, mirroring Orca's shadcn components.
- **Vitest** (+ jsdom) for unit tests, **Playwright** with the unpacked extension for E2E.
- Package manager: pnpm.

## 4. Permissions & injection model

Manifest permissions: `activeTab`, `scripting`, `storage`, `clipboardWrite`, `offscreen`.
No host permissions, no static content scripts.

- The extension injects only when the user invokes it: action-icon click or a `chrome.commands`
  shortcut. Both grant `activeTab` for that tab.
- The grant (and therefore the injected UI) lives until the tab navigates or reloads. After a
  reload the user re-invokes; the toolbar comes back and restores that tab's annotations from
  storage.
- `captureVisibleTab` works only while the tab holds the `activeTab` grant. A click on the
  in-page toolbar does not grant it, but the grant from the original invocation is still valid
  on the same page, so in-page toolbar buttons work.
- Injecting into an unscriptable page fails. The service worker catches the error and sets a
  per-tab action badge/title ("Can't run on this page"). This replaces Orca's `not-ready` /
  `injection-failed` messages.

## 5. Architecture

Orca's three layers (guest script ↔ main-process IPC ↔ renderer) collapse into two runtime
contexts plus a small MAIN-world helper:

```
Service worker (background)
  - action.onClicked / commands.onCommand → inject (or toggle if already injected)
  - CAPTURE_VISIBLE_TAB → chrome.tabs.captureVisibleTab (serialized, ≤2/s)
  - ANNOTATIONS_GET / ANNOTATIONS_SET → chrome.storage.session["annotations:<tabId>"]
  - tabs.onRemoved → delete that tab's key
  - CLIPBOARD_* fallback → offscreen document
        ↕ chrome.runtime messages (tabId taken from sender.tab.id)
Content script (ISOLATED world) — owns all state
  - picker overlay (ported guest overlay, closed shadow root)
  - extraction (ported guest scripts, run as normal module code)
  - grab state machine, annotate flow, markup mode
  - React UI in a separate shadow root: toolbar, toast, menu, card, tray, markup editor
        ↕ DOM attribute marker + CustomEvent
MAIN-world helper (chrome.scripting.executeScript world:'MAIN')
  - reads __reactFiber$ / __reactInternalInstance$ → { reactComponents, sourceFile }
```

### 5.1 Why the MAIN-world helper

Content scripts run in an isolated world and cannot see expando properties React sets on DOM
nodes, so Orca's `getReactMetadata` would silently return nulls. Flow:

1. Content script sets `data-element-grab-target="<nonce>"` on the selected element.
2. It dispatches `CustomEvent('element-grab:react-request', { detail: nonce })` on `document`.
3. The MAIN-world helper (injected once, alongside the content script) handles the event:
   it finds the element by the attribute, runs Orca's fiber walk unchanged, and writes the
   JSON result to `data-element-grab-react` on that element.
4. The content script reads the attribute synchronously after `dispatchEvent` returns (DOM
   events dispatch synchronously across worlds), then removes both attributes.

If the helper is missing or throws, the fields are `null`, as in Orca's catch path.

### 5.2 Re-invocation

The content script registers `window.__elementGrab` (isolated world). When the service worker
injects again, it first runs a probe; if the probe finds the instance, the worker sends
`TOGGLE_TOOLBAR` instead of injecting a second copy.

### 5.3 Module layout

```
entrypoints/
  background.ts                 service worker
  content/index.tsx             injected on demand via chrome.scripting (no static registration)
  react-probe.ts                MAIN-world helper
  offscreen/index.html|ts       clipboard fallback
src/
  grab/
    extract/                    ported extraction (foundation, content, element-context, react)
    overlay.ts                  ported picker overlay + freeze
    selection.ts                click/context-click/hover-extract handling
    grab-mode.ts                state machine (idle/armed/awaiting/confirming/error)
    screenshot.ts               hide overlays, request capture, crop via canvas
  annotate/
    geometry.ts                 ported anchor geometry
    store.ts                    annotations via service worker messages
  markup/                       ported model/gesture/hit-test/render/compose/editor
  format/
    grab-text.ts                formatGrabPayloadAsText (verbatim)
    annotations-markdown.ts     formatBrowserAnnotationsAsMarkdown (verbatim)
  shared/types.ts               ported browser-grab-types
  ui/                           React components (toolbar, toast, menus, card, tray, markup UI)
  ui/primitives/                shadcn-style Button/Popover/DropdownMenu/ToggleGroup/Tooltip
  clipboard.ts                  text/PNG write with offscreen fallback
```

Each module has one job and a typed interface, so it can be tested on its own. The ported
extraction runs as plain TypeScript functions instead of string-built scripts. Logic, budgets
and regexes stay identical.

## 6. Floating toolbar

- Rendered in its own shadow root host (`<element-grab-ui>`) appended to `documentElement`,
  `z-index: 2147483647`.
- Default position: top-right, 12px inset. Draggable by a grip area; position saved per origin
  in `chrome.storage.local`.
- Buttons, left to right:
  - **Grab** (lucide `Crosshair`)
  - **Annotate** (`MessageSquarePlus`, count badge)
  - **Markup** (Orca's draw-on-screenshot icon)
  - **Close** (`X`)
- The active tool uses Orca's active style (`bg-foreground/80 text-background`).
- Tooltips show the tool name plus its current shortcut, read from `chrome.commands.getAll`
  via the service worker.

## 7. Grab

### 7.1 State machine (from `useGrabMode`)

`idle → armed → awaiting → confirming → armed (rearm) | idle (exit/cancel)`, plus `error → idle`.
Without IPC there is no separate arm/await round trip. `armed` installs the overlay;
`awaiting` means click listeners are live. Both states remain so the shortcut logic ports 1:1.

### 7.2 Interactions

| Input | Behavior |
|---|---|
| Hover | Ported overlay: 2px `rgba(255,255,255,.9)` border, 3px radius, `rgba(255,255,255,.08)` fill, dual shadow. Label `tag  role=x  "text…"  WxH` 6px below, or above near the viewport bottom. Hit-testing toggles the host's `pointer-events` around `elementFromPoint`, as in Orca. `html`/`body` hide the highlight. |
| Left click | Overlay swallows the event (`preventDefault` + `stopImmediatePropagation`). Extract the payload, capture the element screenshot, freeze the highlight. Copy `formatGrabPayloadAsText(payload)`. Show the "Copied" toast at the element, then rearm when the toast is dismissed (2s). |
| Right click | Freeze, no auto-copy. Menu: Copy Contents, Copy Screenshot (only if the screenshot is a valid PNG), Cancel. |
| `C` while armed/awaiting | Extract the hovered element without clicking and copy its text. Stay armed. |
| `S` while armed/awaiting | Extract the hovered element, capture, copy the PNG. Toast "Screenshotted" or "No screenshot available". |
| `C` / `S` while confirming | Per `runBrowserGrabActionShortcut`: `S` copies the screenshot; `C` copies only after a right-click selection; then rearm. |
| `Esc` | Cancel/exit, except when focus is in an editable field or the annotation card. |

Keys are handled by a capture-phase `window` `keydown` listener that is active only while the
picker is on and ignores events with modifiers.

### 7.3 Toast

Port of `BrowserPageGrabToast`: a white pill with a caret pointing at the element. It sits
below the element, or above it when `elementBottom + 52 ≥ viewportHeight`. It has a blue
`CircleCheck` for success and a red `OctagonX` for errors. A `···` menu offers Copy Screenshot
when a screenshot exists. Auto-dismiss is 2s, or 1.2s after its menu closes.

### 7.4 Payload & formatting

- `BrowserGrabPayload`, `GRAB_BUDGET` and the secret patterns are ported verbatim. URL
  sanitizing drops query and hash, and secret-looking attribute values are redacted.
- `formatGrabPayloadAsText` is verbatim (header "Attached browser context from …").

### 7.5 Screenshot

1. Hide the picker host and the UI host (`display:none`), wait one `requestAnimationFrame`.
2. Send `CAPTURE_VISIBLE_TAB` to the service worker, which calls
   `captureVisibleTab(windowId, {format:'png'})`. Calls are serialized and spaced at least
   500ms apart.
3. Restore both hosts in a `finally` block.
4. Crop on a canvas with `scale = bitmapWidth / innerWidth`. Clamp the rect the same way Orca
   does. Return null if the result exceeds `GRAB_BUDGET.screenshotMaxBytes`.

A failed screenshot does not fail the grab (`screenshot: null`), as in Orca.

## 8. Annotate

- **Intent `annotate`** uses the same picker. A left click produces a pending payload and opens
  the comment card. The card is a port of `PendingBrowserAnnotationCard`:
  - header with a tag badge and the accessible name, text snippet or selector
  - textarea, placeholder "Describe what should change here...", max length from budget,
    autofocus
  - **Change / Question** toggle, default Change
  - Cancel, plus Add with a `⌘↵` / `Ctrl↵` hint
  - Esc cancels
- **Anchoring:** `browser-annotation-geometry` ported, with the pending card dimensions
  352×240 and a 22px margin. The anchor follows the frozen element on scroll and resize, using
  the same rAF / ResizeObserver tracking as the overlay freeze.
- **Add:** builds `BrowserPageAnnotation` with `id`, `browserPageId = String(tabId)`, comment,
  intent, priority `important`, `createdAt`, and the payload with `screenshot: null`. It
  persists the annotation, shows the "Annotation added" toast and rearms.
- **Tray:** port of `BrowserPageAnnotationTray`. Bottom-right of the viewport, collapsible,
  shows the count. Each item can be edited inline (comment + intent) or deleted. **Copy**
  writes `formatBrowserAnnotationsAsMarkdown(all)` and shows "Copied". **Clear** removes all.
  The tray shows whenever the tab has at least one annotation and the UI is open.
- **Storage:** the service worker owns `chrome.storage.session["annotations:<tabId>"]`, so the
  content script never needs session-storage access. Every mutation writes the full array.
  Annotations survive reload and navigation within the tab, and `tabs.onRemoved` deletes them.
  Annotations from different pages render as "Design Feedback across pages", which the
  formatter already handles.

## 9. Markup

- **Enter** (toolbar button or command):
  1. Hide the UI.
  2. Capture the visible tab and flatten it onto an opaque white PNG (`flattenToOpaquePng`).
  3. Show a full-viewport backdrop `<img>` with a drawing canvas sized by
     `markupCanvasSize` / `effectiveMarkupScale`.
- **Tools** (`MarkupToolKind` + eraser): pen, highlight, arrow, rect, ellipse, text, eraser.
  Colors, widths and font sizes come from Orca's `MARKUP_COLORS` and presets. Whole-shape
  erase uses `markup-shape-hit-test`.
- **Editor:** ported `useMarkupEditor` with undo/redo (`⌘Z` / `⇧⌘Z`, Ctrl on other OSes) and
  Clear all. The toolbar is a port of `MarkupToolbar`.
- **Done:** `composeMarkupDataUrl` produces a PNG, which is copied as a `ClipboardItem`, with
  a "Copied" toast, then markup exits. **Esc** or Cancel exits without copying.
- Grab and Annotate are disabled while markup is active.

## 10. Clipboard

- Primary path: `navigator.clipboard.writeText` and `navigator.clipboard.write([ClipboardItem
  {'image/png'}])` from the content script. Our UI interaction gives the document user
  activation and focus.
- Fallback: when the page is not a secure context, or the primary path throws, send
  `CLIPBOARD_WRITE_TEXT` / `CLIPBOARD_WRITE_IMAGE` to the service worker. It creates the
  offscreen document (reason `CLIPBOARD`), which writes via
  `document.execCommand('copy')` for text and `navigator.clipboard.write` for images.
- A failure shows an error toast ("Couldn't copy to clipboard").

## 11. Page isolation

- Both shadow hosts stop propagation of `keydown`, `keyup` and `keypress` that originate
  inside them, so typing in the card or tray never triggers page shortcuts.
- Tailwind is configured with px-based spacing and font sizes, and the root sets
  `font-size: 14px`, so the UI does not scale with the page's `html` font-size.
- UI styles live only in the shadow root, and page styles cannot leak in. `all: initial` is set
  on the host.
- All page-derived strings are rendered as React text (no `innerHTML`), as in Orca's
  `EscapedText`.

## 12. Commands

| Command | Default (mac / other) | Action |
|---|---|---|
| `_execute_action` | `Alt+Shift+E` | Toggle toolbar (inject if needed) |
| `grab` | `Alt+Shift+G` | Open toolbar + toggle Grab |
| `annotate` | `Alt+Shift+N` | Open toolbar + toggle Annotate |
| `markup` | `Alt+Shift+M` | Open toolbar + enter Markup |

On mac, `Alt` means Option. Users can rebind these at `chrome://extensions/shortcuts`.
Orca's `Mod+C` / `Mod+Shift+C` are not used: the first overrides normal copy, and the second is
Chrome's DevTools inspect shortcut.

## 13. Error handling

| Case | Behavior |
|---|---|
| Unscriptable page | Action badge `!` + title "Can't run on this page" for that tab |
| Extraction throws | Clean up the overlay, show an error toast, state `error` → idle |
| Screenshot fails, too large, or rate-limited | `screenshot: null`; Screenshot actions show "No screenshot available" |
| Markup capture fails | Error toast, stay out of markup mode |
| Service worker asleep | Messages wake it, so no special handling is needed. State lives in the content script and in storage. |
| Element removed while frozen | Hide the highlight (Orca behavior). A pending card stays at its last anchor. |
| Navigation / reload | Content script is gone. Annotations remain in storage. |

## 14. Testing

- **Unit (Vitest):**
  - Port Orca's `browser-annotation-output.test.ts`, `GrabConfirmationSheet.test.ts`,
    `markup-drawing-model.test.ts`, `markup-gesture.test.ts`, `markup-shape-hit-test.test.ts`,
    `markup-shape-render.test.ts` and `markup-screenshot-compose.test.ts`. Adjust them only for
    renamed imports.
  - Extraction tests on jsdom fixtures: selector uniqueness and `nth-of-type`, hashy-class
    filtering, secret redaction, URL sanitizing, text budgets.
  - Grab state machine transitions, including stale-operation guards.
- **E2E (Playwright, persistent context with `--load-extension`):** a local fixture site that
  includes a React dev build. Trigger via the command shortcut. Tests:
  - hover label text
  - click, then clipboard text contains `Selector:` and `React: <Component>` with a `Source:`
    line, which proves the MAIN-world bridge
  - right-click menu
  - `C` / `S` keys
  - annotate add/edit/delete, then reload, re-invoke and see the annotations restored, then
    Markdown copy
  - markup draw a rect, then a PNG on the clipboard
- **Parity check (manual, M1 exit):** grab the same element on the same page in Orca and in the
  extension and diff the clipboard text. Expected differences: none, except values that depend on the
  environment (e.g. dimensions when the viewport width differs).

## 15. Milestones

1. **M1 — Scaffold + Grab:** WXT project, LICENSE/NOTICE, service worker injection and toggle,
   toolbar shell, ported extraction and overlay, MAIN-world React bridge, screenshot, clipboard,
   toast and menu, C/S/Esc, formatter golden tests, E2E for grab. Exit: parity check passes.
2. **M2 — Annotate:** card, geometry, tray, session storage via the worker, Markdown copy, E2E.
3. **M3 — Markup:** capture backdrop, ported model, editor and toolbar, compose and copy, tests.
4. **M4 — Store readiness:** icons, privacy disclosure (no data leaves the device), store
   listing screenshots, permission justifications (`activeTab`, `scripting`, `storage`,
   `clipboardWrite`, `offscreen`).

## 16. Implementation notes (deviations from the plan above)

- **No offscreen document.** Text copy falls back to `document.execCommand('copy')` in the
  content script, which the `clipboardWrite` permission allows. Offscreen documents cannot
  write images to the clipboard, so they would add nothing for PNGs. Image copy needs a secure
  page; failures show a toast. Permissions are therefore `activeTab`, `scripting`, `storage`
  and `clipboardWrite`.
- **Entrypoints.** `src/entrypoints/tools.tsx` (the UI and picker) and `react-probe.ts` (MAIN
  world) are WXT unlisted scripts. The worker injects them with `chrome.scripting`. The name
  `content.tsx` is reserved by WXT for manifest content scripts.
- **UI primitives.** Orca's shadcn/Radix components are copied as-is (`src/ui/primitives`).
  Their portals target a full-viewport container inside the shadow root via
  `PortalContainerContext`.
- **Picker id.** `useGrabMode` gets a constant page id. Keying it by the tab id made the id's
  async arrival trigger Orca's "tab switched → cancel grab" cleanup.
- **CSS in the shadow root.** A PostCSS step converts rem to px, un-gates Tailwind's
  `@property` fallbacks (ignored inside shadow roots), and adds `:host` to `:root` rules.
- **Parity note.** Like Orca, the HTML snippet is the raw `outerHTML`, including unredacted
  attribute values. Only the structured `attributes` field is redacted, and the page URL loses
  its query and hash.
- **E2E.** `WXT_E2E=1` builds into `.output-e2e` with `<all_urls>` and a worker test hook,
  because Playwright cannot press the action icon to grant `activeTab`. Release builds have
  neither.
