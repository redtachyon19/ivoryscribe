import { PDFDocument, StandardFonts } from "pdf-lib"
import { buildPdfWithOutline } from "../src/core/pdf/pdfOutlineWriter.ts"
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs"

type Bm = { id: string; title: string; pageNumber: number; children: Bm[] }
type OutlineItem = { title: string; dest: string | unknown[] | null; items?: OutlineItem[] }

let failures = 0
function check(label: string, cond: boolean, extra?: string): void {
  if (cond) {
    console.log(`  ✓ ${label}`)
  } else {
    failures++
    console.error(`  ✗ ${label}${extra ? ` — ${extra}` : ""}`)
  }
}

async function makePdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pageCount; i++) {
    const page = doc.addPage([612, 792])
    page.drawText(`Page ${i}`, { x: 50, y: 700, size: 40, font })
  }
  return await doc.save()
}

type ReadNode = { title: string; page: number | null; children: ReadNode[] }

async function readOutline(bytes: Uint8Array): Promise<ReadNode[] | null> {
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise
  const resolve = async (dest: unknown): Promise<number | null> => {
    const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest
    if (!Array.isArray(explicit) || !explicit[0]) return null
    return (await doc.getPageIndex(explicit[0])) + 1
  }
  const walk = async (items: OutlineItem[] | null | undefined): Promise<ReadNode[]> => {
    const out: ReadNode[] = []
    for (const it of items ?? []) {
      out.push({ title: it.title, page: await resolve(it.dest), children: await walk(it.items) })
    }
    return out
  }
  const outline = await doc.getOutline()
  const result = outline ? await walk(outline) : null
  await doc.destroy()
  return result
}

async function main(): Promise<void> {
  console.log("Test 1: nested bookmarks round-trip")
  {
    const pdf = await makePdf(6)
    const tree: Bm[] = [
      { id: "a", title: "Introduction", pageNumber: 1, children: [
        { id: "a1", title: "Background", pageNumber: 2, children: [] },
        { id: "a2", title: "Goals", pageNumber: 3, children: [] },
      ] },
      { id: "b", title: "Methods", pageNumber: 4, children: [] },
      { id: "c", title: "Results", pageNumber: 6, children: [] },
    ]
    const out = await buildPdfWithOutline(pdf, tree)
    const read = await readOutline(out)
    check("outline present", Array.isArray(read) && read!.length === 3)
    check("root titles", JSON.stringify(read?.map((n) => n.title)) === JSON.stringify(["Introduction", "Methods", "Results"]))
    check("root pages", JSON.stringify(read?.map((n) => n.page)) === JSON.stringify([1, 4, 6]),
      `got ${JSON.stringify(read?.map((n) => n.page))}`)
    const intro = read?.[0]
    check("nested children count", intro?.children.length === 2)
    check("nested titles", JSON.stringify(intro?.children.map((n) => n.title)) === JSON.stringify(["Background", "Goals"]))
    check("nested pages", JSON.stringify(intro?.children.map((n) => n.page)) === JSON.stringify([2, 3]),
      `got ${JSON.stringify(intro?.children.map((n) => n.page))}`)
  }

  console.log("Test 2: empty tree removes the outline")
  {
    const pdf = await makePdf(3)
    const withBm = await buildPdfWithOutline(pdf, [{ id: "x", title: "Temp", pageNumber: 2, children: [] }])
    check("outline present after add", (await readOutline(withBm)) !== null)
    const cleared = await buildPdfWithOutline(withBm, [])
    check("outline gone after clear", (await readOutline(cleared)) === null)
  }

  console.log("Test 3: rewrite replaces the previous outline")
  {
    const pdf = await makePdf(4)
    const first = await buildPdfWithOutline(pdf, [
      { id: "1", title: "Old A", pageNumber: 1, children: [] },
      { id: "2", title: "Old B", pageNumber: 2, children: [] },
    ])
    const second = await buildPdfWithOutline(first, [
      { id: "3", title: "New Only", pageNumber: 3, children: [] },
    ])
    const read = await readOutline(second)
    check("single root after rewrite", read?.length === 1, `got ${read?.length}`)
    check("rewrite has new title", read?.[0]?.title === "New Only")
  }

  console.log("Test 4: unicode titles")
  {
    const pdf = await makePdf(2)
    const title = "Résumé — 日本語 ✦ café"
    const out = await buildPdfWithOutline(pdf, [{ id: "u", title, pageNumber: 1, children: [] }])
    const read = await readOutline(out)
    check("unicode title preserved", read?.[0]?.title === title, `got ${JSON.stringify(read?.[0]?.title)}`)
  }

  console.log("Test 5: page clamping")
  {
    const pdf = await makePdf(3)
    const out = await buildPdfWithOutline(pdf, [
      { id: "lo", title: "Too low", pageNumber: 0, children: [] },
      { id: "hi", title: "Too high", pageNumber: 99, children: [] },
    ])
    const read = await readOutline(out)
    check("low page clamps to 1", read?.[0]?.page === 1, `got ${read?.[0]?.page}`)
    check("high page clamps to last", read?.[1]?.page === 3, `got ${read?.[1]?.page}`)
  }

  console.log("")
  if (failures > 0) {
    console.error(`FAILED: ${failures} check(s) failed`)
    process.exit(1)
  }
  console.log("All PDF bookmark round-trip checks passed.")
}

main().catch((err) => {
  console.error("Harness crashed:", err)
  process.exit(1)
})
