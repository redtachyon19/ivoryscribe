export const EDITOR_FONT_SIZE_CHANGE_EVENT = "editor:font-size-change"
export const EDITOR_FONT_SIZE_SET_EVENT = "editor:font-size-set"
export const EDITOR_FONT_FAMILY_CHANGE_EVENT = "editor:font-family-change"
export const EDITOR_COMMAND_EVENT = "editor:command"
export const MARKDOWN_EDITOR_COMMAND_EVENT = "markdown-editor:command"
export const APP_COLOR_PALETTE_CHANGE_EVENT = "app:color-palette-change"
export const EXPORT_ALL_TABS_PDF_EVENT = "app:export-all-tabs-pdf"
export const APP_EXPORT_PROJECT_EVENT = "app:export-project"
export const APP_SPELL_CHECK_EVENT = "app:spell-check"
export const APP_SPELL_CHECK_FOCUS_EVENT = "app:spell-check-focus"
export const APP_PROJECT_SEARCH_EVENT = "app:project-search"
export const APP_PROJECT_SEARCH_FOCUS_EVENT = "app:project-search-focus"
export const APP_SAVE_PROJECT_EVENT = "app:save-project"
export const APP_SAVE_PROJECT_VERSION_EVENT = "app:save-project-version"
export const PROJECTS_CREATE_BOOK_EVENT = "projects:create-book"
export const PROJECTS_CREATE_FOLDER_EVENT = "projects:create-folder"

export type EditorCommand =
  | "undo"
  | "redo"
  | "copy"
  | "paste"
  | "cut"
  | "bold"
  | "italic"
  | "underline"
  | "select-all"
  | "delete"

export type MarkdownEditorCommand =
  | "heading-1"
  | "heading-2"
  | "bold"
  | "italic"
  | "inline-code"
  | "code-block"
  | "link"

export type ExportProjectFormat = "pdf" | "docx" | "md" | "txt"

export type SpellCheckFocusDetail =
  | {
    documentId: string
    documentType: "text"
    normalizedWord: string
    occurrenceIndex: number
  }
  | {
    documentId: string
    documentType: "markdown"
    normalizedWord: string
    occurrenceIndex: number
    start: number
    end: number
  }

export type ProjectSearchFocusDetail =
  | {
    documentId: string
    documentType: "text"
    query: string
    occurrenceIndex: number
  }
  | {
    documentId: string
    documentType: "markdown"
    query: string
    occurrenceIndex: number
    start: number
    end: number
  }

type FontSizeChangeDetail = {
  delta: number
}

type FontSizeSetDetail = {
  value: number
}

type FontFamilyChangeDetail = {
  fontFamily: string
}

type ColorPaletteChangeDetail = {
  palette: string
}

type EditorCommandDetail = {
  command: EditorCommand
}

type MarkdownEditorCommandDetail = {
  command: MarkdownEditorCommand
}

type ExportProjectDetail = {
  format: ExportProjectFormat
}

export function requestEditorFontSizeChange(delta: number) {
  const event = new CustomEvent<FontSizeChangeDetail>(EDITOR_FONT_SIZE_CHANGE_EVENT, {
    detail: { delta },
  })

  window.dispatchEvent(event)
}

export function requestEditorFontSizeSet(value: number) {
  const event = new CustomEvent<FontSizeSetDetail>(EDITOR_FONT_SIZE_SET_EVENT, {
    detail: { value },
  })

  window.dispatchEvent(event)
}

export function requestEditorFontFamilyChange(fontFamily: string) {
  const event = new CustomEvent<FontFamilyChangeDetail>(EDITOR_FONT_FAMILY_CHANGE_EVENT, {
    detail: { fontFamily },
  })

  window.dispatchEvent(event)
}

export function requestAppColorPaletteChange(palette: string) {
  const event = new CustomEvent<ColorPaletteChangeDetail>(APP_COLOR_PALETTE_CHANGE_EVENT, {
    detail: { palette },
  })

  window.dispatchEvent(event)
}

export function requestEditorCommand(command: EditorCommand) {
  const event = new CustomEvent<EditorCommandDetail>(EDITOR_COMMAND_EVENT, {
    detail: { command },
  })

  window.dispatchEvent(event)
}

export function requestMarkdownEditorCommand(command: MarkdownEditorCommand) {
  const event = new CustomEvent<MarkdownEditorCommandDetail>(MARKDOWN_EDITOR_COMMAND_EVENT, {
    detail: { command },
  })

  window.dispatchEvent(event)
}

export function requestExportProject(format: ExportProjectFormat) {
  const event = new CustomEvent<ExportProjectDetail>(APP_EXPORT_PROJECT_EVENT, {
    detail: { format },
  })

  window.dispatchEvent(event)
}

export function requestExportAllTabsPdf() {
  requestExportProject("pdf")
}

export function requestAppSpellCheck() {
  window.dispatchEvent(new Event(APP_SPELL_CHECK_EVENT))
}

export function requestAppProjectSearch() {
  window.dispatchEvent(new Event(APP_PROJECT_SEARCH_EVENT))
}

export function requestAppSpellCheckFocus(detail: SpellCheckFocusDetail) {
  const event = new CustomEvent<SpellCheckFocusDetail>(APP_SPELL_CHECK_FOCUS_EVENT, {
    detail,
  })

  window.dispatchEvent(event)
}

export function requestAppProjectSearchFocus(detail: ProjectSearchFocusDetail) {
  const event = new CustomEvent<ProjectSearchFocusDetail>(APP_PROJECT_SEARCH_FOCUS_EVENT, {
    detail,
  })

  window.dispatchEvent(event)
}

export function requestAppSaveProject() {
  window.dispatchEvent(new Event(APP_SAVE_PROJECT_EVENT))
}

export function requestAppSaveProjectVersion() {
  window.dispatchEvent(new Event(APP_SAVE_PROJECT_VERSION_EVENT))
}

export function requestCreateBookProject() {
  window.dispatchEvent(new Event(PROJECTS_CREATE_BOOK_EVENT))
}

export function requestCreateProjectFolder() {
  window.dispatchEvent(new Event(PROJECTS_CREATE_FOLDER_EVENT))
}
