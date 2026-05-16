import { useEffect, useMemo, useRef, useState } from "react"
import {
  APP_PROJECT_SEARCH_EVENT,
  requestAppProjectSearch,
  requestAppProjectSearchFocus,
} from "../events/editorEvents"
import { collectTabSequence, getProjectMarkdownIds, type Project } from "../utils/projects"

const FIND_REPLACE_RESULT_LIMIT = 200

type FindReplaceDocumentType = "text" | "markdown"

type FindReplaceResult = {
  documentId: string
  documentType: FindReplaceDocumentType
  occurrenceIndex: number
  start: number
  end: number
}

type UseFindReplaceModalOptions = {
  view: "projects" | "editor"
  project: Project | null
  onProjectChange: (updater: (project: Project) => Project) => void
}

function plainTextFromHtmlForSearch(value: string) {
  if (typeof DOMParser === "undefined") {
    return value.replace(/<[^>]*>/g, " ")
  }

  const normalized = value
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote|pre)>/gi, "\n")

  const document = new DOMParser().parseFromString(normalized, "text/html")
  return document.body.textContent ?? ""
}

function findQueryMatches(value: string, normalizedQuery: string, limit: number) {
  const matches: Array<{ start: number; end: number; occurrenceIndex: number }> = []

  if (!normalizedQuery || limit <= 0) {
    return matches
  }

  const lowerValue = value.toLowerCase()
  let fromIndex = 0
  let occurrenceIndex = 0

  while (fromIndex < lowerValue.length && matches.length < limit) {
    const start = lowerValue.indexOf(normalizedQuery, fromIndex)
    if (start === -1) {
      break
    }

    matches.push({
      start,
      end: start + normalizedQuery.length,
      occurrenceIndex,
    })

    occurrenceIndex += 1
    fromIndex = start + Math.max(1, normalizedQuery.length)
  }

  return matches
}

function replaceNthOccurrence(content: string, searchLower: string, n: number, replacement: string): string | null {
  const lowerContent = content.toLowerCase()
  let fromIndex = 0
  let count = 0

  while (fromIndex < lowerContent.length) {
    const pos = lowerContent.indexOf(searchLower, fromIndex)
    if (pos === -1) return null

    if (count === n) {
      return content.slice(0, pos) + replacement + content.slice(pos + searchLower.length)
    }

    count++
    fromIndex = pos + Math.max(1, searchLower.length)
  }

  return null
}

