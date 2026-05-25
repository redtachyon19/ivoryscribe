// Public surface of the local-file data layer (no UI, just codec + sync).

export * from "./types"
export { serializeTuskBook, parseTuskBook } from "./codecBook"
export { serializeTuskPresentation, parseTuskPresentation } from "./codecPresentation"
export { parsePlainDocFile, serializePlainDocFile } from "./codecPlainDoc"
export {
  bookFileToProject,
  projectToBookFile,
  createNewBookFile,
  presentationFileToProject,
  projectToPresentationFile,
  createNewPresentationFile,
  plainDocFileToProject,
  projectToPlainDocString,
  pdfFileToProject,
} from "./bridge"
export { useLocalFilesystemSync } from "./useLocalFilesystemSync"
