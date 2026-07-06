// Writes an editable bookmark tree back into a PDF's real outline (the
// `/Outlines` dictionary in the document catalog), so edits made in the sidebar
// travel inside the .pdf and show up in any PDF reader.
//
// pdf.js (used by the viewer) is read-only, so the write path uses pdf-lib.
// pdf-lib has no high-level outline API, so we build the `/Outlines` dict tree
// by hand: a root dict, one indirect dict per bookmark, linked with
// First/Last/Next/Prev/Parent, each pointing at a page via an explicit
// destination. See PDF 32000-1:2008 §12.3.3 (Document Outline).
//
// `buildPdfWithOutline` is pure (pdf-lib only) so it can be exercised by the
// Node round-trip harness (scripts/verify-pdf-bookmarks.ts); `persistOutline`
// wraps it with the Electron read/write bridge.

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
// Type-only: erased at build/strip time, so this module pulls in NO runtime
// dependency on the store (and therefore not React) — keeps it Node-importable.
import type { PdfBookmark } from "./pdfBookmarkStore"

/** Total number of items in a forest, counting every level. Used for the
 *  `/Count` entries (we mark every node open, so an item's count is its full
 *  descendant total and the sign is positive). */
function countAll(nodes: PdfBookmark[]): number {
  let total = 0
  for (const node of nodes) total += 1 + countAll(node.children)
  return total
}

const refKey = (ref: PDFRef): string => `${ref.objectNumber}-${ref.generationNumber}`

/** Remove any existing outline (root dict + every item) so repeated edits don't
 *  leave orphaned dead objects accumulating in the file on each rewrite.
 *  Best-effort: a malformed existing outline just falls through to overwriting
 *  the catalog's `/Outlines` entry. */
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
    // Ignore — overwriting the catalog entry below is enough for correctness.
  }
  catalog.delete(PDFName.of("Outlines"))
}

/** Load `bytes`, replace its outline with `tree`, and return the new PDF bytes.
 *  Page-level destinations only: each bookmark lands at the top of its page
 *  (`/XYZ left top zoom` with left/zoom retained). */
export async function buildPdfWithOutline(bytes: Uint8Array, tree: PdfBookmark[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  const context = doc.context
  const pages = doc.getPages()

  deleteExistingOutline(doc)

  // Every bookmark deleted → leave the PDF with no outline.
  if (tree.length === 0) return await doc.save()

  const rootDict = PDFDict.withContext(context)
  rootDict.set(PDFName.of("Type"), PDFName.of("Outlines"))
  const rootRef = context.register(rootDict)

  // `[pageRef /XYZ null top null]` — top of the page (PDF origin is
  // bottom-left, so the top edge's y is the page height), current left + zoom
  // retained. Clamp the 1-indexed page into range.
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

  // Create indirect dicts for a sibling list, wire their links, recurse into
  // children. Returns the first/last child refs for the parent to point at.
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

/** Read the PDF at `filePath`, rewrite its outline to `tree`, write it back.
 *  Desktop-only (needs the Electron binary fs bridge). */
export async function persistOutline(filePath: string, tree: PdfBookmark[]): Promise<void> {
  const api = window.electronAPI?.fs
  if (!api || typeof api.readFileBinary !== "function" || typeof api.writeFileBinary !== "function") {
    throw new Error("Saving PDF bookmarks requires the desktop app.")
  }
  const bytes = await api.readFileBinary(filePath)
  // pdf-lib mutates its input buffer; hand it a fresh copy.
  const out = await buildPdfWithOutline(bytes.slice(), tree)
  await api.writeFileBinary(filePath, out)
}
