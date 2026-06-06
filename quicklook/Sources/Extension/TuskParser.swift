// TuskParser — minimal XML parser for .tusk (Book) and .tusks (Presentation).
//
// We deliberately re-parse the small subset of the schema we need rather than
// pulling in the frontend's TypeScript codec. The QL preview only needs:
//
//   .tusk  : project name + ordered chapter titles + first ~280 chars of body
//   .tusks : project name + ordered slide titles
//
// The parser is forgiving: missing attributes/elements fall back to safe
// defaults so we always produce *some* preview rather than failing.

import Foundation

struct TuskChapter {
    var title: String
    var mode: String   // "default" | "markdown" | "typewriter" | "plaintext"
    var body: String
}

struct TuskBookPreview {
    var name: String
    var color: String?
    var chapters: [TuskChapter]
}

struct TuskSlide {
    var title: String
}

struct TuskPresentationPreview {
    var name: String
    var color: String?
    var slides: [TuskSlide]
}

enum TuskParseError: Error {
    case malformed(String)
}

// ── Book parser ────────────────────────────────────────────────────────────

final class BookParserDelegate: NSObject, XMLParserDelegate {
    var name: String = "Untitled"
    var color: String? = nil
    var chapters: [TuskChapter] = []

    // Stack of currently-open elements, so we can disambiguate <name> at root
    // vs <name> inside <chapter>.
    private var elementStack: [String] = []
    private var currentChapter: TuskChapter? = nil
    private var textBuffer: String = ""

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes attributeDict: [String : String] = [:]) {
        elementStack.append(elementName)
        textBuffer = ""

        if elementName == "tusk" {
            if let c = attributeDict["color"] { color = c }
        } else if elementName == "chapter" {
            currentChapter = TuskChapter(
                title: attributeDict["title"] ?? "Untitled Chapter",
                mode: attributeDict["mode"] ?? "default",
                body: ""
            )
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        textBuffer += string
    }

    func parser(_ parser: XMLParser, foundCDATA CDATABlock: Data) {
        if let s = String(data: CDATABlock, encoding: .utf8) {
            textBuffer += s
        }
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) {
        // Only treat a <name> as the book name when its parent is the root
        // <tusk> element. <chapter> doesn't currently have a <name> child but
        // be defensive about future schema drift.
        if elementName == "name" {
            let parentIdx = elementStack.count - 2
            if parentIdx >= 0 && elementStack[parentIdx] == "tusk" {
                let trimmed = textBuffer.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty { name = trimmed }
            }
        } else if elementName == "content" || elementName == "body" {
            // Chapter prose container. The current on-disk schema uses
            // <content> (CDATA HTML); older snapshots used <body>. Accept
            // either so the preview shows real text instead of nothing.
            if currentChapter != nil {
                currentChapter!.body = textBuffer
            }
        } else if elementName == "chapter" {
            if let c = currentChapter { chapters.append(c) }
            currentChapter = nil
        }

        if !elementStack.isEmpty { elementStack.removeLast() }
        textBuffer = ""
    }
}

func parseTuskBook(data: Data) throws -> TuskBookPreview {
    let parser = XMLParser(data: data)
    let delegate = BookParserDelegate()
    parser.delegate = delegate
    parser.shouldProcessNamespaces = false
    parser.shouldReportNamespacePrefixes = false
    parser.shouldResolveExternalEntities = false
    if !parser.parse() {
        let err = parser.parserError?.localizedDescription ?? "unknown"
        throw TuskParseError.malformed("Tusk book parse failed: \(err)")
    }
    return TuskBookPreview(name: delegate.name, color: delegate.color, chapters: delegate.chapters)
}

// ── Presentation parser ────────────────────────────────────────────────────

final class PresentationParserDelegate: NSObject, XMLParserDelegate {
    var name: String = "Untitled"
    var color: String? = nil
    var slides: [TuskSlide] = []

    private var elementStack: [String] = []
    private var textBuffer: String = ""

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes attributeDict: [String : String] = [:]) {
        elementStack.append(elementName)
        textBuffer = ""

        if elementName == "tusks" {
            if let c = attributeDict["color"] { color = c }
        } else if elementName == "slide" {
            let title = attributeDict["title"] ?? "Untitled Slide"
            slides.append(TuskSlide(title: title))
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        textBuffer += string
    }

    func parser(_ parser: XMLParser, foundCDATA CDATABlock: Data) {
        // Slide boards are CDATA; we don't render them in the preview (they're
        // opaque pinboard payloads). Discard.
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) {
        if elementName == "name" {
            let parentIdx = elementStack.count - 2
            if parentIdx >= 0 && elementStack[parentIdx] == "tusks" {
                let trimmed = textBuffer.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty { name = trimmed }
            }
        }
        if !elementStack.isEmpty { elementStack.removeLast() }
        textBuffer = ""
    }
}

