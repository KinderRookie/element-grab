import type { BrowserGrabPayload } from '@/shared/browser-grab-types'
import type { ReactMetadata } from './react-bridge'

export type PickerBridge = {
  getReactMetadata: (el: Element) => ReactMetadata
  isOwnElement: (el: Element) => boolean
}

/** The object Orca's ARM script stored on window.__orcaGrab. */
export type PickerApi = {
  host: HTMLElement
  extractPayload: (el: Element) => BrowserGrabPayload
  getCurrentElement: () => Element | null
  freezeHighlight: (selectionId: string) => void
  cleanup: () => void
  cancelAwait?: () => void
}

export function installPicker(bridge: PickerBridge): PickerApi
