// Ported from Orca (MIT, (c) 2026 Lovecast Inc.): browser-pane/describe-page/browser-page-types.ts,
// narrowed to the grab/annotate types. The Electron webview ref becomes any measurable element.
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { BrowserGrabPayload, BrowserPageAnnotation } from '@/shared/browser-grab-types'
import type { GrabModeHook } from '@/grab/useGrabMode'
import type { BrowserOverlayViewport } from './browser-annotation-geometry'

export type { GrabIntent } from '@/shared/browser-grab-types'

export type BrowserPageGrabToastState = {
  message: string
  type: 'success' | 'error'
  x: number
  y: number
  below: boolean
  payload: BrowserGrabPayload | null
}

export type BrowserPageGrabAnnotationsOptions = {
  /** Scopes the stored annotations (the Chrome tab id). */
  browserTabId: string
  toolTargetId?: string
  isActive: boolean
  grab: GrabModeHook
  containerRef: MutableRefObject<HTMLDivElement | null>
  webviewRef: MutableRefObject<HTMLElement | null>
  setBrowserOverlayViewport: Dispatch<SetStateAction<BrowserOverlayViewport>>
  browserAnnotationsLength: number
  addBrowserPageAnnotation: (annotation: BrowserPageAnnotation) => void
}
