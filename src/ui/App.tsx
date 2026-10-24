// Composition root for the injected UI. Mirrors Orca's browser-page-pane wiring of the element
// tools (browser-page-pane.tsx + browser-guest-annotate-overlays.tsx), minus the agent hand-off.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Copy, Image } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/ui/primitives/dropdown-menu'
import { TooltipProvider } from '@/ui/primitives/tooltip'
import { PortalContainerContext } from '@/ui/portal-container'
import { translate } from '@/i18n/i18n'
import { Toaster } from '@/lib/toast'
import { useGrabMode } from '@/grab/useGrabMode'
import { getKeyboardEventTarget, isEditableKeyboardTarget } from '@/grab/own-ui'
import { useTabAnnotations } from '@/annotate/use-tab-annotations'
import { useBrowserPageGrabAnnotations } from '@/annotate/use-grab-annotations'
import {
  getBrowserOverlayAnchor,
  type BrowserOverlayViewport
} from '@/annotate/browser-annotation-geometry'
import { PendingBrowserAnnotationCard } from '@/annotate/pending-browser-annotation-card'
import { BrowserPageAnnotationTray } from '@/annotate/browser-page-annotation-tray'
import { BrowserPageGrabToast } from '@/annotate/browser-page-grab-toast'
import { useMarkupMode, type MarkupCaptureContext } from '@/markup/useMarkupMode'
import { deliverMarkupToClipboard } from '@/markup/markup-clipboard-delivery'
import { MarkupOverlay } from '@/markup/MarkupOverlay'
import type { ElementGrabCommand, ShortcutsResponse } from '@/lib/messages'
import { sendToBackground } from '@/lib/messages'
import { FloatingToolbar } from './FloatingToolbar'

export type AppController = {
  /** Registers the handler for commands relayed by the service worker. */
  onCommand: (handler: (command: ElementGrabCommand) => void) => () => void
}

const INITIAL_VIEWPORT: BrowserOverlayViewport = { scrollX: 0, scrollY: 0, version: 0 }

