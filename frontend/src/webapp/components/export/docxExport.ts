import JSZip from "jszip"
import { normalizeLineEndings, plainTextFromHtml } from "../../../core/utils/markdown"
import { collectTabSequence, type Project } from "../../../core/utils/projects"
import { resolveExportPlan, type ExportMode } from "./exportSelection"
import { downloadBlob, sanitizeZipEntryName, slugifyFileName } from "./exportUtils"

export type DocxExportMode = ExportMode

type ExportProjectAsDocxOptions = {
  mode?: DocxExportMode
  selectedTabIds?: string[]
}

type DocxSection = {
  title: string
  text: string
}

function getTabPlainText(value: string) {
  return plainTextFromHtml(value).trim()
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function createWordParagraph(text: string, style: "Heading1" | "Heading2" | null = null) {
  const escaped = escapeXml(text)
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""
  return `<w:p>${styleXml}<w:r><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`
}

function createWordParagraphBreak() {
  return "<w:p/>"
}

function toDocxParagraphs(projectName: string, sections: DocxSection[]) {
  const paragraphs: string[] = [createWordParagraph(projectName, "Heading1"), createWordParagraphBreak()]

  if (sections.length === 0) {
    paragraphs.push(createWordParagraph("No documents available."))
    return paragraphs
  }

  for (const section of sections) {
    paragraphs.push(createWordParagraph(section.title, "Heading2"))

    const lines = normalizeLineEndings(section.text || "").split("\n")
    if (lines.length === 0 || (lines.length === 1 && !lines[0].trim())) {
      paragraphs.push(createWordParagraph("(Empty document)"))
      paragraphs.push(createWordParagraphBreak())
      continue
    }

    for (const line of lines) {
      if (line.trim().length === 0) {
        paragraphs.push(createWordParagraphBreak())
      } else {
        paragraphs.push(createWordParagraph(line))
      }
    }

    paragraphs.push(createWordParagraphBreak())
  }

  return paragraphs
}

function buildDocumentXml(projectName: string, sections: DocxSection[]) {
  const paragraphs = toDocxParagraphs(projectName, sections).join("")

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 wp14">
  <w:body>
    ${paragraphs}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
      <w:cols w:space="720"/>
      <w:docGrid w:linePitch="360"/>
    </w:sectPr>
  </w:body>
</w:document>`
}

async function buildDocxBlob(projectName: string, sections: DocxSection[]) {
  const zip = new JSZip()

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  )

  zip.folder("_rels")?.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  )

  zip.folder("word")?.file("document.xml", buildDocumentXml(projectName, sections))

  return zip.generateAsync({ type: "blob" })
}

function toSections(project: Project, sequence: Array<{ id: string; title: string }>): DocxSection[] {
  return sequence.map((tab) => ({
    title: tab.title,
    text: getTabPlainText(project.contentById[tab.id] ?? ""),
  }))
}

async function exportProjectAsDocxZip(project: Project, sequence: Array<{ id: string; title: string }>) {
  const folderName = sanitizeZipEntryName(project.name)
  const zip = new JSZip()

  if (!sequence.length) {
    zip.file(`${folderName}/README.txt`, "No documents to export.")
  } else {
    for (let index = 0; index < sequence.length; index += 1) {
      const tab = sequence[index]
      const fileBase = slugifyFileName(tab.title)
      const fileName = `${String(index + 1).padStart(2, "0")}-${fileBase}.docx`
      const docBlob = await buildDocxBlob(project.name, toSections(project, [tab]))
      const buffer = await docBlob.arrayBuffer()
      zip.file(`${folderName}/${fileName}`, buffer)
    }
  }

  const zipBlob = await zip.generateAsync({ type: "blob" })
  downloadBlob(zipBlob, `${slugifyFileName(project.name)}-documents-docx.zip`)
}

export async function exportProjectAsDocx(project: Project, options: ExportProjectAsDocxOptions = {}) {
  const sequence = collectTabSequence(project.tabs)
  const plan = resolveExportPlan({
    formatLabel: "DOCX",
    tabs: sequence,
    preferredMode: options.mode,
    preferredSelectedTabIds: options.selectedTabIds,
  })

  if (!plan) {
    return
  }

  if (plan.mode === "separate-files") {
    await exportProjectAsDocxZip(project, sequence)
    return
  }

  const selectedSet = new Set(plan.selectedTabIds)
  const selectedSequence = sequence.filter((tab) => selectedSet.has(tab.id))
  const docBlob = await buildDocxBlob(project.name, toSections(project, selectedSequence))
  downloadBlob(docBlob, `${slugifyFileName(project.name)}.docx`)
}
