import { useSyncExternalStore } from 'react'
import { CircleCheck, OctagonX } from 'lucide-react'

// Minimal stand-in for the `sonner` toasts Orca's markup flow raises (success / error only).
type ToastEntry = { id: number; type: 'success' | 'error'; message: string }

let entries: ToastEntry[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

function push(type: ToastEntry['type'], message: string): void {
  const id = nextId++
  entries = [...entries, { id, type, message }]
  emit()
  setTimeout(() => {
    entries = entries.filter((entry) => entry.id !== id)
    emit()
  }, 4000)
}

export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function Toaster(): React.JSX.Element {
  const current = useSyncExternalStore(subscribe, () => entries)
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[80] flex -translate-x-1/2 flex-col items-center gap-2">
      {current.map((entry) => (
        <div
          key={entry.id}
          role="status"
          className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-floating animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          {entry.type === 'success' ? (
            <CircleCheck className="size-4 fill-blue-600 text-white" />
          ) : (
            <OctagonX className="size-4 text-red-500" />
          )}
          <span>{entry.message}</span>
        </div>
      ))}
    </div>
  )
}
