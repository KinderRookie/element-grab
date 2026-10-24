// Isolated-world half of the React metadata bridge. Content scripts cannot see the
// __reactFiber$ expandos React stores on DOM nodes, so the MAIN-world probe
// (entrypoints/react-probe.ts) reads them. Both sides share only the DOM: a marker attribute
// names the element, a synchronous CustomEvent asks the probe to run, and the probe writes its
// JSON answer to a result attribute before dispatchEvent returns.
export const REACT_PROBE_REQUEST_EVENT = 'element-grab:react-request'
export const REACT_PROBE_TARGET_ATTRIBUTE = 'data-element-grab-react-target'
export const REACT_PROBE_RESULT_ATTRIBUTE = 'data-element-grab-react-result'

export type ReactMetadata = { reactComponents: string | null; sourceFile: string | null }

const EMPTY: ReactMetadata = { reactComponents: null, sourceFile: null }

export function getReactMetadataViaMainWorld(el: Element): ReactMetadata {
  try {
    el.setAttribute(REACT_PROBE_TARGET_ATTRIBUTE, '')
    document.dispatchEvent(new CustomEvent(REACT_PROBE_REQUEST_EVENT))
    const raw = el.getAttribute(REACT_PROBE_RESULT_ATTRIBUTE)
    if (!raw) {
      return EMPTY
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      reactComponents: typeof parsed.reactComponents === 'string' ? parsed.reactComponents : null,
      sourceFile: typeof parsed.sourceFile === 'string' ? parsed.sourceFile : null
    }
  } catch {
    return EMPTY
  } finally {
    el.removeAttribute(REACT_PROBE_TARGET_ATTRIBUTE)
    el.removeAttribute(REACT_PROBE_RESULT_ATTRIBUTE)
  }
}
