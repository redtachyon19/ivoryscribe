import JSZip from "jszip"
import { normalizeMarkdownContentForEditing } from "../../../core/utils/markdown"
import { collectTabSequence, type Project } from "../../../core/utils/projects"
import { resolveExportPlan, type ExportMode } from "./exportSelection"
import { downloadBlob, sanitizeZipEntryName, slugifyFileName } from "./exportUtils"

export type MarkdownExportMode = ExportMode

type DownloadProjectAsMarkdownOptions = {
  mode?: MarkdownExportMode
  selectedTabIds?: string[]
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