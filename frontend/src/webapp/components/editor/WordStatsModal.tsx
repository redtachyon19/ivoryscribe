// The "Document Stats" modal. Extracted from Editor.tsx; driven entirely by
// the useDocumentStats bundle.

import Modal from "../ui/Modal"
import type { useDocumentStats } from "./hooks/useDocumentStats"

type DocumentStats = ReturnType<typeof useDocumentStats>

export default function WordStatsModal({ stats }: { stats: DocumentStats }) {
  return (
    <Modal
      isOpen={stats.isWordStatsOpen}
      onClose={stats.closeWordStats}
      title="Document Stats"
      closeLabel="Close stats"
      panelClassName="editor-workspace__word-stats-modal"
    >
      <div className="editor-workspace__word-stats-summary" role="group" aria-label="Summary metrics">
        <div className="editor-workspace__word-stats-row">
          <span>Current Tab Words</span>
          <strong>{stats.activeDocumentWordCount.toLocaleString()}</strong>
        </div>
        <div className="editor-workspace__word-stats-row">
          <span>Current Tab Characters</span>
          <strong>{stats.activeDocumentCharacterCount.toLocaleString()}</strong>
        </div>
        <div className="editor-workspace__word-stats-row editor-workspace__word-stats-row--highlight">
          <span>Selected Total Words</span>
          <strong>{stats.selectedTotalDocumentWordCount.toLocaleString()}</strong>
        </div>
        <div className="editor-workspace__word-stats-row">
          <span>All Project Words</span>
          <strong>{stats.totalDocumentWordCount.toLocaleString()}</strong>
        </div>
      </div>

      <button
        type="button"
        className="editor-workspace__word-stats-detail-toggle"
        aria-expanded={stats.isDetailedWordStatsOpen}
        onClick={stats.toggleDetailedWordStats}
      >
        {stats.isDetailedWordStatsOpen ? "Hide Detailed View" : "Show Detailed View"}
      </button>

      {stats.isDetailedWordStatsOpen ? (
        <section className="editor-workspace__word-stats-detail" aria-label="Chapter selection for totals">
          <p className="editor-workspace__word-stats-detail-note">
            Included chapters: {stats.includedChapterCount}/{stats.flatTabWordStats.length}
          </p>
          <ul className="editor-workspace__word-stats-list">
            {stats.flatTabWordStats.map((stat) => {
              const isIncluded = stats.includedTabsById[stat.id] !== false
              return (
                <li key={stat.id} className="editor-workspace__word-stats-item">
                  <label className="editor-workspace__word-stats-item-label" style={{ paddingLeft: `${stat.depth * 12}px` }}>
                    <input
                      type="checkbox"
                      checked={isIncluded}
                      onChange={(event) => {
                        const { checked } = event.target
                        stats.setIncludedTabsById((current) => ({
                          ...current,
                          [stat.id]: checked,
                        }))
                      }}
                    />
                    <span className="editor-workspace__word-stats-item-title">{stat.title}</span>
                  </label>
                  <strong>{stat.wordCount.toLocaleString()}</strong>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </Modal>
  )
}
