// Spell-check orchestration: dictionary + ignored-word state, the global
// spell-check request/shortcut/focus events, issue navigation, and the
// suggestion/ignore/add-to-dictionary handlers. Moved verbatim out of
// Editor.tsx — behaviour and effect ordering are unchanged.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  APP_SPELL_CHECK_EVENT,
  requestAppSpellCheck,
  requestAppSpellCheckFocus,
  type SpellCheckFocusDetail,
} from "../../../../core/events/editorEvents"
import type { Project } from "../../../../core/utils/projects"
import { collectSpellCheckIssues, replaceSpellCheckIssue, type SpellCheckDocumentType } from "../utils/spellChecker"
import {
  SPELL_CHECK_DICTIONARY_STORAGE_KEY,
  addNativeSpellCheckWord,
  loadSpellCheckDictionary,
  normalizeSpellCheckWord,
  removeNativeSpellCheckWord,
} from "../utils/spellCheckDictionary"

type ActiveDocumentType = "prose" | "pinboard" | "markdown"

type UseSpellCheckOrchestrationArgs = {
  view: "projects" | "editor"
  project: Project | null
  activeContent: string
  activeDocumentType: ActiveDocumentType
  onProjectChange: (updater: (project: Project) => Project) => void
}

export function useSpellCheckOrchestration({
  view,
  project,
  activeContent,
  activeDocumentType,
  onProjectChange,
}: UseSpellCheckOrchestrationArgs) {
  const [isSpellCheckOpen, setIsSpellCheckOpen] = useState(false)
  const [spellCheckDocumentId, setSpellCheckDocumentId] = useState<string | null>(null)
  const [spellCheckDocumentType, setSpellCheckDocumentType] = useState<SpellCheckDocumentType | null>(null)
  const [spellCheckIndex, setSpellCheckIndex] = useState(0)
  const [spellCheckDictionary, setSpellCheckDictionary] = useState<string[]>(() => loadSpellCheckDictionary())
  const [spellCheckIgnoredWords, setSpellCheckIgnoredWords] = useState<string[]>([])
  const [spellCheckIgnoredDocumentId, setSpellCheckIgnoredDocumentId] = useState<string | null>(null)

  // Latest-value refs so releaseSessionIgnoredSpellCheckWords can read the
  // current dictionary / ignored-word state without closing over them — that
  // previously forced every effect calling it to list those values as deps.
  const spellCheckIgnoredWordsRef = useRef(spellCheckIgnoredWords)
  const spellCheckDictionaryRef = useRef(spellCheckDictionary)

  const spellCheckAcceptedWordSet = useMemo(() => {
    return new Set<string>([...spellCheckDictionary, ...spellCheckIgnoredWords])
  }, [spellCheckDictionary, spellCheckIgnoredWords])

  const spellCheckIssues = useMemo(() => {
    if (!isSpellCheckOpen || !spellCheckDocumentType) {
      return []
    }

    return collectSpellCheckIssues(activeContent, spellCheckDocumentType, spellCheckAcceptedWordSet)
  }, [isSpellCheckOpen, spellCheckDocumentType, activeContent, spellCheckAcceptedWordSet])

  const spellCheckIssue = spellCheckIssues[spellCheckIndex] ?? null

  useEffect(() => {
    spellCheckIgnoredWordsRef.current = spellCheckIgnoredWords
  }, [spellCheckIgnoredWords])

  useEffect(() => {
    spellCheckDictionaryRef.current = spellCheckDictionary
  }, [spellCheckDictionary])

  // Stable identity (refs supply the current values), so effects that call it
  // do not need to depend on the dictionary / ignored-word state.
  const releaseSessionIgnoredSpellCheckWords = useCallback(() => {
    const persistedDictionarySet = new Set(spellCheckDictionaryRef.current)

    for (const word of spellCheckIgnoredWordsRef.current) {
      if (persistedDictionarySet.has(word)) {
        continue
      }

      void removeNativeSpellCheckWord(word)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    window.localStorage.setItem(SPELL_CHECK_DICTIONARY_STORAGE_KEY, JSON.stringify(spellCheckDictionary))
  }, [spellCheckDictionary])

  useEffect(() => {
    for (const word of spellCheckDictionary) {
      void addNativeSpellCheckWord(word)
    }
  }, [spellCheckDictionary])

  useEffect(() => {
    if (!isSpellCheckOpen) {
      return
    }

    setSpellCheckIndex((current) => {
      if (spellCheckIssues.length === 0) {
        return 0
      }

      return Math.min(current, spellCheckIssues.length - 1)
    })
  }, [isSpellCheckOpen, spellCheckIssues.length])

  useEffect(() => {
    if (spellCheckIgnoredWords.length > 0 || !spellCheckIgnoredDocumentId) {
      return
    }

    setSpellCheckIgnoredDocumentId(null)
  }, [spellCheckIgnoredWords, spellCheckIgnoredDocumentId])

  useEffect(() => {
    const onSpellCheckRequest: EventListener = () => {
      if (view !== "editor") {
        return
      }

      const targetDocumentId = project?.activeId ?? null
      if (!targetDocumentId) {
        return
      }

      const nextDocumentType: SpellCheckDocumentType | null =
        activeDocumentType === "markdown"
          ? "markdown"
          : activeDocumentType === "prose"
            ? "text"
            : null

      if (
        spellCheckIgnoredWords.length > 0
        && spellCheckIgnoredDocumentId
        && spellCheckIgnoredDocumentId !== targetDocumentId
      ) {
        releaseSessionIgnoredSpellCheckWords()
        setSpellCheckIgnoredWords([])
        setSpellCheckIgnoredDocumentId(null)
      }

      setSpellCheckDocumentId(targetDocumentId)
      setSpellCheckDocumentType(nextDocumentType)
      setSpellCheckIndex(0)
      setIsSpellCheckOpen(true)
    }

    window.addEventListener(APP_SPELL_CHECK_EVENT, onSpellCheckRequest)
    return () => {
      window.removeEventListener(APP_SPELL_CHECK_EVENT, onSpellCheckRequest)
    }
  }, [view, project?.activeId, activeDocumentType, spellCheckIgnoredWords, spellCheckIgnoredDocumentId, releaseSessionIgnoredSpellCheckWords])

  useEffect(() => {
    const onSpellCheckShortcut = (event: KeyboardEvent) => {
      if (event.repeat) {
        return
      }

      const hasPrimaryModifier = event.metaKey || event.ctrlKey
      if (!hasPrimaryModifier || !event.altKey || event.shiftKey) {
        return
      }

      // Option can change event.key on macOS layouts, so prefer the physical key code.
      const isXShortcut = event.code === "KeyX" || event.key.toLowerCase() === "x"
      if (!isXShortcut) {
        return
      }

      event.preventDefault()
      requestAppSpellCheck()
    }

    window.addEventListener("keydown", onSpellCheckShortcut, true)
    return () => {
      window.removeEventListener("keydown", onSpellCheckShortcut, true)
    }
  }, [])

  useEffect(() => {
    if (!isSpellCheckOpen || !spellCheckIssue || !spellCheckDocumentId) {
      return
    }

    if (spellCheckIssue.focusTarget.documentType === "markdown") {
      const detail: SpellCheckFocusDetail = {
        documentId: spellCheckDocumentId,
        documentType: "markdown",
        normalizedWord: spellCheckIssue.focusTarget.normalizedWord,
        occurrenceIndex: spellCheckIssue.focusTarget.occurrenceIndex,
        start: spellCheckIssue.focusTarget.start,
        end: spellCheckIssue.focusTarget.end,
      }

      requestAppSpellCheckFocus(detail)
      return
    }

    const detail: SpellCheckFocusDetail = {
      documentId: spellCheckDocumentId,
      documentType: "text",
      normalizedWord: spellCheckIssue.focusTarget.normalizedWord,
      occurrenceIndex: spellCheckIssue.focusTarget.occurrenceIndex,
    }

    requestAppSpellCheckFocus(detail)
  }, [isSpellCheckOpen, spellCheckIssue, spellCheckDocumentId])

  useEffect(() => {
    if (!isSpellCheckOpen || !spellCheckDocumentId) {
      return
    }

    if (project?.activeId !== spellCheckDocumentId) {
      releaseSessionIgnoredSpellCheckWords()
      setIsSpellCheckOpen(false)
      setSpellCheckDocumentId(null)
      setSpellCheckDocumentType(null)
      setSpellCheckIndex(0)
      setSpellCheckIgnoredWords([])
      setSpellCheckIgnoredDocumentId(null)
    }
  }, [project?.activeId, isSpellCheckOpen, spellCheckDocumentId, releaseSessionIgnoredSpellCheckWords])

  const closeSpellCheckModal = () => {
    setIsSpellCheckOpen(false)
    setSpellCheckDocumentId(null)
    setSpellCheckDocumentType(null)
    setSpellCheckIndex(0)
  }

  const goToPreviousSpellCheckIssue = () => {
    setSpellCheckIndex((current) => Math.max(0, current - 1))
  }

  const goToNextSpellCheckIssue = () => {
    setSpellCheckIndex((current) => Math.min(current + 1, Math.max(0, spellCheckIssues.length - 1)))
  }

  const ignoreSpellCheckIssue = () => {
    const normalizedWord = spellCheckIssue?.normalizedWord
    if (!normalizedWord || !spellCheckDocumentId) {
      return
    }

    setSpellCheckIgnoredDocumentId(spellCheckDocumentId)
    setSpellCheckIgnoredWords((current) => {
      if (current.includes(normalizedWord)) {
        return current
      }

      return [...current, normalizedWord]
    })

    void addNativeSpellCheckWord(normalizedWord)
  }

  const addSpellCheckWordToDictionary = () => {
    const normalizedWord = spellCheckIssue?.normalizedWord
    if (!normalizedWord) {
      return
    }

    setSpellCheckDictionary((current) => {
      if (current.includes(normalizedWord)) {
        return current
      }

      return [...current, normalizedWord]
    })

    setSpellCheckIgnoredWords((current) => current.filter((word) => word !== normalizedWord))
    void addNativeSpellCheckWord(normalizedWord)
  }

  const removeSpellCheckWordFromDictionary = (word: string) => {
    const normalizedWord = normalizeSpellCheckWord(word)
    if (!normalizedWord) {
      return
    }

    setSpellCheckDictionary((current) => current.filter((entry) => entry !== normalizedWord))

    if (spellCheckIgnoredWords.includes(normalizedWord)) {
      return
    }

    void removeNativeSpellCheckWord(normalizedWord)
  }

  const applySpellCheckSuggestion = (replacement: string) => {
    if (!spellCheckIssue || !spellCheckDocumentId || !spellCheckDocumentType) {
      return
    }

    const targetDocumentId = spellCheckDocumentId
    const nextContent = replaceSpellCheckIssue(activeContent, spellCheckDocumentType, spellCheckIssue, replacement)

    if (nextContent === activeContent) {
      return
    }

    onProjectChange((currentProject) => ({
      ...currentProject,
      contentById: {
        ...currentProject.contentById,
        [targetDocumentId]: nextContent,
      },
    }))
  }

  const commitSpellCheckPrimaryAction = () => {
    if (!spellCheckIssue) {
      return
    }

    const primarySuggestion = spellCheckIssue.suggestions[0]

    if (primarySuggestion) {
      applySpellCheckSuggestion(primarySuggestion)
      return
    }

    addSpellCheckWordToDictionary()
  }

  return {
    isSpellCheckOpen,
    spellCheckDocumentType,
    spellCheckIssue,
    spellCheckIndex,
    spellCheckIssues,
    spellCheckDictionary,
    closeSpellCheckModal,
    goToPreviousSpellCheckIssue,
    goToNextSpellCheckIssue,
    ignoreSpellCheckIssue,
    addSpellCheckWordToDictionary,
    removeSpellCheckWordFromDictionary,
    applySpellCheckSuggestion,
    commitSpellCheckPrimaryAction,
  }
}
