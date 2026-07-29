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

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return distance(p, a)
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len
}

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
  return Math.abs(mean - 1) < 0.2 && std < 0.2
}

export function snapStrokeToShape(points: Point[]): Point[] {
  if (points.length < 4) return points

  const box = boundingBox(points)
  const diagonal = Math.hypot(box.width, box.height)
  if (diagonal < 8) return points

  const start = points[0]
  const end = points[points.length - 1]
  const isClosed = distance(start, end) < diagonal * 0.3

  if (!isClosed) {
    return snapLine(start, end)
  }

  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2

  const epsilon = Math.max(diagonal * 0.07, 4)
  let corners = simplify(points, epsilon)
  if (corners.length > 1 && distance(corners[0], corners[corners.length - 1]) < epsilon) {
    corners = corners.slice(0, -1)
  }

  if (corners.length === 3) {
    return [...corners, corners[0]]
  }

  if (corners.length === 4) {
    return [
      { x: box.minX, y: box.minY },
      { x: box.maxX, y: box.minY },
      { x: box.maxX, y: box.maxY },
      { x: box.minX, y: box.maxY },
      { x: box.minX, y: box.minY },
    ]
  }

  if (looksLikeEllipse(points, cx, cy, box.width / 2, box.height / 2)) {
    return ellipsePoints(cx, cy, box.width / 2, box.height / 2)
  }

  if (corners.length >= 3) return [...corners, corners[0]]
  return points
}
