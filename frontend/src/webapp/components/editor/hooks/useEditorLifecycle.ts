import { useEffect, useRef } from "react"
import type { Editor as TiptapEditor } from "@tiptap/react"

type EditorOrNull = TiptapEditor | null

export function useEditorContentSync(
  editor: EditorOrNull,
  content: string,
  documentId: string | null | undefined,
  fallback: string,
  onAfterSync?: (editor: TiptapEditor) => void,
) {
  const lastDocIdRef = useRef(documentId)
  useEffect(() => {
    if (!editor) return
    const next = content || fallback
    const docChanged = documentId !== lastDocIdRef.current
    lastDocIdRef.current = documentId
    if (editor.getHTML() === next) return
    if (!docChanged && editor.isFocused) return
    editor.commands.setContent(next, { emitUpdate: false })
    onAfterSync?.(editor)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, content, documentId])
}

export function useEditorReadOnly(editor: EditorOrNull, readOnly: boolean) {
  useEffect(() => {
    if (!editor) return
    if ((editor as { isDestroyed?: boolean }).isDestroyed) return
    try {
      editor.setEditable(!readOnly)
    } catch {
    }
  }, [editor, readOnly])
}

export function useEditorReady(
  editor: EditorOrNull,
  onEditorReady: ((editor: EditorOrNull) => void) | undefined,
) {
  useEffect(() => {
    if (!onEditorReady) return
    try {
      onEditorReady(editor)
    } catch {
    }
    return () => {
      try {
        onEditorReady(null)
      } catch {
      }
    }
  }, [editor, onEditorReady])
}
