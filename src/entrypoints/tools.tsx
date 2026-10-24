// Injected on demand by the service worker (chrome.scripting, activeTab) — never declared in
// the manifest. Owns the whole tool UI for this tab until the page navigates or reloads.
import { createRoot } from 'react-dom/client'
import { App, type AppController } from '@/ui/App'
import { registerOwnHost, setUiHost } from '@/grab/own-ui'
import { browserApi } from '@/grab/browser-api'
import {
  ELEMENT_GRAB_DISPOSE_EVENT,
  type ContentMessage,
  type ElementGrabCommand
} from '@/lib/messages'
import css from '@/styles/ui.css?inline'

declare global {
  interface Window {
    __elementGrab?: Record<string, never>
  }
}

export default defineUnlistedScript(() => {
  if (window.__elementGrab) {
    return
  }
  window.__elementGrab = {}

  const handlers = new Set<(command: ElementGrabCommand) => void>()
  // Commands can arrive before React has mounted (the worker sends one right after injecting).
  const queued: ElementGrabCommand[] = []
  const controller: AppController = {
    onCommand(handler) {
      handlers.add(handler)
      for (const command of queued.splice(0)) {
        handler(command)
      }
      return () => handlers.delete(handler)
    }
  }

  const onMessage = (
    message: ContentMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ): void => {
    if (message?.type === 'element-grab:ping') {
      sendResponse(true)
      return
    }
    if (message?.type !== 'element-grab:command') {
      return
    }
    if (handlers.size === 0) {
      queued.push(message.command)
      return
    }
    for (const handler of handlers) {
      handler(message.command)
    }
  }
  chrome.runtime.onMessage.addListener(onMessage)

  const host = document.createElement('element-grab-ui')
  host.style.cssText =
    'position:fixed;inset:0;width:0;height:0;z-index:2147483647;pointer-events:none;display:block;'
  registerOwnHost(host)
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = css
  shadow.appendChild(style)
  const mount = document.createElement('div')
  shadow.appendChild(mount)

  // Keystrokes typed into our UI must not reach page shortcuts (GitHub's `s`, etc.).
  for (const type of ['keydown', 'keyup', 'keypress'] as const) {
    host.addEventListener(type, (event) => event.stopPropagation())
  }

  document.documentElement.appendChild(host)
  setUiHost(host)
  const root = createRoot(mount)
  root.render(<App controller={controller} />)

  // After the extension reloads or updates, this script is orphaned: its chrome.runtime is dead
  // but its DOM and listeners live on. The new service worker dispatches this event (DOM events
  // reach every world) before injecting a fresh copy, so the orphan removes itself.
  const dispose = (): void => {
    document.removeEventListener(ELEMENT_GRAB_DISPOSE_EVENT, dispose)
    try {
      chrome.runtime.onMessage.removeListener(onMessage)
    } catch {
      // The runtime of an orphaned script may already be gone.
    }
    void browserApi.cancelGrab()
    root.unmount()
    host.remove()
    setUiHost(null)
    delete window.__elementGrab
  }
  document.addEventListener(ELEMENT_GRAB_DISPOSE_EVENT, dispose)
})
