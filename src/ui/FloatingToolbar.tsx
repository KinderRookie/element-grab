import { useCallback, useEffect, useRef, useState } from 'react'
import { GripVertical, PenTool, X } from 'lucide-react'
import { Button } from '@/ui/primitives/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/primitives/tooltip'
import { cn } from '@/lib/utils'
import {
  BrowserChromeElementToolButtons,
  type BrowserChromeElementTools
} from './browser-chrome-element-tool-buttons'

type ToolbarPosition = { right: number; top: number }

const DEFAULT_POSITION: ToolbarPosition = { right: 12, top: 12 }
const positionKey = (): string => `toolbar-position:${location.origin}`

/**
 * Chrome has no room for per-page buttons beside the address bar, so Orca's browser-chrome tool
 * cluster floats over the page instead. Dragging the grip moves it; the spot is kept per origin.
 */
export function FloatingToolbar({
  tools,
  markupActive,
  markupDisabled,
  markupShortcutLabel,
  onStartMarkup,
  onClose
}: {
  tools: BrowserChromeElementTools
  markupActive: boolean
  markupDisabled: boolean
  markupShortcutLabel?: string
  onStartMarkup: () => void
  onClose: () => void
}): React.JSX.Element {
  const [position, setPosition] = useState<ToolbarPosition>(DEFAULT_POSITION)
  const dragRef = useRef<{ startX: number; startY: number; origin: ToolbarPosition } | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void chrome.storage.local
      .get(positionKey())
      .then((stored) => {
        const saved = stored[positionKey()] as ToolbarPosition | undefined
        if (saved && Number.isFinite(saved.right) && Number.isFinite(saved.top)) {
          setPosition(clampPosition(saved, barRef.current))
        }
      })
      .catch(() => {})
  }, [])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (event.button !== 0) {
        return
      }
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      dragRef.current = { startX: event.clientX, startY: event.clientY, origin: position }
    },
    [position]
  )

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag) {
      return
    }
    setPosition(
      clampPosition(
        {
          right: drag.origin.right - (event.clientX - drag.startX),
          top: drag.origin.top + (event.clientY - drag.startY)
        },
        barRef.current
      )
    )
  }, [])

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (!dragRef.current) {
        return
      }
      dragRef.current = null
      event.currentTarget.releasePointerCapture(event.pointerId)
      void chrome.storage.local.set({ [positionKey()]: position }).catch(() => {})
    },
    [position]
  )

  const markupLabel = 'Draw on screenshot'

  return (
    <div
      ref={barRef}
      data-element-grab-toolbar=""
      className="pointer-events-auto fixed z-50 flex items-center gap-0.5 rounded-xl border border-border bg-background/95 p-1 text-foreground shadow-floating backdrop-blur-xl"
      style={{ right: position.right, top: position.top }}
    >
      <div
        className="flex h-8 w-4 cursor-grab touch-none items-center justify-center text-muted-foreground/70 active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        aria-hidden
      >
        <GripVertical className="size-3.5" />
      </div>
      <BrowserChromeElementToolButtons
        tools={tools}
        showGrab
        showAnnotate
        showTourAnchors={false}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button
              size="icon"
              variant={markupActive ? 'default' : 'ghost'}
              className={cn(
                'h-8 w-8',
                markupActive && 'bg-foreground/80 text-background hover:bg-foreground/90'
              )}
              onClick={onStartMarkup}
              disabled={markupDisabled}
              aria-label={markupLabel}
              aria-pressed={markupActive}
            >
              <PenTool className="size-4" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={4}>
          {markupShortcutLabel ? `${markupLabel} (${markupShortcutLabel})` : markupLabel}
        </TooltipContent>
      </Tooltip>
      <div className="mx-0.5 h-5 w-px bg-border" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={onClose}
            aria-label="Close Element Grab"
          >
            <X className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={4}>
          Close
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

function clampPosition(position: ToolbarPosition, bar: HTMLElement | null): ToolbarPosition {
  const width = bar?.offsetWidth ?? 200
  const height = bar?.offsetHeight ?? 40
  return {
    right: Math.min(Math.max(position.right, 0), Math.max(0, window.innerWidth - width)),
    top: Math.min(Math.max(position.top, 0), Math.max(0, window.innerHeight - height))
  }
}
