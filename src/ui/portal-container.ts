import { createContext, useContext } from 'react'

// Radix portals default to document.body, which sits outside the extension's shadow root and
// therefore outside its styles. Every primitive portals into this container instead.
export const PortalContainerContext = createContext<HTMLElement | null>(null)

export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainerContext) ?? undefined
}
