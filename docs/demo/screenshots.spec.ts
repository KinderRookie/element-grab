// Captures the README screenshots: the real extension (E2E build) driven on the demo page, each
// shot framed as a browser window. Run with `pnpm screenshots`; the copied text lands in
// test-results/readme-output/ for pasting into the README.
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { hover, invoke, readClipboardText, startHarness, type Harness } from '../../e2e/harness'

const root = path.resolve(import.meta.dirname, '../..')
const imagesDir = path.join(root, 'docs/images')
const outputDir = path.join(root, 'test-results/readme-output')
const PORT = 4173

let harness: Harness
let page: Page

test.beforeAll(async () => {
  mkdirSync(imagesDir, { recursive: true })
  mkdirSync(outputDir, { recursive: true })
  harness = await startHarness({
    fixtureDir: path.join(root, 'docs/demo'),
    port: PORT,
    deviceScaleFactor: 2
  })
  // Park the toolbar below the site header instead of over its Log in button.
  await harness.worker.evaluate(
    (key) => chrome.storage.local.set({ [key]: { right: 40, top: 92 } }),
    `toolbar-position:http://localhost:${PORT}`
  )
})

test.afterAll(async () => {
  await harness.close()
})

test.beforeEach(async () => {
  page = await harness.context.newPage()
  await page.goto(harness.baseUrl)
  await page.locator('.hero-heading').waitFor()
})

test.afterEach(async () => {
  await page.close()
})

async function center(selector: string): Promise<{ x: number; y: number }> {
  const box = (await page.locator(selector).boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** Wraps a page screenshot in a browser-window frame and writes it to docs/images. */
async function saveFramed(name: string, cursor?: { x: number; y: number }): Promise<void> {
  const shot = (await page.screenshot()).toString('base64')
  const icon = readFileSync(path.join(root, 'public/icon/32.png')).toString('base64')
  const pointer = cursor
    ? `<svg class="cursor" style="left:${cursor.x}px;top:${cursor.y}px" width="20" height="28" viewBox="0 0 20 28"><path d="M2 2v20l5-5 4 9 3-1.4-4-8.6h7z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`
    : ''
  const frame = await harness.context.newPage()
  await frame.setViewportSize({ width: 1260, height: 960 })
  await frame.setContent(`<!doctype html><html><head><style>
    body { margin: 0; padding: 30px; background: transparent; font: 13px -apple-system, system-ui, sans-serif; }
    .win { width: 1200px; border-radius: 12px; overflow: hidden; background: #202124;
      box-shadow: 0 0 0 1px rgba(0,0,0,.35), 0 18px 40px rgba(0,0,0,.28); }
    .tabs { height: 38px; display: flex; align-items: flex-end; padding: 0 12px; gap: 14px; }
    .lights { display: flex; gap: 8px; align-self: center; margin-right: 8px; }
    .lights i { width: 12px; height: 12px; border-radius: 50%; display: block; }
    .tab { height: 30px; width: 240px; background: #35363a; border-radius: 9px 9px 0 0; color: #e8eaed;
      display: flex; align-items: center; gap: 8px; padding: 0 12px; }
    .fav { width: 14px; height: 14px; border-radius: 4px; background: linear-gradient(135deg,#0ea5e9,#6366f1); }
    .bar { height: 40px; background: #35363a; display: flex; align-items: center; gap: 14px; padding: 0 14px; color: #9aa0a6; }
    .url { flex: 1; height: 28px; border-radius: 14px; background: #202124; color: #e8eaed; display: flex; align-items: center; padding: 0 14px; }
    .ext { width: 18px; height: 18px; }
    .page { position: relative; line-height: 0; }
    .page img { width: 1200px; }
    .cursor { position: absolute; }
  </style></head><body><div class="win">
    <div class="tabs"><div class="lights"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div>
      <div class="tab"><span class="fav"></span>Tidewater — plan releases together</div></div>
    <div class="bar">&#8592; &#8594; &#8635;<div class="url">localhost:${PORT}</div><img class="ext" src="data:image/png;base64,${icon}"></div>
    <div class="page"><img src="data:image/png;base64,${shot}">${pointer}</div>
  </div></body></html>`)
  await frame.locator('.win').evaluate((el) => el.querySelector<HTMLImageElement>('.page img')!.decode())
  await frame.locator('body').screenshot({ path: path.join(imagesDir, `${name}.png`), omitBackground: true })
  await frame.close()
}

test('grab', async () => {
  await invoke(harness, page, 'grab')
  // Aim at the dark first words: the heading's center is inside its muted <span>.
  const box = (await page.locator('.hero-heading').boundingBox())!
  const point = { x: box.x + 120, y: box.y + 40 }
  await page.mouse.move(point.x, point.y, { steps: 4 })
  await page.waitForTimeout(100)
  await page.mouse.click(point.x, point.y)
  await expect(page.getByText('Copied', { exact: true })).toBeVisible()
  await page.waitForTimeout(250)
  await saveFramed('grab', point)
  writeFileSync(path.join(outputDir, 'grab.txt'), await readClipboardText(page))
})

async function annotate(
  selector: string,
  comment: string,
  { add, question = false }: { add: boolean; question?: boolean }
): Promise<void> {
  const field = page.getByPlaceholder('Add a comment or question about this element...')
  await hover(page, selector)
  const point = await center(selector)
  await page.mouse.click(point.x, point.y)
  // Annotate mode may end after each Add; re-arm it only when the card did not open.
  if (!(await field.waitFor({ timeout: 1500 }).then(() => true, () => false))) {
    await invoke(harness, page, 'annotate')
    await hover(page, selector)
    await page.mouse.click(point.x, point.y)
  }
  await expect(field).toBeVisible()
  await field.fill(comment)
  if (question) {
    await page.getByRole('radio', { name: 'Question' }).click()
  }
  if (add) {
    await page.getByRole('button', { name: /^Add/ }).click()
    await expect(field).toHaveCount(0)
  }
}

test('annotate', async () => {
  await invoke(harness, page, 'annotate')
  await annotate('.hero-actions .btn-primary', 'Make the trial button stand out more', { add: true })
  await annotate('.task:nth-child(3)', 'Should "In review" use a stronger color?', {
    add: true,
    question: true
  })
  await annotate('.hero-copy', 'Can we shorten this to one line?', { add: false })
  await expect(page.getByText('Annotation added')).toHaveCount(0, { timeout: 10_000 })
  await page.waitForTimeout(250)
  await saveFramed('annotate')

  await page.getByRole('button', { name: /^Add/ }).click()
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  writeFileSync(path.join(outputDir, 'annotate.md'), await readClipboardText(page))
})

test('markup', async () => {
  await invoke(harness, page, 'markup')
  await expect(page.getByRole('button', { name: 'Rectangle' })).toBeVisible()
  const drag = async (from: [number, number], to: [number, number]): Promise<void> => {
    await page.mouse.move(...from)
    await page.mouse.down()
    await page.mouse.move(...to, { steps: 8 })
    await page.mouse.up()
  }
  const board = (await page.locator('.board').boundingBox())!
  await page.getByRole('button', { name: 'Rectangle' }).click()
  await drag([board.x - 10, board.y - 10], [board.x + board.width + 10, board.y + board.height + 10])
  await page.getByRole('button', { name: 'Arrow' }).click()
  await drag([board.x - 150, board.y + board.height + 90], [board.x - 18, board.y + board.height - 10])
  await page.waitForTimeout(250)
  await saveFramed('markup')
})
