import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { hover, invoke, readClipboardText, startHarness, type Harness } from './harness'

// Byte-for-byte comparison against Orca itself: the same element is extracted by Orca's
// original guest script + clamp + formatter (bundled from the Orca checkout in global-setup)
// and by the extension, and the copied text must be identical.
const parityBundle = path.resolve(import.meta.dirname, 'fixture/dist/orca-parity.js')
const hasOrca = (() => {
  try {
    return readFileSync(parityBundle, 'utf8').length > 0
  } catch {
    return false
  }
})()

test.skip(!hasOrca, 'Orca checkout not found (set ORCA_DIR)')

let harness: Harness
let page: Page

test.beforeAll(async () => {
  harness = await startHarness()
})

test.afterAll(async () => {
  await harness.close()
})

test.beforeEach(async () => {
  page = await harness.context.newPage()
  await page.goto(harness.baseUrl)
  await page.getByRole('button', { name: 'Save changes' }).waitFor()
  await page.addScriptTag({ path: parityBundle })
})

test.afterEach(async () => {
  await page.close()
})

async function orcaText(selector: string): Promise<string> {
  return page.evaluate((selector) => {
    const parity = (window as unknown as {
      __orcaParity: {
        armScript: string
        clampGrabPayload: (raw: unknown) => unknown
        formatGrabPayloadAsText: (payload: unknown) => string
      }
    }).__orcaParity
    // Orca runs this through webContents.executeJavaScript in the page's main world.
    // eslint-disable-next-line no-eval
    ;(0, eval)(parity.armScript)
    const grab = (window as unknown as {
      __orcaGrab: { extractPayload: (el: Element) => unknown; cleanup: () => void }
    }).__orcaGrab
    try {
      const raw = grab.extractPayload(document.querySelector(selector)!)
      return parity.formatGrabPayloadAsText(parity.clampGrabPayload(raw))
    } finally {
      grab.cleanup()
    }
  }, selector)
}

async function extensionText(selector: string): Promise<string> {
  await invoke(harness, page, 'grab')
  await hover(page, selector)
  await page.keyboard.press('c')
  await expect(page.getByText('Copied', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  return readClipboardText(page)
}

for (const [name, selector] of [
  ['React button', 'button.btn'],
  ['link', 'a[href^="/docs"]'],
  ['paragraph', '#para'],
  ['nth-of-type list item', 'ul.list > li:nth-child(2)'],
  ['hashy class', 'span.label'],
  ['toolbar container', 'div.toolbar']
] as const) {
  test(`copied text matches Orca: ${name}`, async () => {
    const expected = await orcaText(selector)
    expect(expected).toContain('Attached browser context from')
    const actual = await extensionText(selector)
    expect(actual).toBe(expected)
  })
}
