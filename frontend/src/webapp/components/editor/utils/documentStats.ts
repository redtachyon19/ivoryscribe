// Word-count tree walks over a project's tab tree. Extracted from Editor.tsx.

import { countWordsFromContent } from "../../../../core/utils/markdown"
import type { Project } from "../../../../core/utils/projects"

/** Total word count across every tab in the tree (recursive). */
export function totalWordsAcrossTabs(tabs: Project["tabs"], contentById: Project["contentById"]): number {
  return tabs.reduce((total, tab) => {
    const currentWords = countWordsFromContent(contentById[tab.id] ?? "")
    return total + currentWords + totalWordsAcrossTabs(tab.children, contentById)
  }, 0)
}

export type FlattenedTabWordStat = {
  id: string
  title: string
  depth: number
  wordCount: number
}

/** Flattens the tab tree into a depth-tagged list with per-tab word counts. */
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
      wordCount: countWordsFromContent(contentById[tab.id] ?? ""),
    }

    return [current, ...flattenTabWordStats(tab.children, contentById, depth + 1)]
  })
}

export type FlattenedTab = {
  id: string
  title: string
  depth: number
}

/**
 * Flattens the tab tree into a depth-tagged list — structure only, no word
 * counts. Unlike `flattenTabWordStats` this does not read `contentById`, so it
 * stays cheap and can be keyed on the (keystroke-stable) tabs array. Use this
 * for anything that only needs tab identity/structure.
 */
export function flattenTabList(tabs: Project["tabs"], depth = 0): FlattenedTab[] {
  return tabs.flatMap((tab) => [
    { id: tab.id, title: tab.title, depth },
    ...flattenTabList(tab.children, depth + 1),
  ])
}
