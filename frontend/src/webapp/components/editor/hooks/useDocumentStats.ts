// Word-count statistics and the "Document Stats" modal state. Extracted from
// Editor.tsx.

import { useEffect, useMemo, useState } from "react"
import type { Project } from "../../../../core/utils/projects"
import { countWordsForContent, flattenTabList, flattenTabWordStats, totalWordsAcrossTabs } from "../utils/documentStats"
import { pinboardPlainText } from "../utils/pinboardData"

export function useDocumentStats(project: Project | null, activeContent: string) {
  const [selectedWordCount, setSelectedWordCount] = useState<number | null>(null)
  const [isWordStatsOpen, setIsWordStatsOpen] = useState(false)
  const [isDetailedWordStatsOpen, setIsDetailedWordStatsOpen] = useState(false)
  const [includedTabsById, setIncludedTabsById] = useState<Record<string, boolean>>({})

  const activeDocumentWordCount = useMemo(() => countWordsForContent(activeContent), [activeContent])
  const activeDocumentCharacterCount = useMemo(() => {
    // For pinboards, count visible-text characters — not the JSON board blob.
    const boardText = pinboardPlainText(activeContent)
    return boardText !== null ? boardText.length : activeContent.length
  }, [activeContent])

  // Cheap tab-structure list (id / title / depth, no word counts). `tabs` is
  // referentially stable across content keystrokes, so this — and everything
  // keyed off it — does not recompute while the user types.
  const tabs = project?.tabs ?? null
  const flatTabList = useMemo(() => (tabs ? flattenTabList(tabs) : []), [tabs])

  // The recursive whole-tree word-count walks are only ever displayed inside
  // the stats modal, so they are gated behind `isWordStatsOpen` — they never
  // run while the modal is closed. (Previously they ran on every keystroke
  // regardless of whether the modal was open.) While the modal IS open they
  // recompute as the user types, which is the desired live-count behaviour.
  const flatTabWordStats = useMemo(
    () => (isWordStatsOpen && project ? flattenTabWordStats(project.tabs, project.contentById) : []),
    [isWordStatsOpen, project],
  )
  const totalDocumentWordCount = useMemo(
    () => (isWordStatsOpen && project ? totalWordsAcrossTabs(project.tabs, project.contentById) : 0),
    [isWordStatsOpen, project],
  )
  const selectedTotalDocumentWordCount = useMemo(
    () => flatTabWordStats.reduce((total, stat) => total + (includedTabsById[stat.id] === false ? 0 : stat.wordCount), 0),
    [flatTabWordStats, includedTabsById],
  )
  const includedChapterCount = useMemo(
    () => flatTabWordStats.reduce((total, stat) => total + (includedTabsById[stat.id] === false ? 0 : 1), 0),
    [flatTabWordStats, includedTabsById],
  )
  const tabIdSignature = useMemo(() => flatTabList.map((tab) => tab.id).join("|"), [flatTabList])

  const currentCountLabel = selectedWordCount === null
    ? `${activeDocumentWordCount.toLocaleString()} ${activeDocumentWordCount === 1 ? "word" : "words"}`
    : `${selectedWordCount.toLocaleString()} ${selectedWordCount === 1 ? "word" : "words"} selected`

  /* ── Reset transient stats UI when the active tab changes ── */
  useEffect(() => {
    setSelectedWordCount(null)
    setIsWordStatsOpen(false)
    setIsDetailedWordStatsOpen(false)
  }, [project?.activeId])

  /* ── Keep the per-tab inclusion map in sync with the tab tree ── */
  useEffect(() => {
    setIncludedTabsById((current) => {
      const next: Record<string, boolean> = {}
      for (const tab of flatTabList) {
        next[tab.id] = current[tab.id] ?? true
      }
      return next
    })
  }, [tabIdSignature, flatTabList])

  const toggleWordStats = () => setIsWordStatsOpen((prev) => !prev)
  const closeWordStats = () => {
    setIsWordStatsOpen(false)
    setIsDetailedWordStatsOpen(false)
  }
  const toggleDetailedWordStats = () => setIsDetailedWordStatsOpen((prev) => !prev)

  return {
    isWordStatsOpen,
    isDetailedWordStatsOpen,
    toggleWordStats,
    closeWordStats,
    toggleDetailedWordStats,
    setSelectedWordCount,
    currentCountLabel,
    activeDocumentWordCount,
    activeDocumentCharacterCount,
    selectedTotalDocumentWordCount,
    totalDocumentWordCount,
    includedChapterCount,
    flatTabWordStats,
    includedTabsById,
    setIncludedTabsById,
  }
}
