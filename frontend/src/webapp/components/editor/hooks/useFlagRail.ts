import { useEffect, useMemo, useState } from "react"
import type { Editor as TiptapEditor } from "@tiptap/react"

type HighlightRange = {
  from: number
  to: number
}

type UseFlagRailParams = {
  editor: TiptapEditor | null
  flagsEnabled: boolean
  documentId: string | null
  editorSurfaceRef: React.RefObject<HTMLDivElement | null>
}

const FLAG_HIGHLIGHT_COLOR = "rgba(239, 68, 68, 0.3)"

export function useFlagRail({ editor, flagsEnabled, documentId, editorSurfaceRef }: UseFlagRailParams) {
  const [flaggedAnchorsByDocument, setFlaggedAnchorsByDocument] = useState<Record<string, number[]>>({})
  const [highlightRangesByDocument, setHighlightRangesByDocument] = useState<Record<string, Record<number, HighlightRange>>>({})
  const [flaggedLineTops, setFlaggedLineTops] = useState<Record<number, number>>({})
  const [hoverLineTop, setHoverLineTop] = useState<number | null>(null)
  const [hoverLineAnchor, setHoverLineAnchor] = useState<number | null>(null)
  const [isFlagRailHovered, setIsFlagRailHovered] = useState(false)

  const activeDocumentKey = documentId ?? "__default_document__"
  const flaggedAnchors = useMemo(
    () => new Set(flaggedAnchorsByDocument[activeDocumentKey] ?? []),
    [flaggedAnchorsByDocument, activeDocumentKey],
  )

  const highlightSelectionIfPresent = () => {
    if (!editor) {
      return null
    }

    const { from, to } = editor.state.selection
    if (from === to) {
      return null
    }

    editor.chain().focus().setHighlight({ color: FLAG_HIGHLIGHT_COLOR }).run()
    return { from, to }
  }

  const removeHighlightForAnchor = (anchor: number) => {
    if (!editor) {
      return
    }

    const range = highlightRangesByDocument[activeDocumentKey]?.[anchor]
    if (!range) {
      return
    }

    const { from, to } = range
    if (from >= to) {
      return
    }

    const previousSelection = editor.state.selection

    try {
      editor
        .chain()
        .focus()
        .setTextSelection({ from, to })
        .unsetHighlight()
        .setTextSelection({ from: previousSelection.from, to: previousSelection.to })
        .run()
    } catch {
    }
  }

  const updateHoverLineFromPointer = (clientY: number) => {
    if (!editor || !flagsEnabled) {
      return false
    }

    const editorSurface = editorSurfaceRef.current
    if (!editorSurface) {
      return false
    }

    const contentRect = editor.view.dom.getBoundingClientRect()
    const surfaceRect = editorSurface.getBoundingClientRect()
    const probeX = contentRect.left + 8
    const target = editor.view.posAtCoords({
      left: probeX,
      top: clientY,
    })

    if (!target) {
      return false
    }

    try {
      const coords = editor.view.coordsAtPos(target.pos)

      const verticalPadding = 2
      if (clientY < coords.top - verticalPadding || clientY > coords.bottom + verticalPadding) {
        return false
      }

      const top = coords.top - surfaceRect.top
      setHoverLineTop((previous) => (previous === top ? previous : top))
      setHoverLineAnchor((previous) => (previous === target.pos ? previous : target.pos))
      return true
    } catch {
      return false
    }
  }

  useEffect(() => {
    setHoverLineAnchor(null)
    setHoverLineTop(null)
    setIsFlagRailHovered(false)
    setFlaggedLineTops({})
  }, [documentId])

  useEffect(() => {
    if (flagsEnabled) {
      return
    }

    setIsFlagRailHovered(false)
    setHoverLineTop(null)
    setHoverLineAnchor(null)
  }, [flagsEnabled])

  useEffect(() => {
    if (!editor) {
      return
    }

    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean; mapping: { map: (pos: number, assoc?: number) => number } } }) => {
      if (!transaction.docChanged) {
        return
      }

      setFlaggedAnchorsByDocument((current) => {
        const existing = current[activeDocumentKey]
        if (!existing || existing.length === 0) {
          return current
        }

        const mapped = Array.from(new Set(existing.map((anchor) => transaction.mapping.map(anchor, 1))))
        const unchanged = mapped.length === existing.length && mapped.every((value, index) => value === existing[index])
        if (unchanged) {
          return current
        }

        return {
          ...current,
          [activeDocumentKey]: mapped,
        }
      })

      setHighlightRangesByDocument((current) => {
        const existing = current[activeDocumentKey]
        if (!existing) {
          return current
        }

        const mappedEntries = Object.entries(existing)
          .map(([anchorKey, range]) => {
            const mappedAnchor = transaction.mapping.map(Number(anchorKey), 1)
            const mappedFrom = transaction.mapping.map(range.from, 1)
            const mappedTo = transaction.mapping.map(range.to, -1)

            if (mappedFrom >= mappedTo) {
              return null
            }

            return [mappedAnchor, { from: mappedFrom, to: mappedTo }] as const
          })
          .filter((entry): entry is readonly [number, HighlightRange] => entry !== null)

        const next: Record<number, HighlightRange> = {}
        for (const [anchor, range] of mappedEntries) {
          next[anchor] = range
        }

        const prevSerialized = JSON.stringify(existing)
        const nextSerialized = JSON.stringify(next)
        if (prevSerialized === nextSerialized) {
          return current
        }

        return {
          ...current,
          [activeDocumentKey]: next,
        }
      })
    }

    editor.on("transaction", onTransaction)

    return () => {
      editor.off("transaction", onTransaction)
    }
  }, [editor, activeDocumentKey])

  useEffect(() => {
    if (!editor) {
      return
    }

    const computeFlaggedLineTops = () => {
      const editorSurface = editorSurfaceRef.current
      if (!editorSurface) {
        return
      }

      const anchors = flaggedAnchorsByDocument[activeDocumentKey] ?? []
      if (anchors.length === 0) {
        setFlaggedLineTops((previous) => (Object.keys(previous).length === 0 ? previous : {}))
        return
      }

      const surfaceRect = editorSurface.getBoundingClientRect()
      const next: Record<number, number> = {}

      for (const anchor of anchors) {
        try {
          const coords = editor.view.coordsAtPos(anchor)
          next[anchor] = coords.top - surfaceRect.top
        } catch {
        }
      }

      setFlaggedLineTops((previous) => {
        const prevKeys = Object.keys(previous)
        const nextKeys = Object.keys(next)
        const unchanged =
          prevKeys.length === nextKeys.length &&
          nextKeys.every((key) => previous[Number(key)] === next[Number(key)])

        return unchanged ? previous : next
      })
    }

    const onSelectionUpdate = () => computeFlaggedLineTops()
    const onTransaction = () => computeFlaggedLineTops()
    const onFocus = () => computeFlaggedLineTops()
    const onResize = () => computeFlaggedLineTops()
    const onScroll = () => computeFlaggedLineTops()

    editor.on("selectionUpdate", onSelectionUpdate)
    editor.on("transaction", onTransaction)
    editor.on("focus", onFocus)
    window.addEventListener("resize", onResize)
    window.addEventListener("scroll", onScroll, true)

    computeFlaggedLineTops()

    return () => {
      editor.off("selectionUpdate", onSelectionUpdate)
      editor.off("transaction", onTransaction)
      editor.off("focus", onFocus)
      window.removeEventListener("resize", onResize)
      window.removeEventListener("scroll", onScroll, true)
    }
  }, [editor, editorSurfaceRef, activeDocumentKey, flaggedAnchorsByDocument])

  const handleCreateFlag = (anchor: number) => {
    const highlightedRange = highlightSelectionIfPresent()

    setFlaggedAnchorsByDocument((current) => {
      const existing = current[activeDocumentKey] ?? []
      if (existing.includes(anchor)) return current
      return { ...current, [activeDocumentKey]: [...existing, anchor] }
    })

    if (highlightedRange) {
      setHighlightRangesByDocument((current) => {
        const existing = current[activeDocumentKey] ?? {}
        return {
          ...current,
          [activeDocumentKey]: { ...existing, [anchor]: highlightedRange },
        }
      })
    }
  }

  const handleRemoveFlag = (anchor: number) => {
    removeHighlightForAnchor(anchor)

    setFlaggedAnchorsByDocument((current) => {
      const existing = current[activeDocumentKey] ?? []
      const next = existing.filter((value) => value !== anchor)
      if (next.length === existing.length) return current
      return { ...current, [activeDocumentKey]: next }
    })

    setHighlightRangesByDocument((current) => {
      const existing = current[activeDocumentKey]
      if (!existing || !existing[anchor]) return current
      const next = { ...existing }
      delete next[anchor]
      return { ...current, [activeDocumentKey]: next }
    })
  }

  const clearHoverState = () => {
    setHoverLineTop(null)
    setHoverLineAnchor(null)
  }

  return {
    activeDocumentKey,
    flaggedAnchors,
    flaggedAnchorsByDocument,
    flaggedLineTops,
    hoverLineTop,
    hoverLineAnchor,
    isFlagRailHovered,
    setIsFlagRailHovered,
    clearHoverState,
    updateHoverLineFromPointer,
    handleCreateFlag,
    handleRemoveFlag,
  }
}
