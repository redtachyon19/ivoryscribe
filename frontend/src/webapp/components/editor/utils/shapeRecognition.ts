// Freehand-stroke → clean-shape recognition for the pinboard draw tool.
//
// Given the raw points of a freehand stroke, `snapStrokeToShape` guesses the
// intended shape and returns an idealized point list (same `{x, y}` format the
// stroke is stored in). Recognition is heuristic and deliberately forgiving:
//
//   • open stroke (endpoints far apart)  → straight line, with 45°/axis snap
//   • closed stroke, low radial variance → ellipse / circle
//   • closed stroke, 3 corners           → triangle
//   • closed stroke, 4 corners           → axis-aligned rectangle
//   • anything else                      → simplified closed polygon
//
// All math is plain 2D geometry; no dependencies.

export type Point = { x: number; y: number }

const DEG = Math.PI / 180

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function boundingBox(points: Point[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

/** Perpendicular distance from `p` to the line through `a` and `b`. */
function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return distance(p, a)
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len
}

/** Ramer–Douglas–Peucker polyline simplification — keeps the corners that
 *  matter and drops the rest, so we can count vertices. */
function simplify(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points.slice()
  let maxDist = 0
  let index = 0
  const first = points[0]
  const last = points[points.length - 1]
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last)
    if (d > maxDist) {
      maxDist = d
      index = i
    }
  }
  if (maxDist > epsilon) {
    const left = simplify(points.slice(0, index + 1), epsilon)
    const right = simplify(points.slice(index), epsilon)
    return left.slice(0, -1).concat(right)
  }
  return [first, last]
}

/** Snap a near-axis / near-diagonal segment to the closest 45° increment. */
function snapLine(start: Point, end: Point): Point[] {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const len = Math.hypot(dx, dy)
  if (len < 1) return [start, end]
  let angle = Math.atan2(dy, dx)
  const step = Math.PI / 4
  const nearest = Math.round(angle / step) * step
  if (Math.abs(angle - nearest) < 8 * DEG) angle = nearest
  return [start, { x: start.x + Math.cos(angle) * len, y: start.y + Math.sin(angle) * len }]
}

function ellipsePoints(cx: number, cy: number, rx: number, ry: number, segments = 48): Point[] {
  const out: Point[] = []
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2
    out.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) })
  }
  return out
}

/** Do the stroke's points hug the bounding-box ellipse? For a boundary point,
 *  ((x-cx)/rx)² + ((y-cy)/ry)² ≈ 1. Low spread around 1 ⇒ an ellipse/circle. */
function looksLikeEllipse(points: Point[], cx: number, cy: number, rx: number, ry: number): boolean {
  if (rx < 1 || ry < 1) return false
  let sum = 0
  let sumSq = 0
  for (const p of points) {
    const v = ((p.x - cx) / rx) ** 2 + ((p.y - cy) / ry) ** 2
    sum += v
    sumSq += v * v
  }
  const n = points.length
  const mean = sum / n
  const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean))
  // A true ellipse hugs the boundary (v ≈ 1 everywhere). A rectangle's
  // perimeter pushes the mean toward ~1.3 with higher spread (corners reach
  // v ≈ 2), so keep the thresholds tight to avoid swallowing quads.
  return Math.abs(mean - 1) < 0.2 && std < 0.2
}

/**
 * Recognize the shape a freehand stroke was meant to be and return idealized
 * points. Falls back to the original points when there's too little to work
 * with or no confident match.
 */
export function snapStrokeToShape(points: Point[]): Point[] {
  if (points.length < 4) return points

  const box = boundingBox(points)
  const diagonal = Math.hypot(box.width, box.height)
  if (diagonal < 8) return points // too small / a dot — leave it alone

  const start = points[0]
  const end = points[points.length - 1]
  const isClosed = distance(start, end) < diagonal * 0.3

  if (!isClosed) {
    return snapLine(start, end)
  }

  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2

  // Count corners on the closed path first — a clean triangle/quad is decided
  // by its corner count, not by the (looser) ellipse fit.
  const epsilon = Math.max(diagonal * 0.07, 4)
  let corners = simplify(points, epsilon)
  // Drop the trailing near-duplicate of the start that closed paths produce.
  if (corners.length > 1 && distance(corners[0], corners[corners.length - 1]) < epsilon) {
    corners = corners.slice(0, -1)
  }

  if (corners.length === 3) {
    return [...corners, corners[0]]
  }

  if (corners.length === 4) {
    // Snap to the axis-aligned bounding rectangle.
    return [
      { x: box.minX, y: box.minY },
      { x: box.maxX, y: box.minY },
      { x: box.maxX, y: box.maxY },
      { x: box.minX, y: box.maxY },
      { x: box.minX, y: box.minY },
    ]
  }

  // Rounder strokes (many corners) → ellipse / circle when they hug the box.
  if (looksLikeEllipse(points, cx, cy, box.width / 2, box.height / 2)) {
    return ellipsePoints(cx, cy, box.width / 2, box.height / 2)
  }

  // Fallback: a cleaned closed polygon from the detected corners.
  if (corners.length >= 3) return [...corners, corners[0]]
  return points
}
