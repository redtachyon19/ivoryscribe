import { countWords, countWordsFromContent } from "../../../../core/utils/markdown"
import type { Project } from "../../../../core/utils/projects"
import { pinboardPlainText } from "./pinboardData"

export function countWordsForContent(content: string): number {
  const boardText = pinboardPlainText(content)
  return boardText !== null ? countWords(boardText) : countWordsFromContent(content)
}

export function totalWordsAcrossTabs(tabs: Project["tabs"], contentById: Project["contentById"]): number {
  return tabs.reduce((total, tab) => {
    const currentWords = countWordsForContent(contentById[tab.id] ?? "")
    return total + currentWords + totalWordsAcrossTabs(tab.children, contentById)
  }, 0)
}

export type FlattenedTabWordStat = {
  id: string
  title: string
  depth: number
  wordCount: number
}

export function flattenTabWordStats(
  tabs: Project["tabs"],
  contentById: Project["contentById"],
  depth = 0,
): FlattenedTabWordStat[] {
  return tabs.flatMap((tab) => {
    const current: FlattenedTabWordStat = {
      id: tab.id,
      title: tab.title,
      depth,
      wordCount: countWordsForContent(contentById[tab.id] ?? ""),
    }

    return [current, ...flattenTabWordStats(tab.children, contentById, depth + 1)]
  })
}

export type FlattenedTab = {
  id: string
  title: string
  depth: number
}

export function flattenTabList(tabs: Project["tabs"], depth = 0): FlattenedTab[] {
  return tabs.flatMap((tab) => [
    { id: tab.id, title: tab.title, depth },
    ...flattenTabList(tab.children, depth + 1),
  ])
}
