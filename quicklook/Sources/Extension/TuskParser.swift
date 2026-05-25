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
        } else if elementName == "body" {
            // <body> is the chapter prose container.
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
