// Tracks the extension's own shadow hosts so the picker never targets them and screenshots
// never include them (Orca hides its overlays the same way before capturePage()).
const hosts = new Set<HTMLElement>()

export function registerOwnHost(host: HTMLElement): () => void {
  hosts.add(host)
  return () => hosts.delete(host)
}

export function isOwnElement(el: Element): boolean {
  for (const host of hosts) {
    if (host === el || host.contains(el)) {
      return true
    }
  }
  return false
}

/** Hides every registered host and returns a function that restores them. */
export function hideOwnHosts(): () => void {
  const previous = new Map<HTMLElement, string>()
  for (const host of hosts) {
    previous.set(host, host.style.display)
    host.style.display = 'none'
  }
  return () => {
    for (const [host, display] of previous) {
      host.style.display = display
    }
  }
}

/** The element that actually received a keyboard event, looking through shadow roots. */
export function getKeyboardEventTarget(event: Event): EventTarget | null {
  const path = event.composedPath?.()
  return path && path.length > 0 ? (path[0] ?? null) : event.target
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object' || !('closest' in target)) {
    return false
  }
  const element = target as Element
  if ((element as HTMLElement).isContentEditable) {
    return true
  }
  return !!element.closest(
    'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
  )
}