export function useFindReplaceModal({ view, project, onProjectChange }: UseFindReplaceModalOptions) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [replaceQuery, setReplaceQuery] = useState("")
  const [expanded, setExpanded] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(-1)

  const normalizedQuery = useMemo(() => query.trim().toLowerCase(), [query])
  const projectTabs = useMemo(() => (project ? collectTabSequence(project.tabs) : []), [project])

  const results = useMemo(() => {
    if (!project || !normalizedQuery) {
      return [] as FindReplaceResult[]
    }

    const markdownIdSet = new Set(getProjectMarkdownIds(project))
    const pinboardIdSet = new Set(project.pinboardIds ?? [])
    const typewriterIdSet = new Set(project.typewriterIds ?? [])
    const nextResults: FindReplaceResult[] = []

    for (const tab of projectTabs) {
      if (nextResults.length >= FIND_REPLACE_RESULT_LIMIT || pinboardIdSet.has(tab.id) || typewriterIdSet.has(tab.id)) {
        continue
      }

      const documentType: FindReplaceDocumentType = markdownIdSet.has(tab.id) ? "markdown" : "text"
      const rawContent = project.contentById[tab.id] ?? ""
      const searchableContent = documentType === "markdown"
        ? rawContent
        : plainTextFromHtmlForSearch(rawContent)

      if (!searchableContent.trim()) {
        continue
      }

      const matches = findQueryMatches(
        searchableContent,
        normalizedQuery,
        FIND_REPLACE_RESULT_LIMIT - nextResults.length,
      )

      for (const match of matches) {
        nextResults.push({
          documentId: tab.id,
          documentType,
          occurrenceIndex: match.occurrenceIndex,
          start: match.start,
          end: match.end,
        })
      }
    }

    return nextResults
  }, [project, projectTabs, normalizedQuery])

  const autoNavigateRef = useRef(false)

  useEffect(() => {
    if (results.length > 0) {
      setCurrentIndex(0)
      autoNavigateRef.current = true
      navigateToResult(results[0])

      // Refocus the find input after the editor steals focus via double-rAF
      const raf1 = window.requestAnimationFrame(() => {
        const raf2 = window.requestAnimationFrame(() => {
          const raf3 = window.requestAnimationFrame(() => {
            const findInput = document.querySelector<HTMLInputElement>(".find-replace-modal__input")
            if (findInput) {
              findInput.focus()
            }
            autoNavigateRef.current = false
          })
          cleanupRafs.push(raf3)
        })
        cleanupRafs.push(raf2)
      })
      const cleanupRafs: number[] = [raf1]

      return () => {
        for (const id of cleanupRafs) {
          window.cancelAnimationFrame(id)
        }
      }
    } else {
      setCurrentIndex(-1)
      autoNavigateRef.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedQuery, results.length])

  useEffect(() => {
    const onFindReplaceRequest: EventListener = () => {
      if (view !== "editor" || !project) {
        return
      }

      setIsOpen(true)
    }

    window.addEventListener(APP_PROJECT_SEARCH_EVENT, onFindReplaceRequest)
    return () => {
      window.removeEventListener(APP_PROJECT_SEARCH_EVENT, onFindReplaceRequest)
    }
  }, [view, project])

  useEffect(() => {
    const onFindReplaceShortcut = (event: KeyboardEvent) => {
      if (event.repeat) {
        return
      }

      if (view !== "editor" || !project) {
        return
      }

      const hasPrimaryModifier = event.metaKey || event.ctrlKey
      if (!hasPrimaryModifier || event.altKey || event.shiftKey) {
        return
      }

      const isFShortcut = event.code === "KeyF" || event.key.toLowerCase() === "f"
      if (!isFShortcut) {
        return
      }

      event.preventDefault()
      requestAppProjectSearch()
    }

    window.addEventListener("keydown", onFindReplaceShortcut, true)
    return () => {
      window.removeEventListener("keydown", onFindReplaceShortcut, true)
    }
  }, [view, project])

  useEffect(() => {
    if (view !== "editor" || !project) {
      setIsOpen(false)
    }
  }, [view, project])

  const close = () => {
    setIsOpen(false)
    setExpanded(false)
  }

  const navigateToResult = (result: FindReplaceResult) => {
    const trimmedQuery = query.trim()
    if (!trimmedQuery) {
      return
    }

    onProjectChange((currentProject) => {
      if (currentProject.activeId === result.documentId) {
        return currentProject
      }

      return {
        ...currentProject,
        activeId: result.documentId,
      }
    })

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (result.documentType === "markdown") {
          requestAppProjectSearchFocus({
            documentId: result.documentId,
            documentType: "markdown",
            query: trimmedQuery,
            occurrenceIndex: result.occurrenceIndex,
            start: result.start,
            end: result.end,
          })
          return
        }

        requestAppProjectSearchFocus({
          documentId: result.documentId,
          documentType: "text",
          query: trimmedQuery,
          occurrenceIndex: result.occurrenceIndex,
        })
      })
    })
  }

  const goToNext = () => {
    if (results.length === 0) return
    const safeIndex = currentIndex < 0 || currentIndex >= results.length ? -1 : currentIndex
    const nextIndex = safeIndex >= results.length - 1 ? 0 : safeIndex + 1
    setCurrentIndex(nextIndex)
    navigateToResult(results[nextIndex])
  }

  const goToPrevious = () => {
    if (results.length === 0) return
    const safeIndex = currentIndex < 0 || currentIndex >= results.length ? -1 : currentIndex
    const prevIndex = safeIndex <= 0 ? results.length - 1 : safeIndex - 1
    setCurrentIndex(prevIndex)
    navigateToResult(results[prevIndex])
  }

  const replaceCurrent = () => {
    if (!project || !normalizedQuery || results.length === 0 || currentIndex < 0) return

    const result = results[currentIndex]
    if (!result) return

    const rawContent = project.contentById[result.documentId] ?? ""
    const replaced = replaceNthOccurrence(rawContent, normalizedQuery, result.occurrenceIndex, replaceQuery)

    if (replaced !== null) {
      onProjectChange((p) => ({
        ...p,
        contentById: { ...p.contentById, [result.documentId]: replaced },
      }))
    }
  }

  const replaceAll = () => {
    if (!project || !normalizedQuery || results.length === 0) return

    const documentIds = new Set(results.map((r) => r.documentId))
    const escapedQuery = normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const pattern = new RegExp(escapedQuery, "gi")

    onProjectChange((p) => {
      const nextContentById = { ...p.contentById }

      for (const documentId of documentIds) {
        const content = nextContentById[documentId]
        if (content == null) continue
        nextContentById[documentId] = content.replace(pattern, replaceQuery)
      }

      return { ...p, contentById: nextContentById }
    })

    setCurrentIndex(-1)
  }

  return {
    isOpen,
    query,
    setQuery,
    replaceQuery,
    setReplaceQuery,
    normalizedQuery,
    resultCount: results.length,
    currentIndex,
    expanded,
    setExpanded,
    close,
    goToNext,
    goToPrevious,
    replaceCurrent,
    replaceAll,
  }
}
