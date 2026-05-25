// Factories for creating fresh files of the non-book types.
//
// The Book factory lives in `bridge.ts` next to its bridge functions; the
// Presentation factory does too (`createNewPresentationFile`). Standalone
// .md / .txt files need no factory — an empty string written via
// `serializePlainDocFile` is the correct empty document.

export { createNewPresentationFile } from "./bridge"
