import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { build } from 'esbuild'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const dist = path.join(root, 'e2e/fixture/dist')
export const orcaDir = path.resolve(process.env.ORCA_DIR ?? path.join(root, '../orca'))

export default async function globalSetup(): Promise<void> {
  execSync('pnpm wxt build', { cwd: root, stdio: 'inherit', env: { ...process.env, WXT_E2E: '1' } })
  // A development React build keeps component names on fibers, like a local dev server would.
  await build({
    entryPoints: [path.join(root, 'e2e/fixture/app.tsx')],
    bundle: true,
    outfile: path.join(dist, 'app.js'),
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"' },
    logLevel: 'warning'
  })
  await buildOrcaParityBundle()
}

/**
 * Bundles Orca's own grab pipeline, straight from an Orca checkout, for the parity test:
 * the guest ARM script (as a string to eval in the page), the main-process payload clamp, and
 * the renderer's text formatter. The formatter's file also holds a React component with app-only
 * imports, so only the function is lifted out of it.
 */
async function buildOrcaParityBundle(): Promise<void> {
  const target = path.join(dist, 'orca-parity.js')
  const sheet = path.join(
    orcaDir,
    'src/renderer/src/components/browser-pane/annotate/GrabConfirmationSheet.tsx'
  )
  if (!existsSync(sheet)) {
    writeFileSync(target, '')
    return
  }
  const source = readFileSync(sheet, 'utf8')
  const start = source.indexOf('export function formatGrabPayloadAsText')
  const end = source.indexOf('\n}\n', start) + 3
  const generated = path.join(root, 'e2e/fixture/dist/generated')
  mkdirSync(generated, { recursive: true })
  writeFileSync(
    path.join(generated, 'orca-format.ts'),
    `// Lifted verbatim from ${path.relative(root, sheet)}\ntype BrowserGrabPayload = any\n${source.slice(start, end)}`
  )
  writeFileSync(
    path.join(generated, 'entry.ts'),
    [
      `import { buildGuestOverlayScript } from ${JSON.stringify(path.join(orcaDir, 'src/main/browser/grab-guest-script.ts'))}`,
      `import { clampGrabPayload } from ${JSON.stringify(path.join(orcaDir, 'src/main/browser/browser-grab-payload.ts'))}`,
      `import { formatGrabPayloadAsText } from './orca-format'`,
      `;(window as any).__orcaParity = { armScript: buildGuestOverlayScript('arm'), clampGrabPayload, formatGrabPayloadAsText }`
    ].join('\n')
  )
  await build({
    entryPoints: [path.join(generated, 'entry.ts')],
    bundle: true,
    outfile: target,
    format: 'iife',
    logLevel: 'warning'
  })
}
