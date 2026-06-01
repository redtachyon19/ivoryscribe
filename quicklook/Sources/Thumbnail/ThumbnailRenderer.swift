// ThumbnailRenderer — draws the Finder file-icon mini-render for .tusk /
// .tusks documents using AppKit into a flipped graphics context.
//
// Why drawing (not HTML): Finder file icons come from the QuickLook
// *thumbnail* extension point, which hands us a CGContext to draw into — there
// is no WebView. So this is real Core Graphics / AppKit text + shape drawing,
// separate from the HTML PreviewProvider.
//
// Layout per type:
//   .tusk  → a portrait "page" (document-template look: white sheet, folded
//            corner, accent header) with the chapter title + real body text
//            laid out as lines — i.e. the typewriter/prose view in miniature.
//   .tusks → a LANDSCAPE sheet with a horizontal row of slide cards (it's a
//            slideshow), each card showing its slide title.

import AppKit

// ── Color helpers ────────────────────────────────────────────────────────

private func colorFromHex(_ hex: String?, fallback: NSColor) -> NSColor {
    guard var s = hex?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty else {
        return fallback
    }
    if s.hasPrefix("#") { s.removeFirst() }
    guard s.count == 6, let v = UInt32(s, radix: 16) else { return fallback }
    let r = CGFloat((v >> 16) & 0xff) / 255.0
    let g = CGFloat((v >> 8) & 0xff) / 255.0
    let b = CGFloat(v & 0xff) / 255.0
    return NSColor(srgbRed: r, green: g, blue: b, alpha: 1.0)
}

private let pageColor = NSColor(srgbRed: 0.99, green: 0.985, blue: 0.975, alpha: 1.0)
private let inkColor = NSColor(srgbRed: 0.12, green: 0.12, blue: 0.13, alpha: 1.0)
private let mutedInk = NSColor(srgbRed: 0.12, green: 0.12, blue: 0.13, alpha: 0.62)
private let defaultAccent = NSColor(srgbRed: 0.49, green: 0.66, blue: 1.0, alpha: 1.0)

// ── Aspect ratios ──────────────────────────────────────────────────────────
// Portrait sheet for books (US-letter-ish); landscape 16:10 for presentations.
let kBookAspect: CGFloat = 8.5 / 11.0
let kSlideAspect: CGFloat = 16.0 / 10.0

/// Fit a content rect of the given aspect (w/h) inside `maxSize`, returning the
/// pixel size the thumbnail context should be.
func thumbnailSize(maxSize: CGSize, aspect: CGFloat) -> CGSize {
    let maxW = max(16, maxSize.width)
    let maxH = max(16, maxSize.height)
    // aspect = width / height
    var w = maxW
    var h = w / aspect
    if h > maxH {
        h = maxH
        w = h * aspect
    }
    return CGSize(width: floor(w), height: floor(h))
}

// ── Shared drawing primitives ────────────────────────────────────────────

private func drawSheet(in rect: CGRect, cornerFold: CGFloat) {
    // Drop shadow for the document-card look.
    let shadow = NSShadow()
    shadow.shadowColor = NSColor.black.withAlphaComponent(0.22)
    shadow.shadowBlurRadius = rect.width * 0.03
    shadow.shadowOffset = NSSize(width: 0, height: -rect.width * 0.012)
    NSGraphicsContext.saveGraphicsState()
    shadow.set()

    let path = NSBezierPath()
    let r = rect
    let f = cornerFold
    // Page outline with a folded TOP-right corner. The drawing context is
    // flipped (top-left origin), so the visual top edge is r.minY.
    path.move(to: CGPoint(x: r.minX, y: r.minY))           // top-left
    path.line(to: CGPoint(x: r.maxX - f, y: r.minY))       // top edge → fold start
    path.line(to: CGPoint(x: r.maxX, y: r.minY + f))       // diagonal of the fold
    path.line(to: CGPoint(x: r.maxX, y: r.maxY))           // down right edge
    path.line(to: CGPoint(x: r.minX, y: r.maxY))           // bottom edge
    path.close()
    pageColor.setFill()
    path.fill()
    NSGraphicsContext.restoreGraphicsState()

    // The folded corner triangle (slightly darker), at the top-right.
    let fold = NSBezierPath()
    fold.move(to: CGPoint(x: r.maxX - f, y: r.minY))
    fold.line(to: CGPoint(x: r.maxX - f, y: r.minY + f))
    fold.line(to: CGPoint(x: r.maxX, y: r.minY + f))
    fold.close()
    NSColor(srgbRed: 0.85, green: 0.85, blue: 0.83, alpha: 1.0).setFill()
    fold.fill()
}

