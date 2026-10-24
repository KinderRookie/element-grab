import { chromium, type BrowserContext, type Page, type Worker } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const extensionPath = path.join(root, '.output-e2e/chrome-mv3')
const fixtureDir = path.join(root, 'e2e/fixture')

export type Harness = {
  context: BrowserContext
  worker: Worker
  baseUrl: string
  close: () => Promise<void>
}

export async function startHarness(): Promise<Harness> {
  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const file = url.pathname === '/' ? '/index.html' : url.pathname
    try {
      const body = await readFile(path.join(fixtureDir, path.normalize(file)))
      res.writeHead(200, {
        'content-type': file.endsWith('.js') ? 'text/javascript' : 'text/html'
      })
      res.end(body)
    } catch {
      res.writeHead(404)
      res.end('not found')
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0

  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1200, height: 800 },
    permissions: ['clipboard-read', 'clipboard-write'],
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  })
  let [worker] = context.serviceWorkers()
  if (!worker) {
    worker = await context.waitForEvent('serviceworker')
  }
  return {
    context,
    worker,
    // localhost is a secure context, so the async clipboard API is available to the page.
    baseUrl: `http://localhost:${port}/`,
    close: async () => {
      await context.close()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }
}

/** Simulates the action icon / keyboard command, which Playwright cannot press itself. */
export async function invoke(
  harness: Harness,
  page: Page,
  command: 'toggle' | 'grab' | 'annotate' | 'markup'
): Promise<void> {
  await page.bringToFront()
  await harness.worker.evaluate(
    async ({ url, command }) => {
      const tabs = await chrome.tabs.query({})
      const tab = tabs.find((candidate) => candidate.url === url)
      if (!tab?.id) {
        throw new Error(`no tab for ${url}`)
      }
      await (
        globalThis as unknown as {
          __elementGrabTest: { invoke: (tabId: number, command: string) => Promise<void> }
        }
      ).__elementGrabTest.invoke(tab.id, command)
    },
    { url: page.url(), command }
  )
}

export async function readClipboardText(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText())
}

export async function readClipboardImageSize(
  page: Page
): Promise<{ width: number; height: number } | null> {
  return page.evaluate(async () => {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      if (item.types.includes('image/png')) {
        const bitmap = await createImageBitmap(await item.getType('image/png'))
        return { width: bitmap.width, height: bitmap.height }
      }
    }
    return null
  })
}

export async function hover(page: Page, selector: string): Promise<void> {
  const box = await page.locator(selector).boundingBox()
  if (!box) {
    throw new Error(`no box for ${selector}`)
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 })
  // The picker highlights on the next animation frame.
  await page.waitForTimeout(100)
}
