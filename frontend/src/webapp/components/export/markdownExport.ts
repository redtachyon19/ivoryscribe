import JSZip from "jszip"
import { normalizeMarkdownContentForEditing } from "../../../core/markdown"
import { collectTabSequence, type Project } from "../../../core/projects"
import { resolveExportPlan, type ExportMode } from "./exportSelection"

export type MarkdownExportMode = ExportMode

type DownloadProjectAsMarkdownOptions = {
  mode?: MarkdownExportMode
  selectedTabIds?: string[]
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

function getTabMarkdownContent(value: string) {
  return normalizeMarkdownContentForEditing(value)
}

export function buildProjectMarkdown(project: Project) {
  const sequence = collectTabSequence(project.tabs)
  return buildProjectMarkdownFromSequence(project, sequence)
}

function buildProjectMarkdownFromSequence(project: Project, sequence: Array<{ id: string; title: string }>) {
  const sections = [`# ${project.name}`, ""]

  if (!sequence.length) {
    sections.push("_No documents available._")
    sections.push("")
    return sections.join("\n")
  }

  for (const tab of sequence) {
    sections.push(`## ${tab.title}`)
    sections.push("")

    const content = getTabMarkdownContent(project.contentById[tab.id] ?? "")
    sections.push(content || "_Empty document._")
    sections.push("")
  }

  return sections.join("\n")
}

async function downloadProjectAsMarkdownZip(project: Project, sequence: Array<{ id: string; title: string }>) {
  const folderName = sanitizeZipEntryName(project.name)
  const zip = new JSZip()

  if (!sequence.length) {
    zip.file(`${folderName}/README.md`, `# ${project.name}\n\n_No documents available._\n`)
  } else {
    sequence.forEach((tab, index) => {
      const content = getTabMarkdownContent(project.contentById[tab.id] ?? "")
      const fileBase = slugifyFileName(tab.title)
      const fileName = `${String(index + 1).padStart(2, "0")}-${fileBase}.md`
      const markdown = `# ${tab.title}\n\n${content || "_Empty document._"}\n`
      zip.file(`${folderName}/${fileName}`, markdown)
    })
  }

  const zipBlob = await zip.generateAsync({ type: "blob" })
  downloadBlob(zipBlob, `${slugifyFileName(project.name)}-chapters.zip`)
}

export async function downloadProjectAsMarkdown(project: Project, options: DownloadProjectAsMarkdownOptions = {}) {
  const sequence = collectTabSequence(project.tabs)
  const plan = resolveExportPlan({
    formatLabel: "Markdown",
    tabs: sequence,
    preferredMode: options.mode,
    preferredSelectedTabIds: options.selectedTabIds,
  })

  if (!plan) {
    return
  }

  if (plan.mode === "separate-files") {
    await downloadProjectAsMarkdownZip(project, sequence)
    return
  }

  const selectedSet = new Set(plan.selectedTabIds)
  const selectedSequence = sequence.filter((tab) => selectedSet.has(tab.id))
  const markdown = buildProjectMarkdownFromSequence(project, selectedSequence)
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" })
  downloadBlob(blob, `${slugifyFileName(project.name)}.md`)
}