/// Draw wrapped text lines within `rect`, top-down (context is flipped).
/// Returns nothing; clips to rect.
private func drawText(_ text: String, in rect: CGRect, font: NSFont, color: NSColor, lineSpacing: CGFloat = 1.18, maxLines: Int = 999) {
    let style = NSMutableParagraphStyle()
    style.lineBreakMode = .byWordWrapping
    style.lineSpacing = font.pointSize * (lineSpacing - 1.0)
    let attrs: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: color,
        .paragraphStyle: style,
    ]
    NSGraphicsContext.saveGraphicsState()
    NSBezierPath(rect: rect).addClip()
    let truncated = String(text.prefix(1200))
    (truncated as NSString).draw(in: rect, withAttributes: attrs)
    NSGraphicsContext.restoreGraphicsState()
}

// ── Book (.tusk) ───────────────────────────────────────────────────────────

func drawBookThumbnail(_ book: TuskBookPreview, size: CGSize) {
    let accent = colorFromHex(book.color, fallback: defaultAccent)
    let pad = size.width * 0.07
    let sheet = CGRect(x: pad, y: pad, width: size.width - pad * 2, height: size.height - pad * 2)
    let fold = sheet.width * 0.14
    drawSheet(in: sheet, cornerFold: fold)

    // Accent header bar.
    let barH = sheet.height * 0.055
    let bar = CGRect(x: sheet.minX, y: sheet.minY, width: sheet.width, height: barH)
    accent.setFill()
    NSBezierPath(rect: bar).fill()

    let inner = sheet.insetBy(dx: sheet.width * 0.1, dy: sheet.height * 0.09)
    var cursorY = inner.minY + barH

    // Title (first chapter title, or project name).
    let title = book.chapters.first?.title ?? book.name
    let titleFont = NSFont.boldSystemFont(ofSize: max(7, size.height * 0.052))
    let titleRect = CGRect(x: inner.minX, y: cursorY, width: inner.width, height: titleFont.pointSize * 2.4)
    drawText(title, in: titleRect, font: titleFont, color: inkColor, maxLines: 2)
    cursorY += titleRect.height + inner.height * 0.02

    // Body text — the real prose, mini typewriter view.
    let body = (book.chapters.first?.body ?? "")
        .replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
        .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        .trimmingCharacters(in: .whitespacesAndNewlines)
    let bodyFont = NSFont.systemFont(ofSize: max(5.5, size.height * 0.034))
    let bodyRect = CGRect(x: inner.minX, y: cursorY, width: inner.width, height: inner.maxY - cursorY)
    let bodyText = body.isEmpty ? "Empty document." : body
    drawText(bodyText, in: bodyRect, font: bodyFont, color: body.isEmpty ? mutedInk : inkColor)
}

// ── Presentation (.tusks) ────────────────────────────────────────────────

func drawPresentationThumbnail(_ pres: TuskPresentationPreview, size: CGSize) {
    let accent = colorFromHex(pres.color, fallback: defaultAccent)
    let pad = size.width * 0.045
    let sheet = CGRect(x: pad, y: pad, width: size.width - pad * 2, height: size.height - pad * 2)
    drawSheet(in: sheet, cornerFold: sheet.height * 0.12)

    // Accent header bar with project name.
    let barH = sheet.height * 0.16
    let bar = CGRect(x: sheet.minX, y: sheet.minY, width: sheet.width, height: barH)
    accent.setFill()
    NSBezierPath(rect: bar).fill()
    let nameFont = NSFont.boldSystemFont(ofSize: max(7, size.height * 0.085))
    drawText(pres.name, in: bar.insetBy(dx: sheet.width * 0.03, dy: barH * 0.22),
             font: nameFont, color: .white, maxLines: 1)

    // Horizontal row of slide cards (it's a slideshow → lay them out across).
    let area = CGRect(x: sheet.minX + sheet.width * 0.04,
                      y: sheet.minY + barH + sheet.height * 0.06,
                      width: sheet.width * 0.92,
                      height: sheet.height - barH - sheet.height * 0.12)
    let slides = Array(pres.slides.prefix(3))
    let count = max(1, slides.count)
    let gap = area.width * 0.04
    let cardW = (area.width - gap * CGFloat(count - 1)) / CGFloat(count)
    let cardH = min(area.height, cardW / kSlideAspect)
    let cardY = area.minY + (area.height - cardH) / 2

    for (i, slide) in slides.enumerated() {
        let cardX = area.minX + CGFloat(i) * (cardW + gap)
        let card = CGRect(x: cardX, y: cardY, width: cardW, height: cardH)
        // Slide background.
        NSColor.white.setFill()
        let cardPath = NSBezierPath(roundedRect: card, xRadius: cardW * 0.04, yRadius: cardW * 0.04)
        cardPath.fill()
        accent.withAlphaComponent(0.5).setStroke()
        cardPath.lineWidth = max(0.5, size.width * 0.004)
        cardPath.stroke()
        // Slide title.
        let titleFont = NSFont.systemFont(ofSize: max(5, cardH * 0.16))
        drawText(slide.title, in: card.insetBy(dx: cardW * 0.08, dy: cardH * 0.1),
                 font: titleFont, color: inkColor, maxLines: 3)
    }

    if slides.isEmpty {
        let f = NSFont.systemFont(ofSize: max(6, size.height * 0.06))
        drawText("No slides yet.", in: area, font: f, color: mutedInk, maxLines: 1)
    }
}

