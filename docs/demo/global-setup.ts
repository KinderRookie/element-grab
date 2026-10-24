import { execSync } from 'node:child_process'
import { build } from 'esbuild'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')

export default async function globalSetup(): Promise<void> {
  execSync('pnpm wxt build', { cwd: root, stdio: 'inherit', env: { ...process.env, WXT_E2E: '1' } })
  // Development React keeps component names on fibers, so Grab shows the component tree.
  await build({
    entryPoints: [path.join(root, 'docs/demo/app.tsx')],
    bundle: true,
    outfile: path.join(root, 'docs/demo/dist/app.js'),
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"' },
    logLevel: 'warning'
  })
}
