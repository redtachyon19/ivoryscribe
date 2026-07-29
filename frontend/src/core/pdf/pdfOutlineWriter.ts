import {
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFArray,
  PDFDict,
  PDFRef,
  PDFNull,
  PDFHexString,
} from "pdf-lib"
import type { PdfBookmark } from "./pdfBookmarkStore"

function countAll(nodes: PdfBookmark[]): number {
  let total = 0
  for (const node of nodes) total += 1 + countAll(node.children)
  return total
}

const refKey = (ref: PDFRef): string => `${ref.objectNumber}-${ref.generationNumber}`

function deleteExistingOutline(doc: PDFDocument): void {
  const context = doc.context
  const catalog = doc.catalog
  try {
    const outlinesRef = catalog.get(PDFName.of("Outlines"))
    const outlines = catalog.lookup(PDFName.of("Outlines"))
    if (outlines instanceof PDFDict) {
      const seen = new Set<string>()
      const collect = (firstVal: unknown): PDFRef[] => {
        const refs: PDFRef[] = []
        let cur: unknown = firstVal
        while (cur instanceof PDFRef && !seen.has(refKey(cur))) {
          seen.add(refKey(cur))
          refs.push(cur)
          const dict = context.lookup(cur)
          if (dict instanceof PDFDict) {
            const childFirst = dict.get(PDFName.of("First"))
            if (childFirst) refs.push(...collect(childFirst))
            cur = dict.get(PDFName.of("Next"))
          } else {
            break
          }
        }
        return refs
      }
      for (const ref of collect(outlines.get(PDFName.of("First")))) context.delete(ref)
      if (outlinesRef instanceof PDFRef) context.delete(outlinesRef)
    }
  } catch {
  }
  catalog.delete(PDFName.of("Outlines"))
}

export async function buildPdfWithOutline(bytes: Uint8Array, tree: PdfBookmark[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  const context = doc.context
  const pages = doc.getPages()

  deleteExistingOutline(doc)

  if (tree.length === 0) return await doc.save()

  const rootDict = PDFDict.withContext(context)
  rootDict.set(PDFName.of("Type"), PDFName.of("Outlines"))
  const rootRef = context.register(rootDict)

  const pageDestFor = (pageNumber: number): PDFArray => {
    const idx = Math.min(Math.max(Math.floor(pageNumber) - 1, 0), pages.length - 1)
    const page = pages[idx]
    const top = page.getSize().height
    const dest = PDFArray.withContext(context)
    dest.push(page.ref)
    dest.push(PDFName.of("XYZ"))
    dest.push(PDFNull)
    dest.push(PDFNumber.of(top))
    dest.push(PDFNull)
    return dest
  }

  const createSiblings = (siblings: PdfBookmark[], parentRef: PDFRef): { first: PDFRef; last: PDFRef } => {
    const entries = siblings.map(() => {
      const dict = PDFDict.withContext(context)
      return { dict, ref: context.register(dict) }
    })
    siblings.forEach((node, i) => {
      const { dict, ref } = entries[i]
      dict.set(PDFName.of("Title"), PDFHexString.fromText(node.title))
      dict.set(PDFName.of("Parent"), parentRef)
      if (i > 0) dict.set(PDFName.of("Prev"), entries[i - 1].ref)
      if (i < entries.length - 1) dict.set(PDFName.of("Next"), entries[i + 1].ref)
      dict.set(PDFName.of("Dest"), pageDestFor(node.pageNumber))
      if (node.children.length > 0) {
        const { first, last } = createSiblings(node.children, ref)
        dict.set(PDFName.of("First"), first)
        dict.set(PDFName.of("Last"), last)
        dict.set(PDFName.of("Count"), PDFNumber.of(countAll(node.children)))
      }
    })
    return { first: entries[0].ref, last: entries[entries.length - 1].ref }
  }

  const { first, last } = createSiblings(tree, rootRef)
  rootDict.set(PDFName.of("First"), first)
  rootDict.set(PDFName.of("Last"), last)
  rootDict.set(PDFName.of("Count"), PDFNumber.of(countAll(tree)))

  doc.catalog.set(PDFName.of("Outlines"), rootRef)

  return await doc.save()
}

export async function persistOutline(filePath: string, tree: PdfBookmark[]): Promise<void> {
  const api = window.electronAPI?.fs
  if (!api || typeof api.readFileBinary !== "function" || typeof api.writeFileBinary !== "function") {
    throw new Error("Saving PDF bookmarks requires the desktop app.")
  }
  const bytes = await api.readFileBinary(filePath)
  const out = await buildPdfWithOutline(bytes.slice(), tree)
  await api.writeFileBinary(filePath, out)
}
