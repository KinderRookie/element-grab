import { execSync } from 'node:child_process'
import { build } from 'esbuild'
import path from 'node:path'

export default async function globalSetup(): Promise<void> {
  const root = path.resolve(import.meta.dirname, '..')
  execSync('pnpm wxt build', { cwd: root, stdio: 'inherit', env: { ...process.env, WXT_E2E: '1' } })
  // A development React build keeps component names on fibers, like a local dev server would.
  await build({
    entryPoints: [path.join(root, 'e2e/fixture/app.tsx')],
    bundle: true,
    outfile: path.join(root, 'e2e/fixture/dist/app.js'),
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"' },
    logLevel: 'warning'
  })
}
