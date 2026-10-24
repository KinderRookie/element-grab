import { defineConfig } from 'wxt'

// E2E builds (WXT_E2E=1) add a host permission so Playwright can inject without the activeTab
// gesture it cannot synthesize, and a test hook on the service worker. Never ship these.
const e2e = process.env.WXT_E2E === '1'

export default defineConfig({
  srcDir: 'src',
  outDir: e2e ? '.output-e2e' : '.output',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Element Grab',
    description:
      'Grab, annotate and mark up page elements, then copy their context, comments or a marked-up screenshot to paste anywhere.',
    permissions: ['activeTab', 'scripting', 'storage', 'clipboardWrite'],
    ...(e2e ? { host_permissions: ['<all_urls>'] } : {}),
    action: {
      default_title: 'Element Grab (Alt+Shift+E)',
      default_icon: { 16: 'icon/16.png', 32: 'icon/32.png' }
    },
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+E' },
        description: 'Show or hide the Element Grab toolbar'
      },
      grab: {
        suggested_key: { default: 'Alt+Shift+G' },
        description: 'Grab page element'
      },
      annotate: {
        suggested_key: { default: 'Alt+Shift+N' },
        description: 'Annotate page element'
      },
      markup: {
        suggested_key: { default: 'Alt+Shift+M' },
        description: 'Draw on screenshot'
      }
    }
  }
})
