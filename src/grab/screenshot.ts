// Ported from Orca (MIT, (c) 2026 Lovecast Inc.): src/main/browser/browser-grab-screenshot.ts.
// Electron's guest.capturePage() becomes chrome.tabs.captureVisibleTab (in the service worker)
// and NativeImage.crop() becomes a canvas crop. The scale math and limits are unchanged.
import type { BrowserGrabRect, BrowserGrabScreenshot } from '@/shared/browser-grab-types'
import { GRAB_BUDGET } from '@/shared/browser-grab-types'
import { sendToBackground, type CaptureVisibleTabResponse } from '@/lib/messages'
import { hideOwnHosts } from './own-ui'

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

/** Full-viewport PNG with the extension's overlays hidden, or null when capture fails. */
export async function captureVisibleViewport(): Promise<string | null> {
  // Hide selection overlays during capture and attempt restoration even if capture fails.
  const restore = hideOwnHosts()
  try {
    // Two frames: one to apply display:none, one for the compositor to present it.
    await nextFrame()
    await nextFrame()
    const response = await sendToBackground<CaptureVisibleTabResponse>({
      type: 'element-grab:capture-visible-tab'
    })
    return response?.ok ? response.dataUrl : null
  } catch {
    return null
  } finally {
    restore()
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to decode captured screenshot'))
    image.src = src
  })
}

export async function captureSelectionScreenshot(
  rect: BrowserGrabRect
): Promise<BrowserGrabScreenshot | null> {
  try {
    const safeN = (n: unknown, fallback = 0): number =>
      typeof n === 'number' && Number.isFinite(n) ? n : fallback
    const safeRect = {
      x: safeN(rect.x),
      y: safeN(rect.y),
      width: safeN(rect.width),
      height: safeN(rect.height)
    }

    const dataUrl = await captureVisibleViewport()
    if (!dataUrl) {
      return null
    }
    const image = await loadImage(dataUrl)
    const bitmapSize = { width: image.naturalWidth, height: image.naturalHeight }
    if (bitmapSize.width <= 0 || bitmapSize.height <= 0) {
      return null
    }
    // Derive bitmap/CSS scaling from this page, avoiding primary-display DPI assumptions.
    const viewportCSSWidth = window.innerWidth
    if (!viewportCSSWidth || viewportCSSWidth <= 0) {
      return null
    }
    const scaleFactor = bitmapSize.width / viewportCSSWidth

    const cropX = Math.max(0, Math.round(safeRect.x * scaleFactor))
    const cropY = Math.max(0, Math.round(safeRect.y * scaleFactor))
    const cropW = Math.min(bitmapSize.width - cropX, Math.round(safeRect.width * scaleFactor))
    const cropH = Math.min(bitmapSize.height - cropY, Math.round(safeRect.height * scaleFactor))

    if (cropW <= 0 || cropH <= 0) {
      return null
    }

    const canvas = document.createElement('canvas')
    canvas.width = cropW
    canvas.height = cropH
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return null
    }
    ctx.drawImage(image, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)
    const croppedUrl = canvas.toDataURL('image/png')
    const base64Length = croppedUrl.length - 'data:image/png;base64,'.length
    if (Math.floor((base64Length * 3) / 4) > GRAB_BUDGET.screenshotMaxBytes) {
      return null
    }

    // Report CSS dimensions to match the selection rectangles.
    return {
      mimeType: 'image/png',
      dataUrl: croppedUrl,
      width: Math.round(cropW / scaleFactor),
      height: Math.round(cropH / scaleFactor)
    }
  } catch {
    return null
  }
}
