import { expect, test, type Page } from '@playwright/test'
import {
  hover,
  invoke,
  readClipboardImageSize,
  readClipboardText,
  startHarness,
  type Harness
} from './harness'

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
})

test.afterEach(async () => {
  await page.close()
})

const toolbar = (): ReturnType<Page['locator']> => page.locator('[data-element-grab-toolbar]')

test('toolbar toggles from the action', async () => {
  await invoke(harness, page, 'toggle')
  await expect(toolbar()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Grab page element' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Annotate page element' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Draw on screenshot' })).toBeVisible()
  await invoke(harness, page, 'toggle')
  await expect(toolbar()).toHaveCount(0)
})

test('grab: left click copies Orca-format context including React metadata', async () => {
  await invoke(harness, page, 'grab')
  await hover(page, 'button.btn')
  const box = (await page.locator('button.btn').boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

  await expect(page.getByText('Copied', { exact: true })).toBeVisible()
  const text = await readClipboardText(page)
  expect(text).toContain(`Attached browser context from ${harness.baseUrl}`)
  expect(text).toContain('Selected element:\nbutton')
  expect(text).toContain('Accessible name: "Save changes"')
  expect(text).toContain('Selector: button.btn.primary')
  expect(text).toContain('React: <App> <Toolbar> <SaveButton>')
  expect(text).toContain('Text content:\nSave')
  expect(text).toContain('HTML:\n<button class="btn primary" aria-label="Save changes">Save</button>')
  // The click must not reach the page.
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BUTTON')
})

test('grab: page URL drops query and hash before leaving the page', async () => {
  await page.goto(`${harness.baseUrl}?access_token=abc#frag`)
  await page.getByRole('button', { name: 'Save changes' }).waitFor()
  await invoke(harness, page, 'grab')
  await hover(page, 'a[href^="/docs"]')
  await page.keyboard.press('c')
  await expect(page.getByText('Copied', { exact: true })).toBeVisible()
  const text = await readClipboardText(page)
  expect(text.split('\n')[0]).toBe(`Attached browser context from ${harness.baseUrl}`)
  expect(text).toContain('Selected element:\na')
  expect(text).toContain('React: <App> <Toolbar>')
})

test('grab: C copies the hovered element without clicking and stays armed', async () => {
  await invoke(harness, page, 'grab')
  await hover(page, '#para')
  await page.keyboard.press('c')
  await expect(page.getByText('Copied', { exact: true })).toBeVisible()
  expect(await readClipboardText(page)).toContain('Text content:\nSome paragraph text here.')
  await expect(page.getByRole('button', { name: 'Grab page element' })).toHaveClass(
    /bg-foreground\/80/
  )
})

test('grab: S copies a cropped element screenshot', async () => {
  await invoke(harness, page, 'grab')
  await hover(page, 'button.btn')
  await page.keyboard.press('s')
  await expect(page.getByText('Screenshotted', { exact: true })).toBeVisible()
  const size = await readClipboardImageSize(page)
  const box = (await page.locator('button.btn').boundingBox())!
  expect(size).not.toBeNull()
  expect(Math.abs(size!.width - Math.round(box.width))).toBeLessThanOrEqual(2)
  expect(Math.abs(size!.height - Math.round(box.height))).toBeLessThanOrEqual(2)
})

test('grab: right click opens the action menu', async () => {
  await invoke(harness, page, 'grab')
  await hover(page, '#para')
  const box = (await page.locator('#para').boundingBox())!
  await page.mouse.click(box.x + 10, box.y + box.height / 2, { button: 'right' })
  await expect(page.getByRole('menuitem', { name: /Copy Contents/ })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /Copy Screenshot/ })).toBeVisible()
  await page.getByRole('menuitem', { name: /Copy Contents/ }).click()
  await expect(page.getByText('Copied', { exact: true })).toBeVisible()
  expect(await readClipboardText(page)).toContain('Some paragraph text here.')
})

