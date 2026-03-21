import { Archive, BookOpenText, BookPlus, Clock3, FileText, Folder, FolderPlus, HardDrive, LayoutGrid, List, NotebookPen, PanelLeft, PanelRight, Sparkles, Tag, Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"

export default function LibraryPreview() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [isDragging, setIsDragging] = useState(false)
  const [viewMode, setViewMode] = useState<"list" | "grid">("list")
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isDragging) return

    const onMouseMove = (event: MouseEvent) => {
      const bounds = bodyRef.current?.getBoundingClientRect()
      if (!bounds) return

      const nextWidth = Math.max(190, Math.min(320, event.clientX - bounds.left))
      setSidebarWidth(nextWidth)
    }

    const onMouseUp = () => {
      setIsDragging(false)
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)

    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [isDragging])

  return (
    <div className="auth-gateway__library-preview" aria-label="Library preview">
      <div className="auth-gateway__library-topbar">
        <span className="auth-gateway__canvas-dot" />
        <span className="auth-gateway__canvas-dot" />
        <span className="auth-gateway__canvas-dot" />
        <button
          type="button"
          className="auth-gateway__canvas-toggle"
          aria-label={isSidebarCollapsed ? "Expand library side panel" : "Collapse library side panel"}
          onClick={() => setIsSidebarCollapsed((prev) => !prev)}
        >
          <PanelLeft size={14} aria-hidden={true} />
        </button>
        <button
          type="button"
          className="auth-gateway__canvas-toggle" style={{ marginLeft: "auto" }}
          aria-label={isRightPanelOpen ? "Close right panel" : "Open right panel"}
          onClick={() => setIsRightPanelOpen((prev) => !prev)}
        >
          <PanelRight size={14} aria-hidden={true} />
        </button>
      </div>

      <div
        ref={bodyRef}
        className={`auth-gateway__library-body ${isSidebarCollapsed ? "auth-gateway__library-body--collapsed" : ""}`.trim()}
        style={{
          gridTemplateColumns: `${isSidebarCollapsed ? 0 : sidebarWidth}px ${isSidebarCollapsed ? 0 : 8}px 1fr ${isRightPanelOpen ? 8 : 0}px ${isRightPanelOpen ? 240 : 0}px`,
        }}
        aria-label="Library content"
      >
        <aside className="auth-gateway__library-sidebar" aria-label="Library sidebar">
          <button type="button" className="auth-gateway__library-sidebar-item auth-gateway__library-sidebar-item--active">
            <Clock3 size={15} aria-hidden={true} />
            <span>Recent</span>
          </button>
          <button type="button" className="auth-gateway__library-sidebar-item">
            <Archive size={15} aria-hidden={true} />
            <span>Archive</span>
          </button>
          <button type="button" className="auth-gateway__library-sidebar-item">
            <Trash2 size={15} aria-hidden={true} />
            <span>Recently Deleted</span>
          </button>

          <div className="auth-gateway__library-storage">
            <div className="auth-gateway__library-storage-label">
              <HardDrive size={15} aria-hidden={true} />
              <span>Storage</span>
            </div>
            <div className="auth-gateway__library-storage-bar" aria-hidden={true}>
              <span />
            </div>
            <p>6.8 GB of 15 GB used</p>
          </div>
        </aside>

        <div
          className={`auth-gateway__library-resizer ${isSidebarCollapsed ? "auth-gateway__library-resizer--hidden" : ""}`.trim()}
          role="separator"
          aria-label="Resize library side panel"
          onMouseDown={() => setIsDragging(true)}
        />

        <div className="auth-gateway__library-main">
          <div className="auth-gateway__library-header">
            <h3>Library</h3>
            <span>Your Library for books, blogs, and folders</span>
          </div>

          <div className="auth-gateway__library-create-row" role="list" aria-label="Create actions">
            <button type="button" className="auth-gateway__library-create-card" role="listitem">
              <BookPlus size={28} aria-hidden={true} />
              <span>Create book</span>
            </button>
            <button type="button" className="auth-gateway__library-create-card" role="listitem">
              <NotebookPen size={28} aria-hidden={true} />
              <span>Create blog</span>
            </button>
            <button type="button" className="auth-gateway__library-create-card" role="listitem">
              <FolderPlus size={28} aria-hidden={true} />
              <span>Create folder</span>
            </button>
          </div>

          <div className="auth-gateway__library-recent-section">
            <p className="auth-gateway__library-section-label">Recently opened</p>
            <div className="auth-gateway__library-recent-grid">
              <article className="auth-gateway__library-recent-item">
                <BookOpenText size={16} aria-hidden={true} />
                <div>
                  <strong>Fish Out of Water</strong>
                  <span>Book draft • 2h ago</span>
                </div>
              </article>
              <article className="auth-gateway__library-recent-item">
                <NotebookPen size={16} aria-hidden={true} />
                <div>
                  <strong>Author Devlog</strong>
                  <span>Blog project • Yesterday</span>
                </div>
              </article>
              <article className="auth-gateway__library-recent-item">
                <BookOpenText size={16} aria-hidden={true} />
                <div>
                  <strong>Moonlit Atlas</strong>
                  <span>Book project • 3d ago</span>
                </div>
              </article>
              <article className="auth-gateway__library-recent-item">
                <NotebookPen size={16} aria-hidden={true} />
                <div>
                  <strong>Weekly Writing Notes</strong>
                  <span>Blog draft • 5d ago</span>
                </div>
              </article>
            </div>
          </div>

          <div className="auth-gateway__library-toolbar">
            <p>Library</p>
            <div className="auth-gateway__library-toolbar-actions">
              <div className="auth-gateway__library-chips">
                <span>Folders 6</span>
                <span>Projects 11</span>
              </div>
              <button
                type="button"
                className="auth-gateway__library-view-toggle"
                aria-label={viewMode === "list" ? "Switch to grid view" : "Switch to list view"}
                onClick={() => setViewMode((prev) => (prev === "list" ? "grid" : "list"))}
              >
                {viewMode === "list" ? <LayoutGrid size={15} aria-hidden={true} /> : <List size={15} aria-hidden={true} />}
              </button>
            </div>
          </div>

          <div className="auth-gateway__library-folders" aria-label="Library folders">
            <article className="auth-gateway__library-card auth-gateway__library-card--folder">
              <Folder size={18} aria-hidden={true} />
              <div>
                <strong>Fantasy Series</strong>
                <span>4 folders • 12 docs</span>
              </div>
            </article>
            <article className="auth-gateway__library-card auth-gateway__library-card--folder">
              <Folder size={18} aria-hidden={true} />
              <div>
                <strong>Worldbuilding Vault</strong>
                <span>9 docs</span>
              </div>
            </article>
            <article className="auth-gateway__library-card auth-gateway__library-card--folder">
              <Folder size={18} aria-hidden={true} />
              <div>
                <strong>Research Notes</strong>
                <span>19 files</span>
              </div>
            </article>
            <article className="auth-gateway__library-card auth-gateway__library-card--folder">
              <Folder size={18} aria-hidden={true} />
              <div>
                <strong>Marketing Assets</strong>
                <span>7 files</span>
              </div>
            </article>
          </div>

          {viewMode === "list" ? (
            <div className="auth-gateway__library-list" aria-label="Library projects list">
              <article className="auth-gateway__library-row">
                <div className="auth-gateway__library-row-main">
                  <BookOpenText size={17} aria-hidden={true} />
                  <strong>The Last Ivory Bell</strong>
                </div>
                <span>Book</span>
                <span>2h ago</span>
              </article>
              <article className="auth-gateway__library-row">
                <div className="auth-gateway__library-row-main">
                  <BookOpenText size={17} aria-hidden={true} />
                  <strong>Across the Monsoon</strong>
                </div>
                <span>Book</span>
                <span>Yesterday</span>
              </article>
              <article className="auth-gateway__library-row">
                <div className="auth-gateway__library-row-main">
                  <FileText size={17} aria-hidden={true} />
                  <strong>Launch Week Post</strong>
                </div>
                <span>Blog</span>
                <span>3d ago</span>
              </article>
              <article className="auth-gateway__library-row">
                <div className="auth-gateway__library-row-main">
                  <FileText size={17} aria-hidden={true} />
                  <strong>Newsletter 014</strong>
                </div>
                <span>Blog</span>
                <span>5d ago</span>
              </article>
              <article className="auth-gateway__library-row">
                <div className="auth-gateway__library-row-main">
                  <BookOpenText size={17} aria-hidden={true} />
                  <strong>Character Bible v2</strong>
                </div>
                <span>Project</span>
                <span>1w ago</span>
              </article>
            </div>
          ) : (
            <div className="auth-gateway__library-grid" aria-label="Library projects grid">
              <article className="auth-gateway__library-grid-card">
                <div className="auth-gateway__library-grid-thumb">
                  <BookOpenText size={28} aria-hidden={true} />
                </div>
                <div className="auth-gateway__library-grid-info">
                  <strong>The Last Ivory Bell</strong>
                  <span>Book • 2h ago</span>
                </div>
              </article>
              <article className="auth-gateway__library-grid-card">
                <div className="auth-gateway__library-grid-thumb">
                  <BookOpenText size={28} aria-hidden={true} />
                </div>
                <div className="auth-gateway__library-grid-info">
                  <strong>Across the Monsoon</strong>
                  <span>Book • Yesterday</span>
                </div>
              </article>
              <article className="auth-gateway__library-grid-card">
                <div className="auth-gateway__library-grid-thumb">
                  <FileText size={28} aria-hidden={true} />
                </div>
                <div className="auth-gateway__library-grid-info">
                  <strong>Launch Week Post</strong>
                  <span>Blog • 3d ago</span>
                </div>
              </article>
              <article className="auth-gateway__library-grid-card">
                <div className="auth-gateway__library-grid-thumb">
                  <FileText size={28} aria-hidden={true} />
                </div>
                <div className="auth-gateway__library-grid-info">
                  <strong>Newsletter 014</strong>
                  <span>Blog • 5d ago</span>
                </div>
              </article>
              <article className="auth-gateway__library-grid-card">
                <div className="auth-gateway__library-grid-thumb">
                  <BookOpenText size={28} aria-hidden={true} />
                </div>
                <div className="auth-gateway__library-grid-info">
                  <strong>Character Bible v2</strong>
                  <span>Project • 1w ago</span>
                </div>
              </article>
            </div>
          )}
        </div>

        <div className={`auth-gateway__library-resizer auth-gateway__library-resizer--right ${!isRightPanelOpen ? "auth-gateway__library-resizer--hidden" : ""}`.trim()} role="separator" aria-label="Right panel divider" />

        <aside className={`auth-gateway__library-right-panel ${!isRightPanelOpen ? "auth-gateway__library-right-panel--hidden" : ""}`.trim()} aria-label="Project details panel">
          <p className="auth-gateway__library-right-panel-title">Project Info</p>

          <div className="auth-gateway__library-right-panel-card">
            <BookOpenText size={20} aria-hidden={true} />
            <div>
              <strong>The Last Ivory Bell</strong>
              <span>Book draft</span>
            </div>
          </div>

          <div className="auth-gateway__library-right-panel-section">
            <p className="auth-gateway__library-right-panel-label">Details</p>
            <dl className="auth-gateway__library-right-panel-dl">
              <div><dt>Created</dt><dd>Jan 12, 2026</dd></div>
              <div><dt>Modified</dt><dd>2h ago</dd></div>
              <div><dt>Words</dt><dd>48,230</dd></div>
              <div><dt>Chapters</dt><dd>18</dd></div>
            </dl>
          </div>

          <div className="auth-gateway__library-right-panel-section">
            <p className="auth-gateway__library-right-panel-label">Tags</p>
            <div className="auth-gateway__library-right-panel-tags">
              <span><Tag size={11} aria-hidden={true} /> Fantasy</span>
              <span><Tag size={11} aria-hidden={true} /> Novel</span>
              <span><Tag size={11} aria-hidden={true} /> Draft 2</span>
            </div>
          </div>

          <div className="auth-gateway__library-right-panel-section">
            <p className="auth-gateway__library-right-panel-label">AI Summary</p>
            <div className="auth-gateway__library-right-panel-summary">
              <Sparkles size={13} aria-hidden={true} />
              <p>A coming-of-age fantasy following a bell-maker's apprentice across three kingdoms.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
