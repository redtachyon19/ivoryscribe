import JSZip from "jszip"
import { plainTextFromHtml } from "../../../core/utils/markdown"
import { collectTabSequence, type Project } from "../../../core/utils/projects"
import { resolveExportPlan, type ExportMode } from "./exportSelection"
import { downloadBlob, sanitizeZipEntryName, slugifyFileName } from "./exportUtils"

export type TxtExportMode = ExportMode

type ExportProjectAsTxtOptions = {
  mode?: TxtExportMode
  selectedTabIds?: string[]
}

function getTabPlainText(value: string) {
  return plainTextFromHtml(value).trim()
}

function buildProjectText(project: Project, sequence: Array<{ id: string; title: string }>) {
  const sections: string[] = [project.name, ""]

  if (sequence.length === 0) {
    sections.push("No documents available.")
    sections.push("")
    return sections.join("\n")
  }

  for (const tab of sequence) {
    sections.push(tab.title)
    sections.push("=".repeat(tab.title.length))
    sections.push("")

    const content = getTabPlainText(project.contentById[tab.id] ?? "")
    sections.push(content || "(Empty document)")
    sections.push("")
  }

  return sections.join("\n")
}

async function exportProjectAsTxtZip(project: Project, sequence: Array<{ id: string; title: string }>) {
  const folderName = sanitizeZipEntryName(project.name)
  const zip = new JSZip()

  if (!sequence.length) {
    zip.file(`${folderName}/README.txt`, "No documents to export.")
  } else {
    sequence.forEach((tab, index) => {
      const content = getTabPlainText(project.contentById[tab.id] ?? "")
      const fileBase = slugifyFileName(tab.title)
      const fileName = `${String(index + 1).padStart(2, "0")}-${fileBase}.txt`
      const text = `${tab.title}\n${"=".repeat(tab.title.length)}\n\n${content || "(Empty document)"}\n`
      zip.file(`${folderName}/${fileName}`, text)
    })
  }

  const zipBlob = await zip.generateAsync({ type: "blob" })
  downloadBlob(zipBlob, `${slugifyFileName(project.name)}-documents-txt.zip`)
}

export async function exportProjectAsTxt(project: Project, options: ExportProjectAsTxtOptions = {}) {
  const sequence = collectTabSequence(project.tabs)
  const plan = resolveExportPlan({
    formatLabel: "TXT",
    tabs: sequence,
    preferredMode: options.mode,
    preferredSelectedTabIds: options.selectedTabIds,
  })

  if (!plan) {
    return
  }

  if (plan.mode === "separate-files") {
    await exportProjectAsTxtZip(project, sequence)
    return
  }

  const selectedSet = new Set(plan.selectedTabIds)
  const selectedSequence = sequence.filter((tab) => selectedSet.has(tab.id))
  const text = buildProjectText(project, selectedSequence)
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" })
  downloadBlob(blob, `${slugifyFileName(project.name)}.txt`)
}
