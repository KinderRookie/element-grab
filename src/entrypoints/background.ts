// Service worker: injects the tools on demand (activeTab), captures the visible tab for
// screenshots, and owns per-tab annotation storage. All UI state lives in the content script.
import { ELEMENT_GRAB_DISPOSE_EVENT } from '@/lib/messages'
import type {
  AnnotationsResponse,
  BackgroundRequest,
  CaptureVisibleTabResponse,
  ElementGrabCommand,
  ShortcutsResponse
} from '@/lib/messages'
import type { BrowserPageAnnotation } from '@/shared/browser-grab-types'

const annotationsKey = (tabId: number): string => `annotations:${tabId}`

// captureVisibleTab is rate-limited (~2 calls/s per window); serialize and space the calls.
const CAPTURE_MIN_INTERVAL_MS = 500
let captureChain: Promise<unknown> = Promise.resolve()
let lastCaptureAt = 0

function captureVisibleTab(windowId: number): Promise<CaptureVisibleTabResponse> {
  const run = async (): Promise<CaptureVisibleTabResponse> => {
    const wait = lastCaptureAt + CAPTURE_MIN_INTERVAL_MS - Date.now()
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
      return { ok: true, dataUrl }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    } finally {
      lastCaptureAt = Date.now()
    }
  }
  const result = captureChain.then(run, run)
  captureChain = result
  return result
}

/**
 * True when a live copy of the tools answers in this tab. A copy left behind by a previous
 * extension instance (reload/update) cannot answer, so it is told to dispose itself and any
 * DOM it left is removed before a fresh injection.
 */
async function isInjected(tabId: number): Promise<boolean> {
  try {
    if ((await chrome.tabs.sendMessage(tabId, { type: 'element-grab:ping' })) === true) {
      return true
    }
  } catch {
    // No receiver: never injected, or only an orphan from a previous extension instance.
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    args: [ELEMENT_GRAB_DISPOSE_EVENT],
    func: (disposeEvent: string) => {
      document.dispatchEvent(new CustomEvent(disposeEvent))
      document.querySelectorAll('element-grab-ui, #__element-grab-host').forEach((node) => node.remove())
      delete (window as { __elementGrab?: unknown }).__elementGrab
    }
  })
  return false
}

async function invoke(tab: chrome.tabs.Tab | undefined, command: ElementGrabCommand): Promise<void> {
  const tabId = tab?.id
  if (tabId === undefined) {
    return
  }
  try {
    const alreadyInjected = await isInjected(tabId)
    if (!alreadyInjected) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['/react-probe.js'],
        world: 'MAIN'
      })
      await chrome.scripting.executeScript({ target: { tabId }, files: ['/tools.js'] })
    }
    await chrome.action.setBadgeText({ tabId, text: '' })
    await chrome.action.setTitle({ tabId, title: 'Element Grab (Alt+Shift+E)' })
    // A fresh injection already shows the toolbar; only an explicit tool command follows it.
    if (alreadyInjected || command !== 'toggle') {
      await chrome.tabs.sendMessage(tabId, { type: 'element-grab:command', command })
    }
  } catch {
    // chrome://, the Web Store, the PDF viewer and other protected pages refuse injection.
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#dc2626' }).catch(() => {})
    await chrome.action.setBadgeText({ tabId, text: '!' }).catch(() => {})
    await chrome.action
      .setTitle({ tabId, title: "Element Grab can't run on this page" })
      .catch(() => {})
  }
}

async function getShortcuts(): Promise<ShortcutsResponse> {
  const commands = await chrome.commands.getAll()
  const byName = new Map(commands.map((command) => [command.name, command.shortcut ?? '']))
  return {
    toggle: byName.get('_execute_action') || undefined,
    grab: byName.get('grab') || undefined,
    annotate: byName.get('annotate') || undefined,
    markup: byName.get('markup') || undefined
  }
}

async function handleRequest(
  request: BackgroundRequest,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  const tab = sender.tab
  if (!tab?.id) {
    return undefined
  }
  switch (request.type) {
    case 'element-grab:capture-visible-tab':
      return captureVisibleTab(tab.windowId)
    case 'element-grab:annotations-get': {
      const key = annotationsKey(tab.id)
      const stored = await chrome.storage.session.get(key)
      const annotations = Array.isArray(stored[key]) ? (stored[key] as BrowserPageAnnotation[]) : []
      return { tabId: tab.id, annotations } satisfies AnnotationsResponse
    }
    case 'element-grab:annotations-set': {
      const key = annotationsKey(tab.id)
      if (request.annotations.length === 0) {
        await chrome.storage.session.remove(key)
      } else {
        await chrome.storage.session.set({ [key]: request.annotations })
      }
      return { ok: true }
    }
    case 'element-grab:get-shortcuts':
      return getShortcuts()
  }
}

export default defineBackground(() => {
  chrome.action.onClicked.addListener((tab) => void invoke(tab, 'toggle'))

  chrome.commands.onCommand.addListener((command, tab) => {
    if (command === 'grab' || command === 'annotate' || command === 'markup') {
      void invoke(tab, command)
    }
  })

  chrome.runtime.onMessage.addListener((request: BackgroundRequest, sender, sendResponse) => {
    void handleRequest(request, sender).then(sendResponse, () => sendResponse(undefined))
    return true
  })

  chrome.tabs.onRemoved.addListener((tabId) => {
    void chrome.storage.session.remove(annotationsKey(tabId))
  })

  if (import.meta.env.WXT_E2E === '1') {
    ;(globalThis as { __elementGrabTest?: unknown }).__elementGrabTest = {
      invoke: (tabId: number, command: ElementGrabCommand) =>
        invoke({ id: tabId } as chrome.tabs.Tab, command)
    }
  }
})
