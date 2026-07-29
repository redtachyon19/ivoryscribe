import { useEffect, useMemo, useRef, useState } from "react"
import { Copy, Download, RotateCcw, Trash2 } from "lucide-react"
import Button from "../components/ui/Button"
import FindReplaceModal from "../components/editor/modals/FindReplaceModal"
import { useFindReplaceModal } from "../../core/hooks/useFindReplaceModal"
import {
  formatVersionTimestamp,
  parseVersionSnapshot,
  type VersionPreviewHandoff,
} from "../../core/state/versioning"
import { collectTabSequence, type DocumentTab, type Project } from "../../core/utils/projects"
import {
  APP_PROJECT_SEARCH_FOCUS_EVENT,
  type ProjectSearchFocusDetail,
} from "../../core/events/editorEvents"
import "./VersionPreviewPage.css"

type VersionAction = "restore" | "duplicate" | "export" | "delete"

function readHandoff(): VersionPreviewHandoff | null {
  try {
    const key = new URLSearchParams(window.location.search).get("key")
    if (!key) return null
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    window.localStorage.removeItem(key)
    return JSON.parse(raw) as VersionPreviewHandoff
  } catch {
    return null
  }
}

function sanitizeSnapshotHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/?(?:iframe|object|embed|link|meta)[^>]*>/gi, "")
    .replace(/ on[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/ on[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "")
}

function selectNthOccurrence(host: HTMLElement, query: string, n: number) {
  if (!query) return
  const needle = query.toLowerCase()
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT)
  let count = 0
  let node: Node | null
  while ((node = walker.nextNode())) {
    const text = node.nodeValue ?? ""
    const lower = text.toLowerCase()
    let from = 0
    for (;;) {
      const idx = lower.indexOf(needle, from)
      if (idx === -1) break
      if (count === n) {
        const range = document.createRange()
        range.setStart(node, idx)
        range.setEnd(node, idx + query.length)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
        node.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" })
        return
      }
      count += 1
      from = idx + Math.max(1, needle.length)
    }
  }
}

const NOOP_PROJECT_CHANGE = () => {}

function TabTree({
  nodes,
  depth,
  onJump,
}: {
  nodes: DocumentTab[]
  depth: number
  onJump: (id: string) => void
}) {
  return (
    <ul className="version-preview__toc">
      {nodes.map((node) => (
        <li key={node.id}>
          <button
            type="button"
            className="version-preview__toc-item"
            style={{ paddingInlineStart: 12 + depth * 14 }}
            title={node.title || "Untitled"}
            onClick={() => onJump(node.id)}
          >
            {node.title || "Untitled"}
          </button>
          {node.children.length > 0 ? (
            <TabTree nodes={node.children} depth={depth + 1} onJump={onJump} />
          ) : null}
        </li>
      ))}
    </ul>
  )
}