// ── Full-size PREVIEW renders (Spacebar panel) ─────────────────────────────
//
// Larger, multi-entry versions of the thumbnail draws. Used by the Spacebar
// preview (PreviewProvider) which now draws instead of returning HTML.

private func stripHTML(_ s: String) -> String {
    s.replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression)
     .replacingOccurrences(of: "&nbsp;", with: " ")
     .replacingOccurrences(of: "&amp;", with: "&")
     .replacingOccurrences(of: "&lt;", with: "<")
     .replacingOccurrences(of: "&gt;", with: ">")
     .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
     .trimmingCharacters(in: .whitespacesAndNewlines)
}

func drawBookPreview(_ book: TuskBookPreview, size: CGSize) {
    let accent = colorFromHex(book.color, fallback: defaultAccent)
    let margin = size.width * 0.09

    // Document title header.
    var y = margin
    let titleFont = NSFont.boldSystemFont(ofSize: 30)
    let titleRect = CGRect(x: margin, y: y, width: size.width - margin * 2, height: 40)
    drawText(book.name, in: titleRect, font: titleFont, color: inkColor, maxLines: 1)
    y += 40

    // Accent rule + chapter count meta.
    let rule = CGRect(x: margin, y: y, width: size.width - margin * 2, height: 2)
    accent.setFill(); NSBezierPath(rect: rule).fill()
    y += 10
    let meta = book.chapters.count == 1 ? "1 chapter" : "\(book.chapters.count) chapters"
    let metaRect = CGRect(x: margin, y: y, width: size.width - margin * 2, height: 18)
    drawText(meta.uppercased(), in: metaRect, font: NSFont.systemFont(ofSize: 11), color: mutedInk, maxLines: 1)
    y += 26

    if book.chapters.isEmpty {
        drawText("Empty document.", in: CGRect(x: margin, y: y, width: size.width - margin * 2, height: 30),
                 font: NSFont.systemFont(ofSize: 14), color: mutedInk, maxLines: 1)
        return
    }

    let chTitleFont = NSFont.boldSystemFont(ofSize: 16)
    let bodyFont = NSFont.systemFont(ofSize: 13)
    for chapter in book.chapters.prefix(8) {
        if y > size.height - margin { break }
        let ctRect = CGRect(x: margin, y: y, width: size.width - margin * 2, height: 22)
        drawText(chapter.title, in: ctRect, font: chTitleFont, color: inkColor, maxLines: 1)
        y += 24
        let body = stripHTML(chapter.body)
        if !body.isEmpty {
            let avail = size.height - margin - y
            let h = min(72, max(0, avail))
            if h < 16 { break }
            drawText(body, in: CGRect(x: margin, y: y, width: size.width - margin * 2, height: h),
                     font: bodyFont, color: NSColor(srgbRed: 0.25, green: 0.25, blue: 0.27, alpha: 1), maxLines: 4)
            y += h + 12
        } else {
            y += 8
        }
    }
}

func drawPresentationPreview(_ pres: TuskPresentationPreview, size: CGSize) {
    let accent = colorFromHex(pres.color, fallback: defaultAccent)
    let margin = size.width * 0.06

    // Title bar.
    let barH: CGFloat = 64
    accent.setFill()
    NSBezierPath(rect: CGRect(x: 0, y: 0, width: size.width, height: barH)).fill()
    drawText(pres.name, in: CGRect(x: margin, y: 18, width: size.width - margin * 2, height: 32),
             font: NSFont.boldSystemFont(ofSize: 24), color: .white, maxLines: 1)

    // Grid of slide cards.
    let slides = Array(pres.slides.prefix(12))
    if slides.isEmpty {
        drawText("No slides yet.", in: CGRect(x: margin, y: barH + 30, width: size.width - margin * 2, height: 30),
                 font: NSFont.systemFont(ofSize: 16), color: mutedInk, maxLines: 1)
        return
    }
    let cols = 3
    let gap: CGFloat = 18
    let areaX = margin
    let areaY = barH + 28
    let areaW = size.width - margin * 2
    let cardW = (areaW - gap * CGFloat(cols - 1)) / CGFloat(cols)
    let cardH = cardW / kSlideAspect
    for (i, slide) in slides.enumerated() {
        let col = i % cols, row = i / cols
        let x = areaX + CGFloat(col) * (cardW + gap)
        let yy = areaY + CGFloat(row) * (cardH + gap + 8)
        if yy + cardH > size.height - margin { break }
        let card = CGRect(x: x, y: yy, width: cardW, height: cardH)
        NSColor.white.setFill()
        let p = NSBezierPath(roundedRect: card, xRadius: 6, yRadius: 6)
        p.fill(); accent.withAlphaComponent(0.5).setStroke(); p.lineWidth = 1; p.stroke()
        drawText(slide.title, in: card.insetBy(dx: 10, dy: 10),
                 font: NSFont.systemFont(ofSize: 12), color: inkColor, maxLines: 3)
    }
}
