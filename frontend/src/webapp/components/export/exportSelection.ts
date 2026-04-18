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
  formatLabel: string
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

export function resolveExportPlan(options: ResolveExportPlanOptions): ExportPlan | null {
  const { tabs, preferredMode, preferredSelectedTabIds } = options
  const mode = preferredMode ?? "single-document"

  if (mode === "separate-files") {
    return { mode }
  }

  return {
    mode: "single-document",
    selectedTabIds: normalizeSelectedIds(tabs, preferredSelectedTabIds),
  }
}