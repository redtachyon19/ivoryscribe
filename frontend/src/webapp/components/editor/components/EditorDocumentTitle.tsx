// Contenteditable title field sitting above DraftingEditor's body.
//
// Behavior:
//   • Enter commits the title and blurs the field.
//   • Escape reverts to the persisted title and blurs.
//   • Paste is intercepted — pasted text is force-stripped to single-line plain
//     text so the title can't span multiple lines.
//   • A hidden overlay (MarqueeText) renders the draft text — when the user
//     focuses the editable, we hide it so the editable becomes the visible
//     copy; on blur the overlay reappears with the marquee animation.
//
// The parent owns `documentTitle` (persisted) and `titleDraft` (in-flight).
// We just route key/paste/blur events back up.

import { useEffect, useRef, useState } from "react"
import MarqueeText from "../../ui/MarqueeText"

type EditorDocumentTitleProps = {
  documentTitle: string
  documentId: string | null
  onChange: (nextTitle: string) => void
  /** Notifies typing-state hooks when the user is actively editing the title. */
  onTypingActivity: () => void
}

export function EditorDocumentTitle({
  documentTitle,
  documentId,
  onChange,
  onTypingActivity,
}: EditorDocumentTitleProps) {
  const titleEditableRef = useRef<HTMLDivElement | null>(null)
  const titleOverlayRef = useRef<HTMLDivElement | null>(null)
  const [titleDraft, setTitleDraft] = useState(documentTitle)

  // Re-sync the contentEditable's text whenever the persisted title or the
  // active document changes. setting `textContent` here is what makes
  // switching documents update the visible field.
  useEffect(() => {
    setTitleDraft(documentTitle)
    if (titleEditableRef.current) {
      titleEditableRef.current.textContent = documentTitle
    }
  }, [documentTitle, documentId])

  return (
    <div className="editor-document-title-wrap" data-marquee-parent>
      <div
        ref={titleEditableRef}
        contentEditable
        suppressContentEditableWarning
        className="editor-document-title"
        aria-label="Document title"
        onFocus={() => {
          if (titleOverlayRef.current) titleOverlayRef.current.style.visibility = "hidden"
        }}
        onInput={(event) => {
          const text = event.currentTarget.textContent ?? ""
          setTitleDraft(text)
          onTypingActivity()
        }}
        onBlur={(event) => {
          if (titleOverlayRef.current) titleOverlayRef.current.style.visibility = ""
          const text = event.currentTarget.textContent?.trim() ?? ""
          onChange(text)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            const text = event.currentTarget.textContent?.trim() ?? ""
            onChange(text)
            event.currentTarget.blur()
            return
          }

          if (event.key === "Escape") {
            event.preventDefault()
            if (titleEditableRef.current) {
              titleEditableRef.current.textContent = documentTitle
            }
            setTitleDraft(documentTitle)
            event.currentTarget.blur()
            return
          }

          if (
            !event.metaKey &&
            !event.ctrlKey &&
            !event.altKey &&
            (event.key.length === 1 || event.key === "Backspace" || event.key === "Delete")
          ) {
            onTypingActivity()
          }
        }}
        onPaste={(event) => {
          event.preventDefault()
          const text = event.clipboardData.getData("text/plain").replace(/\r?\n|\r/g, " ")
          const selection = window.getSelection()
          if (!selection?.rangeCount) return
          selection.deleteFromDocument()
          const range = selection.getRangeAt(0)
          const node = document.createTextNode(text)
          range.insertNode(node)
          range.setStartAfter(node)
          range.collapse(true)
          selection.removeAllRanges()
          selection.addRange(range)
          const fullText = event.currentTarget.textContent ?? ""
          setTitleDraft(fullText)
          onTypingActivity()
        }}
      />
      <div ref={titleOverlayRef} className="editor-document-title-overlay" aria-hidden="true">
        <MarqueeText text={titleDraft} />
      </div>
    </div>
  )
}
