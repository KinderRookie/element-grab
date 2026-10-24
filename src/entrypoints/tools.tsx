// Injected on demand by the service worker (chrome.scripting, activeTab) — never declared in
// the manifest. Owns the whole tool UI for this tab until the page navigates or reloads.
import { createRoot } from 'react-dom/client'
import { App, type AppController } from '@/ui/App'
import { registerOwnHost } from '@/grab/own-ui'
import type { ContentMessage, ElementGrabCommand } from '@/lib/messages'
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

  chrome.runtime.onMessage.addListener((message: ContentMessage) => {
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
  })

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
  createRoot(mount).render(<App controller={controller} />)
})
