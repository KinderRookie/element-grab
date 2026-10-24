// Stands in for Orca's app-store annotation slice plus use-browser-page-annotation-send:
// annotations live in chrome.storage.session under this tab's id (owned by the service worker,
// so they survive reloads and in-tab navigation and vanish with the tab).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BrowserAnnotationIntent, BrowserPageAnnotation } from '@/shared/browser-grab-types'
import { formatBrowserAnnotationsAsMarkdown } from '@/format/browser-annotation-output'
import { writeClipboardText } from '@/lib/clipboard'
import { sendToBackground, type AnnotationsResponse } from '@/lib/messages'

export type TabAnnotations = {
  tabId: string | null
  browserAnnotations: BrowserPageAnnotation[]
  addBrowserPageAnnotation: (annotation: BrowserPageAnnotation) => void
  browserAnnotationsCopied: boolean
  handleCopyBrowserAnnotations: () => void
  handleClearBrowserAnnotations: () => void
  handleDeleteBrowserAnnotation: (annotationId: string) => void
  handleUpdateBrowserAnnotation: (
    annotationId: string,
    comment: string,
    intent: BrowserAnnotationIntent
  ) => void
}

export function useTabAnnotations(): TabAnnotations {
  const [tabId, setTabId] = useState<string | null>(null)
  const [browserAnnotations, setBrowserAnnotations] = useState<BrowserPageAnnotation[]>([])
  const browserAnnotationsRef = useRef(browserAnnotations)
  const [browserAnnotationsCopied, setBrowserAnnotationsCopied] = useState(false)
  const annotationCopyTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    let cancelled = false
    void sendToBackground<AnnotationsResponse>({ type: 'element-grab:annotations-get' }).then(
      (response) => {
        if (cancelled || !response) {
          return
        }
        setTabId(String(response.tabId))
        // Why: keep anything added before storage answered (a fast first pick).
        const merged = [
          ...response.annotations.filter(
            (stored) => !browserAnnotationsRef.current.some((local) => local.id === stored.id)
          ),
          ...browserAnnotationsRef.current
        ]
        browserAnnotationsRef.current = merged
        setBrowserAnnotations(merged)
      }
    )
    return () => {
      cancelled = true
      clearTimeout(annotationCopyTimerRef.current)
    }
  }, [])

  const commit = useCallback((next: BrowserPageAnnotation[]): void => {
    browserAnnotationsRef.current = next
    setBrowserAnnotations(next)
    void sendToBackground({ type: 'element-grab:annotations-set', annotations: next })
  }, [])

  const copyPrompt = useMemo(
    () => formatBrowserAnnotationsAsMarkdown(browserAnnotations),
    [browserAnnotations]
  )

  const addBrowserPageAnnotation = useCallback(
    (annotation: BrowserPageAnnotation): void => {
      commit([...browserAnnotationsRef.current, annotation])
    },
    [commit]
  )

  const handleCopyBrowserAnnotations = useCallback((): void => {
    if (!copyPrompt) {
      return
    }
    void writeClipboardText(copyPrompt)
    clearTimeout(annotationCopyTimerRef.current)
    setBrowserAnnotationsCopied(true)
    annotationCopyTimerRef.current = setTimeout(() => setBrowserAnnotationsCopied(false), 1400)
  }, [copyPrompt])

  const handleClearBrowserAnnotations = useCallback((): void => {
    if (browserAnnotationsRef.current.length === 0) {
      return
    }
    clearTimeout(annotationCopyTimerRef.current)
    setBrowserAnnotationsCopied(false)
    commit([])
  }, [commit])

  const handleDeleteBrowserAnnotation = useCallback(
    (annotationId: string): void => {
      if (browserAnnotationsRef.current.length === 1) {
        clearTimeout(annotationCopyTimerRef.current)
        setBrowserAnnotationsCopied(false)
      }
      commit(browserAnnotationsRef.current.filter((annotation) => annotation.id !== annotationId))
    },
    [commit]
  )

  const handleUpdateBrowserAnnotation = useCallback(
    (annotationId: string, comment: string, intent: BrowserAnnotationIntent): void => {
      commit(
        browserAnnotationsRef.current.map((annotation) =>
          annotation.id === annotationId ? { ...annotation, comment, intent } : annotation
        )
      )
    },
    [commit]
  )

  return {
    tabId,
    browserAnnotations,
    addBrowserPageAnnotation,
    browserAnnotationsCopied,
    handleCopyBrowserAnnotations,
    handleClearBrowserAnnotations,
    handleDeleteBrowserAnnotation,
    handleUpdateBrowserAnnotation
  }
}
