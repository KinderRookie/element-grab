import { toast } from '@/lib/toast'
import { translate } from '@/i18n/i18n'
import { writeClipboardImageOrThrow } from '@/lib/clipboard'
import type { MarkupComposeResult } from './markup-screenshot-compose'

// Delivery for v1: copy the composited markup PNG to the clipboard, mirroring the
// browser grab "copy" flow. The user pastes it into their agent terminal, where
// Orca's existing clipboard-screenshot paste writes the image to a temp file (on
// the correct host for local or remote/SSH agents) and hands the path to the TUI.
// This reuses proven, environment-agnostic machinery instead of re-plumbing a
// direct send.
export async function deliverMarkupToClipboard(result: MarkupComposeResult): Promise<void> {
  // Throws on failure so useMarkupMode keeps the drawing open and reports the error.
  await writeClipboardImageOrThrow(result.dataUrl)
  const isMac = navigator.userAgent.includes('Mac')
  toast.success(
    translate(
      'auto.components.browser-pane.markup.copiedToast',
      'Markup copied — paste it anywhere ({{value0}})',
      { value0: isMac ? '⌘V' : 'Ctrl+V' }
    )
  )
}