export function App({ controller }: { controller: AppController }): React.JSX.Element {
  const [visible, setVisible] = useState(true)
  // Radix layers portal here: inside the themed root, but with pointer events re-enabled.
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null)
  const dark = usePrefersDark()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)
  const [browserOverlayViewport, setBrowserOverlayViewport] =
    useState<BrowserOverlayViewport>(INITIAL_VIEWPORT)
  const [shortcuts, setShortcuts] = useState<ShortcutsResponse>({})

  const annotations = useTabAnnotations()
  const browserTabId = annotations.tabId ?? 'tab'
  // Why: one picker per page. Keying it by the tab id would let the id's async arrival look
  // like Orca's "browser tab switched" case and tear down a grab the user just started.
  const grab = useGrabMode('page')
  const grabAnnotations = useBrowserPageGrabAnnotations({
    browserTabId,
    isActive: visible,
    grab,
    containerRef,
    // The page is the viewport itself, so the "guest view" and the overlay container coincide.
    webviewRef: containerRef,
    setBrowserOverlayViewport,
    browserAnnotationsLength: annotations.browserAnnotations.length,
    addBrowserPageAnnotation: annotations.addBrowserPageAnnotation
  })
  const {
    grabIntent,
    startGrabIntent,
    pendingAnnotationPayload,
    handleAddBrowserAnnotation,
    handleCancelPendingBrowserAnnotation,
    grabMenuActionTakenRef,
    handleGrabCopy,
    handleGrabCopyScreenshot,
    grabToast,
    grabToastTimerRef,
    dismissGrabToast,
    setGrabToast,
    cancelPendingBrowserCapture,
    handleGrabActionShortcut
  } = grabAnnotations

  const markup = useMarkupMode({
    getCaptureContext: useCallback(
      (): MarkupCaptureContext | null => ({
        source: { kind: 'tab' },
        cssWidth: window.innerWidth,
        cssHeight: window.innerHeight,
        outputScale: window.devicePixelRatio || 1
      }),
      []
    ),
    onDeliver: deliverMarkupToClipboard
  })

  useEffect(() => {
    void sendToBackground<ShortcutsResponse>({ type: 'element-grab:get-shortcuts' })
      .then((response) => setShortcuts(response ?? {}))
      .catch(() => {})
  }, [])

  const grabIsInteractive = grab.state !== 'idle' && grab.state !== 'error'

  const startMarkup = useCallback((): void => {
    if (markup.isActive) {
      return
    }
    // The picker and markup both own the pointer; drawing wins.
    cancelPendingBrowserCapture()
    void markup.start()
  }, [cancelPendingBrowserCapture, markup])

  const close = useCallback((): void => {
    cancelPendingBrowserCapture()
    markup.cancel()
    setVisible(false)
  }, [cancelPendingBrowserCapture, markup])

  // Commands from the toolbar icon / keyboard shortcuts (relayed by the service worker).
  const commandRef = useRef<(command: ElementGrabCommand) => void>(() => {})
  commandRef.current = (command: ElementGrabCommand): void => {
    if (command === 'toggle') {
      if (visible) {
        close()
      } else {
        setVisible(true)
      }
      return
    }
    setVisible(true)
    if (command === 'markup') {
      startMarkup()
      return
    }
    if (!markup.isActive) {
      startGrabIntent(command === 'grab' ? 'copy' : 'annotate')
    }
  }
  useEffect(() => controller.onCommand((command) => commandRef.current(command)), [controller])

  // Bare C / S copy the hovered element while the picker is live (Orca's grab action keys).
  useEffect(() => {
    if (!grabIsInteractive) {
      return
    }
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (isEditableKeyboardTarget(getKeyboardEventTarget(e))) {
        return
      }
      // Ignore if modifier keys are held — user may be doing Cmd+C etc.
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return
      }
      const key = e.key.toLowerCase()
      if (key !== 'c' && key !== 's') {
        return
      }
      e.preventDefault()
      e.stopPropagation()
      handleGrabActionShortcut(key as 'c' | 's')
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [grabIsInteractive, handleGrabActionShortcut])

  const tools = useMemo(
    () => ({
      activeIntent: grabIsInteractive ? grabIntent : null,
      onStartIntent: startGrabIntent,
      disabled: markup.isActive,
      grabShortcutLabel: shortcuts.grab ?? '',
      annotateShortcutLabel: shortcuts.annotate,
      annotationCount: annotations.browserAnnotations.length
    }),
    [
      annotations.browserAnnotations.length,
      grabIntent,
      grabIsInteractive,
      markup.isActive,
      shortcuts.annotate,
      shortcuts.grab,
      startGrabIntent
    ]
  )

  const setContainer = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node
    setContainerEl(node)
  }, [])

  return (
    <PortalContainerContext.Provider value={portalContainer}>
      <TooltipProvider>
        <div
          ref={setContainer}
          className={`element-grab-root pointer-events-none fixed inset-0 ${dark ? 'dark' : ''}`}
        >
          {visible && !markup.isActive ? (
            <FloatingToolbar
              tools={tools}
              markupActive={markup.isActive}
              markupDisabled={markup.state === 'capturing'}
              markupShortcutLabel={shortcuts.markup}
              onStartMarkup={startMarkup}
              onClose={close}
            />
          ) : null}

          {markup.isActive && markup.baseImage && containerEl
            ? createPortal(
                <div className="pointer-events-auto absolute inset-0 z-[60]">
                  <MarkupOverlay
                    baseImage={markup.baseImage}
                    busy={markup.state === 'composing'}
                    onComplete={(input) => void markup.complete(input)}
                    onCancel={markup.cancel}
                  />
                </div>,
                containerEl
              )
            : null}

          {visible && pendingAnnotationPayload ? (
            <PendingBrowserAnnotationCard
              payload={pendingAnnotationPayload}
              resolveAnchor={(cardHeight) =>
                getBrowserOverlayAnchor(
                  pendingAnnotationPayload,
                  containerRef.current,
                  containerRef.current,
                  browserOverlayViewport,
                  cardHeight
                )
              }
              portalContainer={portalContainer}
              onAdd={handleAddBrowserAnnotation}
              onCancel={handleCancelPendingBrowserAnnotation}
            />
          ) : null}

          {visible && !markup.isActive && annotations.browserAnnotations.length > 0 ? (
            <div className="pointer-events-auto">
              <BrowserPageAnnotationTray
                browserAnnotations={annotations.browserAnnotations}
                currentUrl={location.href}
                handleCopyBrowserAnnotations={annotations.handleCopyBrowserAnnotations}
                browserAnnotationsCopied={annotations.browserAnnotationsCopied}
                handleClearBrowserAnnotations={annotations.handleClearBrowserAnnotations}
                handleDeleteBrowserAnnotation={annotations.handleDeleteBrowserAnnotation}
                handleUpdateBrowserAnnotation={annotations.handleUpdateBrowserAnnotation}
              />
            </div>
          ) : null}

          {/* Right-click context dropdown, positioned at the grabbed element's center. */}
          <DropdownMenu
            open={grab.state === 'confirming' && grab.contextMenu && grabIntent === 'copy'}
            onOpenChange={(open) => {
              if (!open && grab.state === 'confirming') {
                // Why: skip rearm if a menu action already handled it — see grabMenuActionTakenRef.
                if (grabMenuActionTakenRef.current) {
                  grabMenuActionTakenRef.current = false
                  return
                }
                grab.rearm()
              }
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                aria-hidden
                tabIndex={-1}
                className="pointer-events-none absolute size-px opacity-0"
                style={(() => {
                  if (!grab.payload) {
                    return { left: 0, top: 0 }
                  }
                  const rect = grab.payload.target.rectViewport
                  return {
                    left: rect.x + rect.width / 2,
                    top: rect.y + rect.height / 2
                  }
                })()}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={4}>
              <DropdownMenuItem onSelect={handleGrabCopy}>
                <Copy className="size-3.5" />
                {translate('auto.components.browser.pane.BrowserPane.c2ef0359b9', 'Copy Contents')}
                <DropdownMenuShortcut>C</DropdownMenuShortcut>
              </DropdownMenuItem>
              {grab.payload?.screenshot?.dataUrl?.startsWith('data:image/png;base64,') ? (
                <DropdownMenuItem onSelect={handleGrabCopyScreenshot}>
                  <Image className="size-3.5" />
                  {translate(
                    'auto.components.browser.pane.BrowserPane.1ded0d3168',
                    'Copy Screenshot'
                  )}
                  <DropdownMenuShortcut>S</DropdownMenuShortcut>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  grabMenuActionTakenRef.current = true
                  grab.cancel()
                }}
              >
                {translate('auto.components.browser.pane.BrowserPane.fa6ea61de3', 'Cancel')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Inline toast bubble; flips above the element when near the viewport bottom. */}
          {grabToast ? (
            <div className="pointer-events-auto">
              <BrowserPageGrabToast
                grabToast={grabToast}
                grabToastTimerRef={grabToastTimerRef}
                dismissGrabToast={dismissGrabToast}
                setGrabToast={setGrabToast}
              />
            </div>
          ) : null}

          <Toaster />
          {/* Full-viewport so Radix collision handling sees the real bounds; only the layers
              portaled into it take pointer events. */}
          <div
            ref={setPortalContainer}
            className="pointer-events-none fixed inset-0 z-[70] [&>*]:pointer-events-auto"
          />
        </div>
      </TooltipProvider>
    </PortalContainerContext.Provider>
  )
}

function usePrefersDark(): boolean {
  const [dark, setDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  )
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!query) {
      return
    }
    const onChange = (): void => setDark(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return dark
}
