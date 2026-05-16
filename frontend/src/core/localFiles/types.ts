// On-disk representations of the three Tusk file types.
// These are the canonical shapes after parse and before serialize — the in-memory
// editor state (Project / PinboardData / etc.) is bridged via the `bridge.ts` module.

export const FILE_FORMAT_VERSION = 1

export type ChapterMode = "default" | "markdown" | "typewriter"

export type TuskChapter = {
  id: string
  title: string
  mode: ChapterMode
  content: string
  children: TuskChapter[]
}

export type TuskBookFile = {
  version: number
  id: string
  cloudId: string | null
  created: string
  name: string
  color: string
  wallpaperEmojis: string
  rootPosition: "top" | "bottom"
  activeChapterId: string | null
  chapters: TuskChapter[]
}

export type TuskPinboardNode =
  | { id: string; type: "text"; x: number; y: number; width: number; height: number; content: string }
  | { id: string; type: "image"; x: number; y: number; width: number; height: number; src: string }
  | { id: string; type: "link"; x: number; y: number; width: number; height: number; url: string; label: string }
  | { id: string; type: "file"; x: number; y: number; width: number; height: number; fileName: string }

export type TuskPinboardLine = {
  id: string
  fromId: string
  toId: string
  color: string
}

export type TuskPinboardFile = {
  version: number
  id: string
  cloudId: string | null
  created: string
  name: string
  color: string
  viewport: { x: number; y: number; zoom: number }
  nodes: TuskPinboardNode[]
  lines: TuskPinboardLine[]
}

export type TuskSlide = {
  id: string
  content: string
}

export type TuskSlideshowFile = {
  version: number
  id: string
  cloudId: string | null
  created: string
  name: string
  color: string
  activeSlideId: string | null
  slides: TuskSlide[]
}

export const TUSK_BOOK_EXT = ".tusk"
export const TUSK_PINBOARD_EXT = ".tuskb"
export const TUSK_SLIDESHOW_EXT = ".tusks"

export type TuskFileKind = "book" | "pinboard" | "slideshow"

export function kindForExtension(ext: string): TuskFileKind | null {
  const lower = ext.toLowerCase()
  if (lower === TUSK_BOOK_EXT) return "book"
  if (lower === TUSK_PINBOARD_EXT) return "pinboard"
  if (lower === TUSK_SLIDESHOW_EXT) return "slideshow"
  return null
}

export function extensionForKind(kind: TuskFileKind): string {
  switch (kind) {
    case "book": return TUSK_BOOK_EXT
    case "pinboard": return TUSK_PINBOARD_EXT
    case "slideshow": return TUSK_SLIDESHOW_EXT
  }
}
