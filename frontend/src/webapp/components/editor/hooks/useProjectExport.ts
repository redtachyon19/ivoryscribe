import { useEffect, useState } from "react"
import { APP_EXPORT_PROJECT_EVENT, type ExportProjectFormat } from "../../../../core/events/editorEvents"
import type { Project } from "../../../../core/utils/projects"
import type { ExportMode } from "../../export/exportSelection"
import { exportProjectAsDocx } from "../../export/docxExport"
import { downloadProjectAsMarkdown } from "../../export/markdownExport"
import { exportProjectAsPdf } from "../../export/pdfExport"
import { exportProjectAsTxt } from "../../export/txtExport"

export function useProjectExport(project: Project | null) {
  const [pendingExportFormat, setPendingExportFormat] = useState<ExportProjectFormat | null>(null)

  useEffect(() => {
    const onExportRequest: EventListener = (event) => {
      if (!project) return
      const customEvent = event as CustomEvent<{ format?: ExportProjectFormat }>
      const format = customEvent.detail?.format ?? "pdf"
      setPendingExportFormat(format)
    }

    window.addEventListener(APP_EXPORT_PROJECT_EVENT, onExportRequest)
    return () => {
      window.removeEventListener(APP_EXPORT_PROJECT_EVENT, onExportRequest)
    }
  }, [project])

  const closeExportModal = () => {
    setPendingExportFormat(null)
  }

  const runExport = (format: ExportProjectFormat, mode: ExportMode, selectedTabIds: string[]) => {
    if (!project) {
      return
    }

    const options = mode === "separate-files"
      ? { mode: "separate-files" as const }
      : { mode: "single-document" as const, selectedTabIds }

    if (format === "md") {
      void downloadProjectAsMarkdown(project, options)
      return
    }

    if (format === "docx") {
      void exportProjectAsDocx(project, options)
      return
    }

    if (format === "txt") {
      void exportProjectAsTxt(project, options)
      return
    }

    void exportProjectAsPdf(project, options)
  }

  return { pendingExportFormat, closeExportModal, runExport }
}
