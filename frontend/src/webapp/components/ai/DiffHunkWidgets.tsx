import { useLayoutEffect, useRef, useState, type RefObject } from "react"
import { Check, X } from "lucide-react"
import type { Editor as TiptapEditor } from "@tiptap/react"
import "./DiffHunkWidgets.css"

type DiffHunkWidgetsProps = {
  editor: TiptapEditor | null
  containerRef: RefObject<HTMLElement | null>
  onAcceptHunk: (hunkId: string) => void
  onRejectHunk: (hunkId: string) => void
}

type Anchor = {
  hunkId: string
  top: number
}

function safeGetDom(editor: TiptapEditor): HTMLElement | null {
  try {
    const dom = editor.view?.dom as HTMLElement | undefined
    return dom ?? null
  } catch {
    return null
  }
}

export default function DiffHunkWidgets({
  editor,
  containerRef,
  onAcceptHunk,
  onRejectHunk,
}: DiffHunkWidgetsProps) {
  const [anchors, setAnchors] = useState<Anchor[]>([])
  const rafRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    if (!editor) {
      setAnchors((prev) => (prev.length === 0 ? prev : []))
      return
    }
    if ((editor as { isDestroyed?: boolean }).isDestroyed) return

    const container = containerRef.current
    if (!container) return

    let observer: MutationObserver | null = null
    let pollHandle: number | null = null
    let stopped = false

    const update = () => {
      if (stopped) return
      if (rafRef.current !== null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        if (stopped) return
        const dom = safeGetDom(editor)
        if (!dom || !container.isConnected) return
        let containerRect: DOMRect
        try {
          containerRect = container.getBoundingClientRect()
        } catch {
          return
        }
        const seen = new Set<string>()
        const next: Anchor[] = []
        const elements = dom.querySelectorAll<HTMLElement>("[data-hunk-id]")
        elements.forEach((el) => {
          const hunkId = el.dataset.hunkId
          if (!hunkId || seen.has(hunkId)) return
          seen.add(hunkId)
          const rect = el.getBoundingClientRect()
          next.push({
            hunkId,
            top: rect.top - containerRect.top + container.scrollTop,
          })
        })
        next.sort((a, b) => a.top - b.top)
        setAnchors((prev) => {
          if (prev.length === next.length && prev.every((a, i) => a.hunkId === next[i].hunkId && Math.abs(a.top - next[i].top) < 0.5)) {
            return prev
          }
          return next
        })
      })
    }

    const tryAttachObserver = (): boolean => {
      const dom = safeGetDom(editor)
      if (!dom) return false
      observer = new MutationObserver(update)
      observer.observe(dom, { childList: true, subtree: true, attributes: true, characterData: true })
      return true
    }

    const startPolling = () => {
      const tick = () => {
        if (stopped) return
        if (tryAttachObserver()) {
          pollHandle = null
          update()
          return
        }
        pollHandle = requestAnimationFrame(tick)
      }
      pollHandle = requestAnimationFrame(tick)
    }

    if (!tryAttachObserver()) {
      startPolling()
    }

    update()

    container.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    try {
      editor.on("update", update)
      editor.on("transaction", update)
      editor.on("create", update)
    } catch {
    }

    return () => {
      stopped = true
      try {
        observer?.disconnect()
      } catch {  }
      if (pollHandle !== null) cancelAnimationFrame(pollHandle)
      container.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
      try {
        if (!(editor as { isDestroyed?: boolean }).isDestroyed) {
          editor.off("update", update)
          editor.off("transaction", update)
          editor.off("create", update)
        }
      } catch {  }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [editor, containerRef])

  if (!editor || anchors.length === 0) return null

  return (
    <div className="diff-hunk-widgets" aria-live="polite">
      {anchors.map((anchor) => (
        <div
          key={anchor.hunkId}
          className="diff-hunk-widgets__widget"
          style={{ top: `${anchor.top}px` }}
        >
          <button
            type="button"
            className="diff-hunk-widgets__btn diff-hunk-widgets__btn--accept"
            onClick={() => {
              onAcceptHunk(anchor.hunkId)
            }}
            aria-label="Accept change"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            className="diff-hunk-widgets__btn diff-hunk-widgets__btn--reject"
            onClick={() => {
              onRejectHunk(anchor.hunkId)
            }}
            aria-label="Reject change"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
