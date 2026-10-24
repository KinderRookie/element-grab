import type { ReactMetadata } from './react-bridge'

export function installReactProbe(
  containsSecret: (value: string) => boolean,
  clampStr: (value: string, max: number) => string,
  budget: { sourceFileMaxLength: number; reactComponentsMaxLength: number }
): (el: Element) => ReactMetadata