func parseTuskPresentation(data: Data) throws -> TuskPresentationPreview {
    let parser = XMLParser(data: data)
    let delegate = PresentationParserDelegate()
    parser.delegate = delegate
    parser.shouldProcessNamespaces = false
    parser.shouldReportNamespacePrefixes = false
    parser.shouldResolveExternalEntities = false
    if !parser.parse() {
        let err = parser.parserError?.localizedDescription ?? "unknown"
        throw TuskParseError.malformed("Tusk presentation parse failed: \(err)")
    }
    return TuskPresentationPreview(name: delegate.name, color: delegate.color, slides: delegate.slides)
}

// ── Embedded 1:1 PDF preview ─────────────────────────────────────────────────
//
// The app embeds a base64 PDF render of the whole document (the same output the
// in-app PDF export produces) as the last element before </tusk>:
//
//   <preview kind="pdf" pages="all">JVBERi0xLjcK…base64…</preview>
//
// When present, this IS the faithful typewriter render — so the thumbnail and
// preview should display it directly (CoreGraphics for the icon, native PDF for
// the Spacebar panel) instead of hand-drawing an approximation. We scan for it
// with a forgiving substring search rather than a full XML parse: it lives at
// the very end of the file, the payload is plain base64 (no XML-special chars),
// and we never want a parse hiccup elsewhere to lose the preview.

import CoreGraphics

/// Pull the embedded `<preview kind="pdf">` payload out of a .tusk/.tusks file
/// and base64-decode it to raw PDF bytes. Returns nil when absent/empty.
func extractEmbeddedPdf(data: Data) -> Data? {
    guard let s = String(data: data, encoding: .utf8) else { return nil }
    // Search backwards — the preview is emitted last, and chapter CDATA could
    // in theory contain the literal text "<preview".
    guard let open = s.range(of: "<preview kind=\"pdf\"", options: .backwards) else { return nil }
    guard let gt = s.range(of: ">", range: open.upperBound..<s.endIndex) else { return nil }
    guard let close = s.range(of: "</preview>", range: gt.upperBound..<s.endIndex) else { return nil }
    let b64 = s[gt.upperBound..<close.lowerBound].trimmingCharacters(in: .whitespacesAndNewlines)
    if b64.isEmpty { return nil }
    return Data(base64Encoded: b64, options: .ignoreUnknownCharacters)
}

/// First-page media-box size of a PDF, in points. Falls back to US-Letter.
func firstPdfPageSize(_ pdfData: Data) -> CGSize {
    guard let provider = CGDataProvider(data: pdfData as CFData),
          let doc = CGPDFDocument(provider),
          let page = doc.page(at: 1) else {
        return CGSize(width: 612, height: 792)
    }
    let box = page.getBoxRect(.mediaBox)
    return (box.width > 0 && box.height > 0) ? box.size : CGSize(width: 612, height: 792)
}

/// Draw page 1 of a PDF, aspect-fit and centered, into a CoreGraphics context
/// whose origin is bottom-left and y-up (i.e. the QuickLook thumbnail/preview
/// context BEFORE any AppKit flip). PDF user space is also y-up, so no flip is
/// needed — the page renders upright. Returns false if the PDF can't be read.
func drawEmbeddedPdfPage1(_ pdfData: Data, into cg: CGContext, size: CGSize) -> Bool {
    guard let provider = CGDataProvider(data: pdfData as CFData),
          let doc = CGPDFDocument(provider),
          let page = doc.page(at: 1) else { return false }
    let box = page.getBoxRect(.mediaBox)
    guard box.width > 0, box.height > 0 else { return false }

    cg.saveGState()
    // Opaque white page so transparent PDF regions don't show the desktop.
    cg.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    cg.fill(CGRect(origin: .zero, size: size))

    let scale = min(size.width / box.width, size.height / box.height)
    let drawW = box.width * scale, drawH = box.height * scale
    cg.translateBy(x: (size.width - drawW) / 2, y: (size.height - drawH) / 2)
    cg.scaleBy(x: scale, y: scale)
    cg.translateBy(x: -box.minX, y: -box.minY)
    cg.interpolationQuality = .high
    cg.drawPDFPage(page)
    cg.restoreGState()
    return true
}
