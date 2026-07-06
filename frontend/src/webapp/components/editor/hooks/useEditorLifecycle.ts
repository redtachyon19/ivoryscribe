// Shared TipTap editor lifecycle effects used by both DraftingEditor and
// TypewriterEditor. Each pattern was previously inlined and copy-pasted
// between the two editors; consolidating here keeps them aligned.

import { useEffect, useRef } from "react"
import type { Editor as TiptapEditor } from "@tiptap/react"

type EditorOrNull = TiptapEditor | null

/**
 * Re-sync TipTap's document when the parent swaps `content` or `documentId`.
 * Skips when the editor already has the requested HTML. `emitUpdate: false`
 * prevents the sync from re-triggering `onUpdate` (and the parent's
 * `onContentChange`).
 *
 * @param fallback HTML to use when `content` is falsy (each editor has its
 *                 own empty-doc shape).
 * @param onAfterSync Optional callback fired after a successful sync — used
 *                    by editors that need to recompute derived state (empty
 *                    decoration, word counts).
 */
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
    // The prose editors debounce their saves, so while the user is actively
    // typing in THIS document the `content` prop trails the live doc by up to
    // the debounce window. Syncing it back then would revert just-typed
    // characters. Skip for in-place same-document updates while focused — but a
    // genuine document switch (docChanged) must always load, focused or not.
    if (!docChanged && editor.isFocused) return
    editor.commands.setContent(next, { emitUpdate: false })
    onAfterSync?.(editor)
    // documentId is in deps so a doc switch with identical content still resets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, content, documentId])
}

/**
 * Toggle TipTap's editable state in response to `readOnly`. Guarded against
 * the editor being torn down between render and effect commit.
 */
export function useEditorReadOnly(editor: EditorOrNull, readOnly: boolean) {
  useEffect(() => {
    if (!editor) return
    if ((editor as { isDestroyed?: boolean }).isDestroyed) return
    try {
      editor.setEditable(!readOnly)
    } catch {
      /* editor torn down between render and effect */
    }
  }, [editor, readOnly])
}

/**
 * Expose the editor instance to the parent and clean up on unmount. Each
 * try/catch tolerates the parent unmounting before we get the chance to
 * notify it.
 */
export function useEditorReady(
  editor: EditorOrNull,
  onEditorReady: ((editor: EditorOrNull) => void) | undefined,
) {
  useEffect(() => {
    if (!onEditorReady) return
    try {
      onEditorReady(editor)
    } catch {
      /* parent unmounted */
    }
    return () => {
      try {
        onEditorReady(null)
      } catch {
        /* parent unmounted */
      }
    }
  }, [editor, onEditorReady])
}
