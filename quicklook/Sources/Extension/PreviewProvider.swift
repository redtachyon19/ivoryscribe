// PreviewProvider — the QuickLook entry point.
//
// macOS calls providePreview(for:) when the user spacebar-previews a .tusk or
// .tusks file in Finder (or anywhere else QuickLook is shown). We read the
// file, dispatch by extension to the right parser, render an HTML string, and
// return it as UTF-8 bytes. The QuickLook host renders the HTML in a
// sandboxed WebKit view at the size we ask for.

import Foundation
import QuickLookUI

@objc(PreviewProvider)
final class PreviewProvider: QLPreviewProvider, QLPreviewingController {

    func providePreview(for request: QLFilePreviewRequest) async throws -> QLPreviewReply {
        let url = request.fileURL
        let ext = url.pathExtension.lowercased()

        // We synthesize an HTML string off the main actor; QLPreviewReply
        // hands it back to the QuickLook host as UTF-8 bytes with
        // contentType = .html. The reply closure runs at draw time so the
        // expensive read+parse work lives inside it (not in the actor hop).
        let contentSize = CGSize(width: 820, height: 640)
        let reply = QLPreviewReply(dataOfContentType: .html, contentSize: contentSize) { _ in
            do {
                let data = try Data(contentsOf: url)
                let html: String
                switch ext {
                case "tusk":
                    let book = try parseTuskBook(data: data)
                    html = renderBookHTML(book)
                case "tusks":
                    let pres = try parseTuskPresentation(data: data)
                    html = renderPresentationHTML(pres)
                default:
                    html = renderErrorHTML("Unsupported file type: .\(ext)")
                }
                guard let bytes = html.data(using: .utf8) else {
                    return renderErrorHTML("Couldn't encode preview HTML as UTF-8.").data(using: .utf8) ?? Data()
                }
                return bytes
            } catch {
                let msg = "Could not read or parse the file. (\(error.localizedDescription))"
                return renderErrorHTML(msg).data(using: .utf8) ?? Data()
            }
        }
        // Default page title in the QuickLook chrome — we'll let the host
        // override with the document's <title> from our HTML when available.
        reply.title = url.lastPathComponent
        return reply
    }
}
