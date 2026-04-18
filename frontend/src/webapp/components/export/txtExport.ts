import JSZip from "jszip"
import { collectTabSequence, type Project } from "../../../core/projects"
import { resolveExportPlan, type ExportMode } from "./exportSelection"

export type TxtExportMode = ExportMode

type ExportProjectAsTxtOptions = {
  mode?: TxtExportMode
  selectedTabIds?: string[]
}

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n?/g, "\n")
}

function plainTextFromHtml(value: string) {
  if (typeof DOMParser === "undefined") {
    return normalizeLineEndings(value.replace(/<[^>]*>/g, " "))
  }

  const normalized = value
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote|pre)>/gi, "\n")

  const document = new DOMParser().parseFromString(normalized, "text/html")
  const text = document.body.textContent ?? ""
  return normalizeLineEndings(text)
}

function getTabPlainText(value: string) {
  return plainTextFromHtml(value).trim()
}

function slugifyFileName(value: string) {
  const trimmed = value.trim().toLowerCase()
  const slug = trimmed
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

  return slug || "project"
}

function sanitizeZipEntryName(value: string) {
  const trimmed = value.trim()
  const sanitized = trimmed.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim()
  return sanitized || "project"
}

function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = objectUrl
  link.download = fileName

  document.body.appendChild(link)
  link.click()
  link.remove()

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl)
  }, 0)
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
