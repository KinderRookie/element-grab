// Replaces Orca's guest viewport bridge + use-browser-page-annotation-viewport-tracking: the
// page is our own window, so scroll/resize can be observed directly and the frozen selection
// (marked by the picker's selected attribute) re-measured each frame something moves.
import { useEffect, type Dispatch, type SetStateAction } from 'react'
import {
  applyBrowserAnnotationViewportReport,
  type BrowserOverlayViewport
} from './browser-annotation-geometry'

export const BROWSER_GRAB_SELECTED_ATTRIBUTE = 'data-element-grab-selected'

export function useAnnotationViewportTracking({
  isActive,
  pendingAnnotation,
  annotationCount,
  setBrowserOverlayViewport
}: {
  isActive: boolean
  pendingAnnotation: unknown
  annotationCount: number
  setBrowserOverlayViewport: Dispatch<SetStateAction<BrowserOverlayViewport>>
}): void {
  useEffect(() => {
    if (!isActive || (!pendingAnnotation && annotationCount === 0)) {
      return
    }
    let frame: number | null = null
    const report = (): void => {
      frame = null
      const selected = pendingAnnotation
        ? document.querySelector(`[${BROWSER_GRAB_SELECTED_ATTRIBUTE}]`)
        : null
      const rect = selected?.getBoundingClientRect()
      setBrowserOverlayViewport((current) =>
        applyBrowserAnnotationViewportReport(current, {
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          viewportWidth: window.innerWidth,
          target: rect
            ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            : undefined
        })
      )
    }
    const bump = (): void => {
      if (frame === null) {
        frame = window.requestAnimationFrame(report)
      }
    }
    // Capture scrolls so nested scroll containers move the card too.
    window.addEventListener('scroll', bump, true)
    window.addEventListener('resize', bump)
    bump()
    return () => {
      window.removeEventListener('scroll', bump, true)
      window.removeEventListener('resize', bump)
      if (frame !== null) {
        window.cancelAnimationFrame(frame)
      }
    }
  }, [annotationCount, isActive, pendingAnnotation, setBrowserOverlayViewport])
}
