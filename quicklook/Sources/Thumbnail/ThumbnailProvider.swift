// ThumbnailProvider — the QuickLook thumbnail entry point.
//
// macOS calls provideThumbnail(for:) to render the Finder file ICON for a
// .tusk / .tusks document. We read the file, parse it (reusing TuskParser),
// and draw a faithful mini-render into the supplied graphics context via the
// drawing routines in ThumbnailRenderer. Because the UTIs conform to
// public.content, macOS wraps our drawing in the platform document-icon frame.

import QuickLookThumbnailing
import AppKit

@objc(ThumbnailProvider)
final class ThumbnailProvider: QLThumbnailProvider {

    override func provideThumbnail(
        for request: QLFileThumbnailRequest,
        _ handler: @escaping (QLThumbnailReply?, Error?) -> Void
    ) {
        let url = request.fileURL
        let ext = url.pathExtension.lowercased()
        let maxSize = request.maximumSize

        // Pick aspect by type: presentations are landscape (slideshow), books
        // are portrait pages. (.md is left to the system text thumbnailer —
        // macOS gives it precedence for the shared markdown type.)
        let aspect: CGFloat = (ext == "tusks") ? kSlideAspect : kBookAspect
        let size = thumbnailSize(maxSize: maxSize, aspect: aspect)

        // Use the `currentContextDrawing:` variant: QuickLook sets up
        // NSGraphicsContext.current already flipped (top-left origin) and
        // scaled for the device, so our top-down AppKit text layout renders
        // upright and our `size`-point drawing fills the whole canvas. (The
        // CGContext-block variant exposed a pixel-vs-point mismatch that
        // pushed the drawing into a corner.)
        let reply = QLThumbnailReply(contextSize: size) { () -> Bool in
            // The QL current context is correctly point-sized but uses a
            // bottom-left origin and is NOT flipped. Our layout is top-down,
            // and AppKit text orientation follows the NSGraphicsContext
            // `isFlipped` flag (not just the CTM). So: flip the CTM AND wrap
            // the same CGContext in a flipped NSGraphicsContext — that pairing
            // gives both correct positioning (fills the canvas) and upright
            // text.
            guard let cg = NSGraphicsContext.current?.cgContext else { return false }
            cg.translateBy(x: 0, y: size.height)
            cg.scaleBy(x: 1, y: -1)
            let flippedCtx = NSGraphicsContext(cgContext: cg, flipped: true)
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current = flippedCtx
            defer { NSGraphicsContext.restoreGraphicsState() }

            do {
                let data = try Data(contentsOf: url)
                switch ext {
                case "tusk":
                    let book = try parseTuskBook(data: data)
                    drawBookThumbnail(book, size: size)
                case "tusks":
                    let pres = try parseTuskPresentation(data: data)
                    drawPresentationThumbnail(pres, size: size)
                default:
                    drawBookThumbnail(TuskBookPreview(name: url.lastPathComponent, color: nil, chapters: []), size: size)
                }
                return true
            } catch {
                // On parse failure still draw a blank page frame rather than
                // failing — a styled doc icon beats the generic Electron icon.
                drawBookThumbnail(TuskBookPreview(name: url.lastPathComponent, color: nil, chapters: []), size: size)
                return true
            }
        }

        handler(reply, nil)
    }
}
