// Spell-check user-dictionary helpers — localStorage persistence + native
// Electron spellchecker sync. The orchestrating state lives in Editor.tsx;
// these are the pure helpers it uses.

export const SPELL_CHECK_DICTIONARY_STORAGE_KEY = "ivoryscribe:spell-check-dictionary"

export function normalizeSpellCheckWord(value: string) {
  return value.trim().replace(/’/g, "'").toLowerCase()
}

export async function addNativeSpellCheckWord(word: string) {
  const normalizedWord = normalizeSpellCheckWord(word)
  if (!normalizedWord || typeof window === "undefined") {
    return false
  }

  try {
    return (await window.electronAPI?.addSpellCheckerWord?.(normalizedWord)) ?? false
  } catch {
    return false
  }
}

export async function removeNativeSpellCheckWord(word: string) {
  const normalizedWord = normalizeSpellCheckWord(word)
  if (!normalizedWord || typeof window === "undefined") {
    return false
  }

  try {
    return (await window.electronAPI?.removeSpellCheckerWord?.(normalizedWord)) ?? false
  } catch {
    return false
  }
}

export function loadSpellCheckDictionary(): string[] {
  if (typeof window === "undefined") return []

  try {
    const raw = window.localStorage.getItem(SPELL_CHECK_DICTIONARY_STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return Array.from(new Set(
      parsed
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0),
    ))
  } catch {
    return []
  }
}
