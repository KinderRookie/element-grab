// Ported from Orca (MIT, (c) 2026 Lovecast Inc.); the Electron webview source becomes the
// visible Chrome tab, captured through the service worker with our overlays hidden.
// Captures the frozen base screenshot the user draws on. Renderer-only and
// environment-aware: local Electron webviews expose capturePage(); remote panes
// already display the streamed frame as an <img> we can snapshot. Keeping this
// out of the main process means the markup feature works identically for local
// and remote/SSH browser panes.

// A frozen snapshot as a data URL plus its intrinsic pixel size. The overlay
// shows it as an <img> backdrop and reuses that same loaded element as the
// compositor's base layer.
import { captureVisibleViewport } from '@/grab/screenshot'

export type MarkupBaseImage = {
  dataUrl: string
  width: number
  height: number
}

export type MarkupCaptureSource =
  | { kind: 'tab' }
  | { kind: 'image'; element: HTMLImageElement }

export async function captureMarkupBaseImage(
  source: MarkupCaptureSource
): Promise<MarkupBaseImage> {
  if (source.kind === 'tab') {
    return captureFromTab()
  }
  return captureFromImage(source.element)
}

async function captureFromTab(): Promise<MarkupBaseImage> {
  const dataUrl = await captureVisibleViewport()
  if (!dataUrl) {
    throw new Error('markup: captureVisibleTab returned no image')
  }
  // Why: capturePage() can include an alpha channel where the page has no opaque
  // background, which would let the live webview ghost through the frozen
  // backdrop. Flatten onto white (the browser's default canvas color) so the
  // base image is fully opaque.
  const image = await loadImage(dataUrl)
  const size = { width: image.naturalWidth, height: image.naturalHeight }
  return { dataUrl: flattenToOpaquePng(image, size.width, size.height), ...size }
}

function captureFromImage(element: HTMLImageElement): MarkupBaseImage {
  const width = element.naturalWidth || element.width
  const height = element.naturalHeight || element.height
  // Why: drawImage() silently no-ops on an undecoded/detached source, yielding a
  // blank PNG. Fail fast instead so the caller surfaces an error.
  if (!element.complete || !element.isConnected || width <= 0 || height <= 0) {
    throw new Error('markup: remote frame image is not ready')
  }
  // Why: snapshot the live frame into a detached canvas (opaque white backdrop)
  // so later screencast frames can't change the base image and transparent
  // regions don't ghost the live stream through.
  return { dataUrl: flattenToOpaquePng(element, width, height), width, height }
}

function flattenToOpaquePng(image: CanvasImageSource, width: number, height: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('markup: 2d context unavailable for base image')
  }
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(image, 0, 0, width, height)
  return canvas.toDataURL('image/png')
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('markup: failed to decode captured screenshot'))
    image.src = src
  })
}
