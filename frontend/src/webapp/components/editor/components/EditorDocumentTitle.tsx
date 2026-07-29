import { useEffect, useRef, useState } from "react"
import MarqueeText from "../../ui/MarqueeText"

type EditorDocumentTitleProps = {
  documentTitle: string
  documentId: string | null
  onChange: (nextTitle: string) => void
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
