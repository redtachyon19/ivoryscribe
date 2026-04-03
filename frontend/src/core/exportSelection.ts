export type ExportMode = "single-document" | "separate-files"

export type ExportTabDescriptor = {
  id: string
  title: string
}

export type ExportPlan =
  | {
    mode: "single-document"
    selectedTabIds: string[]
  }
  | {
    mode: "separate-files"
  }

type ResolveExportPlanOptions = {
  formatLabel: "Markdown" | "PDF"
  tabs: ExportTabDescriptor[]
  preferredMode?: ExportMode
  preferredSelectedTabIds?: string[]
}

function normalizeSelectedIds(tabs: ExportTabDescriptor[], selectedIds: string[] | undefined) {
  if (!selectedIds || selectedIds.length === 0) {
    return tabs.map((tab) => tab.id)
  }

  const selectedSet = new Set(selectedIds)
  const normalized = tabs.filter((tab) => selectedSet.has(tab.id)).map((tab) => tab.id)
  return normalized.length > 0 ? normalized : tabs.map((tab) => tab.id)
}

function parseSelectionInput(input: string, maxIndex: number): number[] | null {
  const normalized = input.trim().toLowerCase()
  if (!normalized || normalized === "all" || normalized === "*") {
    return Array.from({ length: maxIndex }, (_, index) => index + 1)
  }

  const values = new Set<number>()
  const tokens = normalized.split(",")

  for (const token of tokens) {
    const trimmed = token.trim()
    if (!trimmed) {
      return null
    }

    const rangeMatch = trimmed.match(/^(\d+)\s*-\s*(\d+)$/)
    if (rangeMatch) {
      const start = Number.parseInt(rangeMatch[1], 10)
      const end = Number.parseInt(rangeMatch[2], 10)
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < 1 || start > maxIndex || end > maxIndex) {
        return null
      }

      const [lower, upper] = start <= end ? [start, end] : [end, start]
      for (let value = lower; value <= upper; value += 1) {
        values.add(value)
      }
      continue
    }

    if (!/^\d+$/.test(trimmed)) {
      return null
    }

    const value = Number.parseInt(trimmed, 10)
    if (!Number.isFinite(value) || value < 1 || value > maxIndex) {
      return null
    }
    values.add(value)
  }

  if (values.size === 0) {
    return null
  }

  return Array.from(values).sort((left, right) => left - right)
}

function selectModeInteractive(formatLabel: "Markdown" | "PDF"): ExportMode | null {
  while (true) {
    const value = window.prompt(
      [
        `${formatLabel} export options:`,
        "",
        "1) One combined file",
        "2) Separate files (zip folder)",
        "",
        "Enter 1 or 2. Cancel aborts export.",
      ].join("\n"),
      "1",
    )

    if (value === null) {
      return null
    }

    const normalized = value.trim().toLowerCase()
    if (normalized === "1" || normalized === "single" || normalized === "single-document") {
      return "single-document"
    }

    if (normalized === "2" || normalized === "separate" || normalized === "separate-files" || normalized === "zip") {
      return "separate-files"
    }

    window.alert("Enter 1 for one combined file or 2 for separate files.")
  }
}

function selectTabsInteractive(formatLabel: "Markdown" | "PDF", tabs: ExportTabDescriptor[]): string[] | null {
  if (tabs.length === 0) {
    return []
  }

  const lines = tabs.map((tab, index) => `${index + 1}. ${tab.title}`)

  while (true) {
    const value = window.prompt(
      [
        `${formatLabel} single-file export: choose chapters to keep.`,
        "",
        ...lines,
        "",
        "Enter numbers or ranges (example: 1,3-5)",
        "Type 'all' for every chapter. Cancel aborts export.",
      ].join("\n"),
      "all",
    )

    if (value === null) {
      return null
    }

    const selectedIndexes = parseSelectionInput(value, tabs.length)
    if (!selectedIndexes) {
      window.alert("Invalid selection. Use numbers and ranges like 1,3-5, or 'all'.")
      continue
    }

    const selectedIds = selectedIndexes.map((index) => tabs[index - 1]?.id).filter((id): id is string => Boolean(id))
    if (selectedIds.length === 0) {
      window.alert("Select at least one chapter.")
      continue
    }

    return selectedIds
  }
}

export function resolveExportPlan(options: ResolveExportPlanOptions): ExportPlan | null {
  const { formatLabel, tabs, preferredMode, preferredSelectedTabIds } = options

  if (typeof window === "undefined" || typeof window.prompt !== "function") {
    if (preferredMode === "separate-files") {
      return { mode: "separate-files" }
    }

    return {
      mode: "single-document",
      selectedTabIds: normalizeSelectedIds(tabs, preferredSelectedTabIds),
    }
  }

  const mode = preferredMode ?? selectModeInteractive(formatLabel)
  if (!mode) {
    return null
  }

  if (mode === "separate-files") {
    return { mode }
  }

  if (preferredSelectedTabIds) {
    return {
      mode,
      selectedTabIds: normalizeSelectedIds(tabs, preferredSelectedTabIds),
    }
  }

  const selectedTabIds = selectTabsInteractive(formatLabel, tabs)
  if (!selectedTabIds) {
    return null
  }

  return {
    mode,
    selectedTabIds,
  }
}