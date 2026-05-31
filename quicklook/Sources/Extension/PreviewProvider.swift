// PreviewProvider — the QuickLook entry point (Spacebar preview panel).
//
// IMPORTANT: this used to return an HTML QLPreviewReply. On modern macOS that
// path makes QuickLook spawn a sandboxed WebKit WebContent process inside the
// extension; when that fails to launch the preview spins forever with no
// error. We sidestep WebKit entirely by DRAWING the preview into a graphics
// context (the same proven-reliable path our thumbnail extension uses, just
// larger and multi-chapter). No web process, no spinner.

import QuickLookUI
import AppKit

// TEMP DIAGNOSTIC — writes the preview lifecycle to /tmp so we can see what
// the sandboxed extension actually does at runtime (its stdout/console is
// not visible). Remove once the preview is confirmed working.
private func pdiag(_ msg: String) {
    let line = "\(Date()) [preview] \(msg)\n"
    if let h = FileHandle(forWritingAtPath: "/tmp/ivory-preview-diag.log") {
        h.seekToEndOfFile(); h.write(line.data(using: .utf8)!); h.closeFile()
    } else {
        try? line.data(using: .utf8)!.write(to: URL(fileURLWithPath: "/tmp/ivory-preview-diag.log"))
    }
}

@objc(PreviewProvider)
final class PreviewProvider: QLPreviewProvider, QLPreviewingController {

    func providePreview(for request: QLFilePreviewRequest) async throws -> QLPreviewReply {
        let url = request.fileURL
        let ext = url.pathExtension.lowercased()
        pdiag("providePreview called for \(url.lastPathComponent) ext=\(ext)")

        // Presentations preview landscape; books/markdown portrait. Pick a
        // generous canvas — QuickLook scales it into the panel.
        let size: CGSize = (ext == "tusks")
            ? CGSize(width: 1024, height: 640)
            : CGSize(width: 800, height: 1035)

        let reply = QLPreviewReply(contextSize: size, isBitmap: true) { (ctx: CGContext, _: QLPreviewReply) in
            pdiag("draw closure entered, size=\(size)")
            // Flip into top-left origin + wrap in a flipped NSGraphicsContext so
            // AppKit text renders upright (same pairing the thumbnail uses).
            ctx.translateBy(x: 0, y: size.height)
            ctx.scaleBy(x: 1, y: -1)
            let nsCtx = NSGraphicsContext(cgContext: ctx, flipped: true)
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current = nsCtx
            defer { NSGraphicsContext.restoreGraphicsState() }

            // Page background fill (so the panel isn't transparent).
            NSColor.white.setFill()
            NSBezierPath(rect: CGRect(origin: .zero, size: size)).fill()

            do {
                let data = try Data(contentsOf: url)
                pdiag("read \(data.count) bytes")
                switch ext {
                case "tusk":
                    let book = try parseTuskBook(data: data)
                    pdiag("parsed book chapters=\(book.chapters.count)")
                    drawBookPreview(book, size: size)
                case "tusks":
                    let pres = try parseTuskPresentation(data: data)
                    pdiag("parsed pres slides=\(pres.slides.count)")
                    drawPresentationPreview(pres, size: size)
                default:
                    drawBookPreview(TuskBookPreview(name: url.lastPathComponent, color: nil, chapters: []), size: size)
                }
                pdiag("draw closure finished OK")
            } catch {
                pdiag("draw closure ERROR: \(error)")
                drawBookPreview(TuskBookPreview(name: url.lastPathComponent, color: nil, chapters: []), size: size)
            }
        }
        reply.title = url.lastPathComponent
        pdiag("returning reply")
        return reply
    }
}
