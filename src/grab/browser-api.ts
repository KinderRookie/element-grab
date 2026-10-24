// The extension's stand-in for Orca's window.api.browser grab IPC surface. In Orca each call
// crosses renderer → main → guest (executeJavaScript); here the picker lives in this same
// content script, so the calls run in-process while keeping Orca's result shapes, which lets
// useGrabMode port unchanged. Ported behavior: src/main/browser/browser-manager-grab.ts,
// browser-grab-session-controller.ts and grab-guest-selection-scripts.ts (MIT, (c) 2026 Lovecast Inc.).
import type {
  BrowserCaptureSelectionScreenshotResult,
  BrowserExtractHoverResult,
  BrowserGrabPayload,
  BrowserGrabRect,
  BrowserGrabResult,
  BrowserSetGrabModeResult
} from '@/shared/browser-grab-types'
import { clampGrabPayload } from './browser-grab-payload'
import { installPicker, type PickerApi } from './picker-core'
import { getReactMetadataViaMainWorld } from './react-bridge'
import { getUiHost, isOwnElement, registerOwnHost } from './own-ui'
import { captureSelectionScreenshot } from './screenshot'

let picker: PickerApi | null = null
let unregisterPickerHost: (() => void) | null = null
let activeOp: { opId: string; settle: (result: BrowserGrabResult) => void } | null = null

function teardown(): void {
  // Settle the outstanding await before removing grab state.
  if (picker?.cancelAwait) {
    picker.cancelAwait()
  } else {
    picker?.cleanup()
  }
  picker = null
  unregisterPickerHost?.()
  unregisterPickerHost = null
}

/** The picker's host element while armed, for callers that need to keep it out of captures. */
export function getPickerHost(): HTMLElement | null {
  return picker?.host ?? null
}

export const browserApi = {
  async setGrabMode({
    enabled
  }: {
    browserPageId?: string
    enabled: boolean
  }): Promise<BrowserSetGrabModeResult> {
    if (!enabled) {
      cancelActiveOp()
      teardown()
      return { ok: true }
    }
    // Arm eagerly so hover feedback appears before selection starts. Re-arming replaces the
    // previous overlay, including a frozen selection outline, as Orca's ARM script does.
    cancelActiveOp()
    teardown()
    try {
      picker = installPicker({
        getReactMetadata: getReactMetadataViaMainWorld,
        isOwnElement
      })
      unregisterPickerHost = registerOwnHost(picker.host)
      // Both hosts sit at the maximum z-index, like Orca's picker, so tree order breaks ties:
      // after <body> the picker beats page widgets that also max out z-index, and before the
      // UI host it leaves the toolbar clickable while armed.
      const uiHost = getUiHost()
      if (uiHost?.parentNode === picker.host.parentNode) {
        uiHost.before(picker.host)
      }
      return { ok: true }
    } catch {
      picker = null
      return { ok: false, reason: 'injection-failed' }
    }
  },

  awaitGrabSelection({ opId }: { browserPageId?: string; opId: string }): Promise<BrowserGrabResult> {
    cancelActiveOp()
    return new Promise<BrowserGrabResult>((resolve) => {
      let settled = false
      const settle = (result: BrowserGrabResult): void => {
        if (settled) {
          return
        }
        settled = true
        if (activeOp?.opId === opId) {
          activeOp = null
        }
        resolve(result)
      }
      activeOp = { opId, settle }

      const grab = picker
      if (!grab) {
        settle({ opId, kind: 'error', reason: 'Grab not armed' })
        return
      }

      const finish = (el: Element | null, isContextMenu: boolean): void => {
        grab.host.removeEventListener('click', onClick, true)
        grab.host.removeEventListener('contextmenu', onContext, true)
        if (!el) {
          grab.cleanup()
          settle({ opId, kind: 'cancelled', reason: 'user' })
          return
        }
        let rawPayload: BrowserGrabPayload
        try {
          rawPayload = grab.extractPayload(el)
        } catch (error) {
          grab.cleanup()
          settle({
            opId,
            kind: 'error',
            reason: error instanceof Error ? error.message : 'Failed to extract element context'
          })
          return
        }
        // Keep the selected element outlined while the UI shows its copy menu.
        grab.freezeHighlight(rawPayload.page.capturedAt)
        const payload = clampGrabPayload(rawPayload)
        if (!payload) {
          settle({ opId, kind: 'error', reason: 'Guest returned invalid payload structure' })
          return
        }
        settle({ opId, kind: isContextMenu ? 'context-selected' : 'selected', payload })
      }

      function onClick(e: MouseEvent): void {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        finish(grab!.getCurrentElement(), false)
      }

      function onContext(e: MouseEvent): void {
        // The marker opens the action menu instead of auto-copying.
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        finish(grab!.getCurrentElement(), true)
      }

      grab.host.addEventListener('click', onClick, true)
      grab.host.addEventListener('contextmenu', onContext, true)

      grab.cancelAwait = () => {
        grab.host.removeEventListener('click', onClick, true)
        grab.host.removeEventListener('contextmenu', onContext, true)
        grab.cleanup()
        settle({ opId, kind: 'cancelled', reason: 'user' })
      }
    })
  },

  async cancelGrab(_args?: { browserPageId?: string }): Promise<void> {
    cancelActiveOp()
    teardown()
  },

  async captureSelectionScreenshot({
    rect
  }: {
    browserPageId?: string
    rect: BrowserGrabRect
  }): Promise<BrowserCaptureSelectionScreenshotResult> {
    const screenshot = await captureSelectionScreenshot(rect)
    return screenshot ? { ok: true, screenshot } : { ok: false, reason: 'capture-failed' }
  },

  /** Extract without ending grab mode, so shortcut copy can keep selecting. */
  async extractHoverPayload(_args?: { browserPageId?: string }): Promise<BrowserExtractHoverResult> {
    const el = picker?.getCurrentElement()
    if (!picker || !el) {
      return { ok: false, reason: 'no-element' }
    }
    try {
      const payload = clampGrabPayload(picker.extractPayload(el))
      return payload ? { ok: true, payload } : { ok: false, reason: 'invalid-payload' }
    } catch {
      return { ok: false, reason: 'extract-failed' }
    }
  }
}

function cancelActiveOp(): void {
  const op = activeOp
  if (!op) {
    return
  }
  activeOp = null
  op.settle({ opId: op.opId, kind: 'cancelled', reason: 'user' })
}
