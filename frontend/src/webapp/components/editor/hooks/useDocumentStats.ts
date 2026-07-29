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
    const boardText = pinboardPlainText(activeContent)
    return boardText !== null ? boardText.length : activeContent.length
  }, [activeContent])

  const tabs = project?.tabs ?? null
  const flatTabList = useMemo(() => (tabs ? flattenTabList(tabs) : []), [tabs])

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

  useEffect(() => {
    setSelectedWordCount(null)
    setIsWordStatsOpen(false)
    setIsDetailedWordStatsOpen(false)
  }, [project?.activeId])

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
