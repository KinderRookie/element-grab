// MAIN-world half of the React metadata bridge (see grab/react-bridge.ts). Injected alongside
// the content script with chrome.scripting.executeScript({ world: 'MAIN' }).
import { installReactProbe } from '@/grab/react-probe-core'
import {
  REACT_PROBE_REQUEST_EVENT,
  REACT_PROBE_RESULT_ATTRIBUTE,
  REACT_PROBE_TARGET_ATTRIBUTE
} from '@/grab/react-bridge'

// Verbatim from Orca's grab-guest-foundation-script.ts, which the probe's fiber walk relies on.
const BUDGET = { sourceFileMaxLength: 500, reactComponentsMaxLength: 500 }
const SECRET_PATTERNS = [
  'access_token', 'auth_token', 'api_key', 'apikey', 'client_secret',
  'oauth_state', 'x-amz-', 'session_id', 'sessionid', 'csrf',
  'secret', 'password', 'passwd'
]

function clampStr(s: string, max: number): string {
  if (!s || typeof s !== 'string') return ''
  if (s.length <= max) return s
  return s.slice(0, max) + ' (truncated)'
}

function containsSecret(value: string): boolean {
  if (!value) return false
  const lower = value.toLowerCase()
  for (let i = 0; i < SECRET_PATTERNS.length; i++) {
    if (lower.indexOf(SECRET_PATTERNS[i]!) !== -1) return true
  }
  return false
}

declare global {
  interface Window {
    __elementGrabReactProbe?: boolean
  }
}

export default defineUnlistedScript(() => {
  if (window.__elementGrabReactProbe) {
    return
  }
  window.__elementGrabReactProbe = true
  const getReactMetadata = installReactProbe(containsSecret, clampStr, BUDGET)
  document.addEventListener(REACT_PROBE_REQUEST_EVENT, () => {
    const el = document.querySelector(`[${REACT_PROBE_TARGET_ATTRIBUTE}]`)
    if (!el) {
      return
    }
    try {
      el.setAttribute(REACT_PROBE_RESULT_ATTRIBUTE, JSON.stringify(getReactMetadata(el)))
    } catch {
      // A missing answer reads as "no React metadata", matching Orca's catch path.
    }
  })
})
