import type { BrowserPageAnnotation } from '@/shared/browser-grab-types'

/** Commands the service worker forwards to the injected content script. */
export type ElementGrabCommand = 'toggle' | 'grab' | 'annotate' | 'markup'

export type ContentMessage =
  | { type: 'element-grab:command'; command: ElementGrabCommand }
  | { type: 'element-grab:ping' }

/** Dispatched on document to make an orphaned (pre-reload) content script remove itself. */
export const ELEMENT_GRAB_DISPOSE_EVENT = 'element-grab:dispose'

/** Requests the content script sends to the service worker (tab id comes from the sender). */
export type BackgroundRequest =
  | { type: 'element-grab:capture-visible-tab' }
  | { type: 'element-grab:annotations-get' }
  | { type: 'element-grab:annotations-set'; annotations: BrowserPageAnnotation[] }
  | { type: 'element-grab:get-shortcuts' }

export type CaptureVisibleTabResponse = { ok: true; dataUrl: string } | { ok: false; error: string }
export type AnnotationsResponse = { tabId: number; annotations: BrowserPageAnnotation[] }
export type ShortcutsResponse = Partial<Record<'toggle' | 'grab' | 'annotate' | 'markup', string>>

export function sendToBackground<T>(message: BackgroundRequest): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>
}
