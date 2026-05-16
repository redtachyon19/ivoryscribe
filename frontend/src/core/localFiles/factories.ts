// Factories for creating fresh files of the non-book types.

import { createId } from "../utils/projects"
import { FILE_FORMAT_VERSION, type TuskPinboardFile, type TuskSlideshowFile } from "./types"

export function createNewPinboardFile(name: string): TuskPinboardFile {
  return {
    version: FILE_FORMAT_VERSION,
    id: createId(),
    cloudId: null,
    created: new Date().toISOString(),
    name,
    color: "#10b981",
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [],
    lines: [],
  }
}

export function createNewSlideshowFile(name: string): TuskSlideshowFile {
  const slideId = createId()
  return {
    version: FILE_FORMAT_VERSION,
    id: createId(),
    cloudId: null,
    created: new Date().toISOString(),
    name,
    color: "#ef4444",
    activeSlideId: slideId,
    slides: [
      { id: slideId, content: "<p></p>" },
    ],
  }
}