test('grab: Escape exits the picker', async () => {
  await invoke(harness, page, 'grab')
  const grabButton = page.getByRole('button', { name: 'Grab page element' })
  await expect(grabButton).toHaveClass(/bg-foreground\/80/)
  await page.keyboard.press('Escape')
  await expect(grabButton).not.toHaveClass(/bg-foreground\/80/)
})

test('annotate: add, survive reload, copy markdown', async () => {
  await invoke(harness, page, 'annotate')
  await hover(page, 'button.btn')
  const box = (await page.locator('button.btn').boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

  const comment = page.getByPlaceholder('Describe what the agent should change here...')
  await expect(comment).toBeVisible()
  await comment.fill('Make this button green')
  await page.getByRole('button', { name: /^Add/ }).click()
  await expect(page.getByText('1 annotation')).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'Save changes' }).waitFor()
  await expect(toolbar()).toHaveCount(0)
  await invoke(harness, page, 'toggle')
  await expect(page.getByText('1 annotation')).toBeVisible()

  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  const markdown = await readClipboardText(page)
  expect(markdown).toContain('## Design Feedback: /')
  expect(markdown).toContain('### 1. <App> <Toolbar> <SaveButton> button "Save changes"')
  expect(markdown).toContain('**Intent:** change')
  expect(markdown).toContain('**Selector:** `button.btn.primary`')
  expect(markdown).toContain('**Feedback:** Make this button green')

  await page.getByRole('button', { name: 'Clear browser annotations' }).click()
  await expect(page.getByText('1 annotation')).toHaveCount(0)
})

test('markup: draw a rectangle and copy the composed screenshot', async () => {
  await invoke(harness, page, 'markup')
  await expect(page.getByRole('button', { name: 'Rectangle' })).toBeVisible()
  await page.getByRole('button', { name: 'Rectangle' }).click()
  await page.mouse.move(200, 200)
  await page.mouse.down()
  await page.mouse.move(400, 320, { steps: 5 })
  await page.mouse.up()
  await page.getByRole('button', { name: /Copy|Done/ }).last().click()
  await expect(page.getByText(/Markup copied/)).toBeVisible()
  const size = await readClipboardImageSize(page)
  expect(size).not.toBeNull()
  expect(size!.width).toBeGreaterThan(0)
})

test('grab: picker wins over page widgets that also max out z-index', async () => {
  await invoke(harness, page, 'grab')
  await hover(page, '#widget')
  const box = (await page.locator('#widget').boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.getByText('Copied', { exact: true })).toBeVisible()
  const text = await readClipboardText(page)
  expect(text).toContain('Selector: div#widget')
  expect(text).toContain('Text content:\nChat widget')
})

// Playwright's Chromium does not bring an unpacked extension back after chrome.runtime.reload(),
// so the two halves of the reload story are exercised separately.
test('stale DOM from a previous extension instance is replaced on invoke', async () => {
  // What an orphaned copy leaves behind: its hosts, but no listener answering the worker's ping.
  await page.evaluate(() => {
    document.documentElement.appendChild(document.createElement('element-grab-ui'))
    const host = document.createElement('div')
    host.id = '__element-grab-host'
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;'
    document.documentElement.appendChild(host)
  })
  await invoke(harness, page, 'grab')
  await expect(page.locator('element-grab-ui')).toHaveCount(1)
  await expect(toolbar()).toBeVisible()
  await hover(page, '#para')
  await page.keyboard.press('c')
  await expect(page.getByText('Copied', { exact: true })).toBeVisible()
  expect(await readClipboardText(page)).toContain('Some paragraph text here.')
})

test('the dispose event tears a copy down and a re-invoke starts fresh', async () => {
  await invoke(harness, page, 'grab')
  await expect(toolbar()).toBeVisible()
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('element-grab:dispose')))
  await expect(page.locator('element-grab-ui')).toHaveCount(0)
  expect(await page.evaluate(() => !!document.getElementById('__element-grab-host'))).toBe(false)

  await invoke(harness, page, 'grab')
  await expect(page.locator('element-grab-ui')).toHaveCount(1)
  await hover(page, 'button.btn')
  await page.keyboard.press('c')
  await expect(page.getByText('Copied', { exact: true })).toBeVisible()
})
