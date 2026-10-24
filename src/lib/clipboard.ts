// Replaces Orca's window.api.ui.writeClipboardText / writeClipboardImage (Electron clipboard).
// navigator.clipboard needs a secure, focused document; plain-http pages fall back to the
// legacy copy command, which content scripts may run thanks to the clipboardWrite permission.

import { toast } from './toast'

// Orca's clipboard IPC never rejects into the UI; mirror that by surfacing failures as a toast
// instead of throwing, so callers can keep their fire-and-forget `void write…()` shape.
export async function writeClipboardText(text: string): Promise<void> {
  try {
    await writeText(text)
  } catch {
    toast.error("Couldn't copy to clipboard")
  }
}

export async function writeClipboardImage(dataUrl: string): Promise<void> {
  try {
    await writeClipboardImageOrThrow(dataUrl)
  } catch (error) {
    toast.error(error instanceof Error && error.message ? error.message : "Couldn't copy image")
  }
}

async function writeText(text: string): Promise<void> {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Fall through: the document may have lost focus to our own shadow UI or devtools.
    }
  }
  if (!execCommandCopy(text)) {
    throw new Error('Clipboard write failed')
  }
}

export async function writeClipboardImageOrThrow(dataUrl: string): Promise<void> {
  if (!window.isSecureContext || typeof ClipboardItem === 'undefined') {
    throw new Error('Image clipboard needs a secure (https) page')
  }
  const blob = await (await fetch(dataUrl)).blob()
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

function execCommandCopy(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;'
  document.documentElement.appendChild(textarea)
  const previous = document.activeElement as HTMLElement | null
  textarea.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  textarea.remove()
  previous?.focus?.()
  return ok
}
