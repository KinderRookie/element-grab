import { toast } from '@/lib/toast'
import { translate } from '@/i18n/i18n'
import { writeClipboardImageOrThrow } from '@/lib/clipboard'
import type { MarkupComposeResult } from './markup-screenshot-compose'

// Delivery: copy the composited markup PNG to the clipboard, mirroring the browser grab
// "copy" flow, so the user can paste it into whatever tool they use next.
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