export default function VersionPreviewPage() {
  const handoff = useMemo(readHandoff, [])
  const version = handoff?.version ?? null
  const snapshot = useMemo<Project | null>(
    () => (version ? parseVersionSnapshot(version.snapshot) : null),
    [version],
  )
  const projectName = snapshot?.name?.trim() || handoff?.projectName || "Version"
  const kindLabel = version
    ? version.kind === "manual"
      ? `Manual ${version.label}`
      : `Auto Save ${version.label}`
    : ""

  const entries = useMemo(() => (snapshot ? collectTabSequence(snapshot.tabs) : []), [snapshot])
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState("")

  const find = useFindReplaceModal({
    view: "editor",
    project: snapshot,
    onProjectChange: NOOP_PROJECT_CHANGE,
  })

  useEffect(() => {
    const onFocus = (event: Event) => {
      const detail = (event as CustomEvent<ProjectSearchFocusDetail>).detail
      if (!detail || !scrollRef.current) return
      const host = scrollRef.current.querySelector<HTMLElement>(
        `[data-doc-id="${detail.documentId}"]`,
      )
      if (host) selectNthOccurrence(host, detail.query, detail.occurrenceIndex)
    }
    window.addEventListener(APP_PROJECT_SEARCH_FOCUS_EVENT, onFocus as EventListener)
    return () => window.removeEventListener(APP_PROJECT_SEARCH_FOCUS_EVENT, onFocus as EventListener)
  }, [])

  const runAction = (action: VersionAction) => {
    if (!version || !handoff) return
    if (!window.opener) {
      setStatus("This window is detached from the app. Re-open it from Version History to use these actions.")
      return
    }
    window.opener.postMessage(
      {
        type: "ivory:version-action",
        action,
        projectId: handoff.projectId,
        versionId: version.id,
      },
      window.location.origin,
    )
    const sent: Record<VersionAction, string> = {
      restore: "Restore request sent to the app window.",
      duplicate: "Copy request sent to the app window.",
      export: "Export request sent to the app window.",
      delete: "Delete request sent to the app window.",
    }
    setStatus(sent[action])
  }

  const jumpToEntry = (id: string) => {
    const card = scrollRef.current
      ?.querySelector(`[data-doc-id="${id}"]`)
      ?.closest(".version-preview__card")
    card?.scrollIntoView({ block: "start", behavior: "smooth" })
  }

  if (!version || !snapshot) {
    return (
      <div className="version-preview version-preview--empty">
        <p>This version preview is unavailable. Re-open it from Version History.</p>
      </div>
    )
  }

  return (
    <div className="version-preview">
      <header className="version-preview__head">
        <h1 className="version-preview__title">{projectName}</h1>
        <p className="version-preview__meta">
          {kindLabel} &middot; {formatVersionTimestamp(version.savedAt)}
        </p>

        <div className="version-preview__toolbar" role="toolbar" aria-label="Version actions">
          <Button type="button" onClick={() => runAction("restore")} aria-label="Restore this version">
            <RotateCcw size={15} strokeWidth={1.8} aria-hidden="true" />
            <span>Restore</span>
          </Button>
          <Button type="button" onClick={() => runAction("duplicate")} aria-label="Add a copy to the library">
            <Copy size={15} strokeWidth={1.8} aria-hidden="true" />
            <span>Add Copy to Library</span>
          </Button>
          <Button type="button" onClick={() => runAction("export")} aria-label="Export this version as PDF">
            <Download size={15} strokeWidth={1.8} aria-hidden="true" />
            <span>Export</span>
          </Button>
          <Button
            type="button"
            variant="footer-danger"
            onClick={() => runAction("delete")}
            aria-label="Delete this version"
          >
            <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" />
            <span>Delete</span>
          </Button>
        </div>

        {status ? <p className="version-preview__status">{status}</p> : null}
      </header>

      <div className="version-preview__body">
        <nav className="version-preview__sidebar" aria-label="Contents">
          <p className="version-preview__sidebar-title">Contents</p>
          <TabTree nodes={snapshot.tabs} depth={0} onJump={jumpToEntry} />
        </nav>

        <div className="version-preview__scroll" ref={scrollRef}>
        <FindReplaceModal
          isOpen={find.isOpen}
          query={find.query}
          replaceQuery={find.replaceQuery}
          normalizedQuery={find.normalizedQuery}
          resultCount={find.resultCount}
          currentIndex={find.currentIndex}
          expanded={find.expanded}
          onQueryChange={find.setQuery}
          onReplaceQueryChange={find.setReplaceQuery}
          onGoNext={find.goToNext}
          onGoPrevious={find.goToPrevious}
          onReplaceCurrent={find.replaceCurrent}
          onReplaceAll={find.replaceAll}
          onToggleExpanded={() => find.setExpanded(!find.expanded)}
          onClose={find.close}
        />

        <div className="version-preview__content">
          {entries.map(({ id, title }) => (
            <section key={id} className="version-preview__card">
              <h2 className="version-preview__card-title">{title}</h2>
              <div
                className="version-preview__entry"
                data-doc-id={id}
                dangerouslySetInnerHTML={{
                  __html: sanitizeSnapshotHtml(snapshot.contentById[id] ?? "").trim()
                    || '<p class="version-preview__empty">This entry is empty.</p>',
                }}
              />
            </section>
          ))}
        </div>
      </div>
      </div>
    </div>
  )
}
