# IvoryScribe — File-Type Overhaul Implementation Plan

**Status:** spec / not yet implemented
**Author:** prepared for Red
**Scope:** restructure the project/file model around two `.tusk*` types plus standalone `.md`/`.txt`.

> Read this whole document before touching any code. It is ordered so that the
> app keeps compiling after every phase. Do the phases in order. Every file path
> is relative to the repo root; line numbers are accurate as of the audited
> commit (`e4baa67`) but **re-confirm them before editing** — they will drift as
> you work.

---

## 0. The target model (what we are building)

After this overhaul the application reads and writes **exactly four** file types and **nothing else**:

| Extension | Project kind | Tab list label | What a tab is | Editor per tab |
|-----------|-------------|----------------|---------------|----------------|
| `.tusk`   | Book         | **Chapters**   | a chapter, an embedded markdown doc, or an embedded plain-text doc | Drafting / Typewriter / Markdown / PlainText |
| `.tusks`  | Presentation | **Slides**     | a pinboard | Pinboard |
| `.md`     | Markdown     | *(none — no tab list)* | the whole file | Markdown |
| `.txt`    | PlainText    | *(none — no tab list)* | the whole file | PlainText |

Hard rules:

1. **A `.tusk` book contains only chapters, markdown docs, and plain-text docs. Never a pinboard.**
2. **A `.tusks` presentation contains only pinboards (one per slide). Nothing else.**
3. **`.md` and `.txt` are standalone, single-document, top-level Library items with no tab list.**
4. The workspace scanner ignores every other extension. The legacy `.tuskb` extension and the old text-slideshow format are **deleted outright — no migration code** (greenfield, per decision).

Decisions already locked (do not re-litigate):

- Inside a book, the "Create More" button creates a `.md` or `.txt` document **embedded in the `.tusk` file**; it appears **in the Chapters tab list** as another tab.
- A `.tusks` presentation holds **many** pinboards; **each pinboard is one slide** in the Slides tab list.
- Standalone `.md`/`.txt` files **are** top-level Library items and can be created from the Library.
- No migration: old `.tuskb` files and old text `.tusks` files simply will not load. That is acceptable.

---

## 1. Current architecture you are changing

Read these facts carefully — several are non-obvious and getting them wrong will break data.

- **`ProjectKind` is currently a single-member union:** `type ProjectKind = "Book"` (`frontend/src/core/utils/projects.ts:8`). Everything in memory is a "Book" today.
- **A `Project` is a tab tree.** `Project.tabs` is a recursive `DocumentTab[]`; `Project.contentById` maps tab id → content string; the *mode* of each tab is tracked by three **parallel id arrays** on the project: `markdownIds`, `typewriterIds`, `pinboardIds` (`projects.ts:15-17`).
- **Editor selection is driven by `activeDocumentType`** computed in `frontend/src/webapp/pages/Editor.tsx:154-164`: if the active tab id is in `pinboardIds` → `"pinboard"`; else if in the markdown id set → `"markdown"`; else `"prose"`. `EditorWorkspace.tsx:134-236` is a ternary chain that renders `PinboardEditor` / `TypewriterEditor` / `MarkdownEditor` / `DraftingEditor` from that value (typewriter-vs-drafting is a separate per-tab view-mode, not part of `activeDocumentType`).
- **On disk today there are three codecs:** `.tusk` = book (`codecBook.ts`), `.tuskb` = pinboard (`codecPinboard.ts`), `.tusks` = slideshow of HTML text slides (`codecSlideshow.ts`). `kindForExtension` / `extensionForKind` in `core/localFiles/types.ts:77-91` map all three.
- **The on-disk book stores a per-chapter `mode` attribute**, `ChapterMode = "default" | "markdown" | "typewriter"` (`types.ts:7`). `bridge.ts` translates between that `mode` attribute and the in-memory parallel id arrays.
- **⚠️ The filesystem-sync write path is completely kind-blind.** `core/localFiles/useLocalFilesystemSync.ts` always serializes via `projectToBookFile` + `serializeTuskBook` and always writes a `.tusk` extension — `createOnDisk` (lines ~308-309) and `writeProjectToDisk` (lines ~483-484). A `.tuskb`/`.tusks` opened today is **silently rewritten as `.tusk` on the next autosave.** Fixing this is the single most important part of the overhaul (Phase 4).
- **Pinboard content is an opaque string.** `PinboardEditor` receives `content: string` and emits `onContentChange(nextContent: string)`. It owns its own (de)serialization via `core/.../editor/utils/pinboardData.ts`. The board for a tab lives in `contentById[tabId]` as that string. **The codec never needs to understand pinboard internals** — it stores the string verbatim.
- **The pinboard editor stack stays.** `PinboardEditor.tsx`, `PinboardToolbar.tsx`, `PinboardNode.tsx`, `usePinboardGestures.ts`, `pinboardData.ts` are all kept — they become the per-slide editor for presentations. Only the *standalone-pinboard-file* concept goes away.
- **`getProjectEntryTerms(kind)`** (`projects.ts:43-49`) is the single source of truth for the entry noun ("Chapter"/"Chapters"). It is an exhaustive `Record<ProjectKind, …>`, so widening `ProjectKind` produces a **compile error until you add the new entries** — that is a feature, lean on it.
- **Project icons never branch on kind.** `BookText` (Lucide) is hard-coded at four sites: `ProjectCard.tsx:287`, `ProjectBrowserPanel.tsx:379`, `AppShell.tsx:577`, `WebMenu.tsx:24`.

---

## 2. Target data model

### 2.1 In-memory types (`core/utils/projects.ts`)

```ts
export type ProjectKind = "Book" | "Presentation" | "Markdown" | "PlainText"
```

Add one parallel id array to `Project` alongside the existing three:

```ts
export type Project = {
  // …unchanged…
  markdownIds?: string[]
  typewriterIds?: string[]
  pinboardIds?: string[]
  plaintextIds?: string[]   // NEW — tab ids rendered as plain-text (.txt)
  // …unchanged…
}
```

Per-kind id-array meaning after the overhaul:

| Kind | `tabs` | which id arrays are populated |
|------|--------|-------------------------------|
| Book | chapters + md + txt tabs (nesting allowed) | `markdownIds`, `typewriterIds`, `plaintextIds` for the relevant tabs; `pinboardIds` always empty |
| Presentation | one tab per slide (flat, no nesting) | `pinboardIds` = **every** tab id |
| Markdown | exactly one synthetic tab | `markdownIds` = `[thatTabId]` |
| PlainText | exactly one synthetic tab | `plaintextIds` = `[thatTabId]` |

> **Why a synthetic tab for `.md`/`.txt`?** Almost every consumer (`Editor.tsx` `activeDocumentType`/`activeContent`, `useTabViewMode`, `useFindReplaceModal`, `EditorWorkspace`) assumes `project.activeId` points at a real tab in `project.tabs`. Keeping exactly one tab means **zero null-guard rewrites**. We only *hide the tab-list UI*, we do not remove the tab.

Add a helper, exported from `projects.ts`:

```ts
export function isSingleDocumentKind(kind: ProjectKind): boolean {
  return kind === "Markdown" || kind === "PlainText"
}
```

### 2.2 On-disk types (`core/localFiles/types.ts`)

```ts
export type ChapterMode = "default" | "markdown" | "typewriter" | "plaintext"  // + plaintext

// Presentation file (.tusks) — replaces TuskSlideshowFile entirely.
export type TuskSlide = {
  id: string
  title: string          // NEW — used as the tab/slide label
  board: string          // opaque PinboardEditor content string
}
export type TuskPresentationFile = {
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
export const TUSK_PRESENTATION_EXT = ".tusks"
export const MARKDOWN_EXT = ".md"
export const PLAINTEXT_EXT = ".txt"

export type TuskFileKind = "book" | "presentation" | "markdown" | "plaintext"
```

**Delete** from `types.ts`: `TuskPinboardNode`, `TuskPinboardLine`, `TuskPinboardFile`, the old `TuskSlide`/`TuskSlideshowFile` (replaced above), and `TUSK_PINBOARD_EXT`.

`kindForExtension` / `extensionForKind` updated:

```ts
export function kindForExtension(ext: string): TuskFileKind | null {
  switch (ext.toLowerCase()) {
    case TUSK_BOOK_EXT: return "book"
    case TUSK_PRESENTATION_EXT: return "presentation"
    case MARKDOWN_EXT: return "markdown"
    case PLAINTEXT_EXT: return "plaintext"
    default: return null
  }
}
export function extensionForKind(kind: TuskFileKind): string {
  switch (kind) {
    case "book": return TUSK_BOOK_EXT
    case "presentation": return TUSK_PRESENTATION_EXT
    case "markdown": return MARKDOWN_EXT
    case "plaintext": return PLAINTEXT_EXT
  }
}
```

Add the kind mapping (in-memory ↔ on-disk), put it in `types.ts`:

```ts
import type { ProjectKind } from "../utils/projects"
export function projectKindForFileKind(k: TuskFileKind): ProjectKind {
  return { book: "Book", presentation: "Presentation", markdown: "Markdown", plaintext: "PlainText" }[k]
}
export function fileKindForProjectKind(k: ProjectKind): TuskFileKind {
  return { Book: "book", Presentation: "presentation", Markdown: "markdown", PlainText: "plaintext" }[k]
}
```

### 2.3 New `.tusks` (presentation) on-disk schema

```xml
<?xml version="1.0" encoding="UTF-8"?>
<tusks version="1" id="…" cloud-id="" created="…" color="…">
  <name>My Deck</name>
  <active-slide-id>s1</active-slide-id>
  <slides>
    <slide id="s1" title="Slide 1">
      <board><![CDATA[ …opaque PinboardEditor content string… ]]></board>
    </slide>
  </slides>
</tusks>
```

This is structurally the **same** as the current `codecSlideshow.ts` schema with two changes: `<content>` becomes `<board>`, and `<slide>` gains a `title` attribute. The codec never parses the board payload — it stores/loads the string verbatim. (`.tusk` and `.md`/`.txt` schemas are unchanged / trivial — see Phase 2.)

---

## 3. Phased implementation

Each phase ends with the project compiling. Do not skip ahead.

### Phase 1 — Types & kind model

1. **`core/utils/projects.ts`**
   - Line 8: widen `ProjectKind` to the 4-member union.
   - Lines 43-45: `ENTRY_TERMS_BY_KIND` will now be a **compile error** (missing keys). Add all four:
     ```ts
     const ENTRY_TERMS_BY_KIND: Record<ProjectKind, ProjectEntryTerms> = {
       Book:         { singular: "Chapter", plural: "Chapters", untitled: "Untitled Chapter" },
       Presentation: { singular: "Slide",   plural: "Slides",   untitled: "Untitled Slide" },
       Markdown:     { singular: "Document", plural: "Documents", untitled: "Untitled Document" },
       PlainText:    { singular: "Document", plural: "Documents", untitled: "Untitled Document" },
     }
     ```
   - Add `plaintextIds?: string[]` to the `Project` type (line ~17).
   - Add `isSingleDocumentKind` (see §2.1).
   - `createInitialTabs(kind)` (lines 63-73): already uses the entry singular, so it yields "Slide 1" / "Document 1" automatically. No change needed, but verify.
   - `createProject(name, kind)` (lines 162-182): make it kind-aware so the right id array is seeded:
     ```ts
     const tabs = createInitialTabs(kind)
     const firstId = collectTabIds(tabs)[0] ?? null
     // …base object…
     pinboardIds:  kind === "Presentation" && firstId ? [firstId] : [],
     markdownIds:  kind === "Markdown"     && firstId ? [firstId] : [],
     plaintextIds: kind === "PlainText"    && firstId ? [firstId] : [],
     typewriterIds: [],
     ```
   - `normalizeProjectAfterTabs` (lines 126-159): it already filters `markdownIds`/`typewriterIds`/`pinboardIds` against valid tab ids. **Add `plaintextIds`** to the same treatment (collect, validate, exclude ids already claimed by pinboard/typewriter). Keep the precedence rule consistent so a tab is in at most one mode array.
   - `parseProjectFromDocument` (lines 236-274) and `isProjectSnapshot` (219-234): these hard-code `kind: "Book"`. For cloud/web mode to support non-book projects, read the real `kind` from the snapshot, validate it against the 4-member union, and pass `plaintextIds` through. If web/cloud support for the new kinds is out of scope for now, **leave a `// TODO` and keep books working** — but do not let a Presentation snapshot silently become a Book.
2. **`core/localFiles/types.ts`** — apply everything in §2.2 and §2.3's type additions; add the kind-mapping helpers.
3. Build. Fix every resulting type error by *adding* handling, never by casting. The compiler is your checklist here.

### Phase 2 — Codecs

1. **`core/localFiles/codecBook.ts`** — add `"plaintext"` to `VALID_MODES` (line 25). Nothing else changes; `mode="plaintext"` will now round-trip.
2. **NEW `core/localFiles/codecPresentation.ts`** — copy `codecSlideshow.ts` as the starting point and adapt:
   - Root element stays `<tusks>`.
   - `emitSlide`: emit `id` **and** `title` attributes; child element `<board>` (not `<content>`) wrapping `emitCData(slide.board)`.
   - Parser `isArray` stays `name === "slide"`; read the `title` attribute (default `"Untitled Slide"`); read `<board>` text.
   - Export `serializeTuskPresentation(file: TuskPresentationFile): string` and `parseTuskPresentation(xml: string): TuskPresentationFile`.
   - Reuse `xmlPrimitives.ts` exactly as `codecSlideshow.ts` does.
3. **NEW `core/localFiles/codecPlainDoc.ts`** — trivial raw codecs for `.md` and `.txt`. There is **no XML wrapper** — the file *is* the document:
   ```ts
   export function parsePlainDocFile(raw: string): string { return raw }
   export function serializePlainDocFile(content: string): string { return content }
   ```
   (One module for both; `.md` and `.txt` differ only in how the *editor* treats the string, not in storage.)
4. **Do NOT delete `codecPinboard.ts` / `codecSlideshow.ts` yet** — deletion happens in Phase 9 once nothing imports them.
5. Build (the new codecs are not yet imported anywhere; that is fine).

### Phase 3 — Bridge & factories

1. **`core/localFiles/bridge.ts`**
   - `modeFor` (lines 19-27) and `tabsToChapters` (29-42): add `plaintext`. Signature gains a `plaintextIds: Set<string>` param; `modeFor` returns `"plaintext"` when the id is in that set. Precedence: typewriter → markdown → plaintext → default.
   - `projectToBookFile` (44-60): build `plaintextIds` from `project.plaintextIds` and pass it through.
   - `chaptersToTabsRecursive` (69-80) + `Buckets` (62-67): add a `plaintextIds: string[]` bucket; when `chapter.mode === "plaintext"` push the id.
   - `bookFileToProject` (82-107): set `plaintextIds: buckets.plaintextIds` on the returned project; `pinboardIds` stays `[]` for books.
   - **NEW** `presentationFileToProject(file: TuskPresentationFile): Project` — flat `tabs` (one `DocumentTab` per slide, `children: []`), `contentById[slideId] = slide.board`, `pinboardIds` = every slide id, `kind: "Presentation"`, `activeId` = `activeSlideId` (validated) or first slide.
   - **NEW** `projectToPresentationFile(project, opts)` — inverse: `slides` from `project.tabs` (flat — see gotcha G3), each `{ id, title, board: contentById[id] ?? "" }`.
   - **NEW** `plainDocFileToProject(raw, kind, opts)` — `kind` is `"Markdown"` or `"PlainText"`; create one synthetic tab (`createId()`, title from the file name passed via `opts`), `contentById[tabId] = raw`, set `markdownIds`/`plaintextIds` accordingly, `activeId = tabId`.
   - **NEW** `projectToPlainDocString(project): string` — return `project.contentById[project.activeId ?? firstTabId] ?? ""`.
2. **`core/localFiles/factories.ts`** — delete `createNewPinboardFile` and `createNewSlideshowFile`. Add `createNewPresentationFile(name): TuskPresentationFile` (one starter slide, `board: ""`, color e.g. `#ef4444`). No factory is needed for `.md`/`.txt` files — `serializePlainDocFile("")` of a fresh `createProject(name, "Markdown"|"PlainText")` is enough.
3. **`core/localFiles/index.ts`** — update the export surface: remove pinboard/slideshow codec + factory exports; add `codecPresentation`, `codecPlainDoc`, the new bridge functions, `createNewPresentationFile`.
4. Build.

### Phase 4 — Filesystem sync (the critical phase)

File: `core/localFiles/useLocalFilesystemSync.ts`. **The write path must become kind-aware or presentations will be corrupted into books.**

1. **Imports (lines 16-22):** drop `parseTuskPinboard` / `parseTuskSlideshow`; add `parseTuskPresentation` / `serializeTuskPresentation`, `parsePlainDocFile` / `serializePlainDocFile`, `presentationFileToProject` / `projectToPresentationFile`, `plainDocFileToProject` / `projectToPlainDocString`, and `fileKindForProjectKind`.
2. **`projectFromFile(kind, raw, filePath)` (≈ lines 536-590):** replace the `pinboard` and `slideshow` branches:
   - `book` → `bookFileToProject(parseTuskBook(raw))` (unchanged).
   - `presentation` → `presentationFileToProject(parseTuskPresentation(raw))`.
   - `markdown` → `plainDocFileToProject(raw, "Markdown", { name: <basename without .md> })`.
   - `plaintext` → `plainDocFileToProject(raw, "PlainText", { name: <basename without .txt> })`.
   - The `_filePath` param is currently unused — use it now to derive the display name for md/txt.
3. **Add a single write-dispatch helper** (one place, used by both writers):
   ```ts
   function serializeProjectForDisk(project: Project, cloudId: string | null): { ext: string; text: string } {
     switch (project.kind) {
       case "Book":         return { ext: ".tusk",  text: serializeTuskBook(projectToBookFile(project, { cloudId })) }
       case "Presentation": return { ext: ".tusks", text: serializeTuskPresentation(projectToPresentationFile(project, { cloudId })) }
       case "Markdown":     return { ext: ".md",    text: serializePlainDocFile(projectToPlainDocString(project)) }
       case "PlainText":    return { ext: ".txt",   text: serializePlainDocFile(projectToPlainDocString(project)) }
     }
   }
   ```
4. **`createOnDisk` (≈ lines 302-321):** replace the hard-coded `projectToBookFile`/`serializeTuskBook`/`.tusk` with `serializeProjectForDisk(...)`; use its `.ext` for the filename; set the meta `kind` via `fileKindForProjectKind(project.kind)`.
5. **`writeProjectToDisk` (≈ lines 416-501):** same replacement at the serialization point (≈ 483-484). **Every hard-coded `.tusk`** used for renames/moves (≈ lines 456-457, 468, 471) must become `extensionForKind(fileKindForProjectKind(project.kind))`. The meta `kind` (≈ line 490) must use `fileKindForProjectKind(project.kind)`.
6. **`cloudIdFromFile` / `cloudIdFromMeta` (≈ 592-614):** rewrite the `switch` for the 4 kinds — `book`/`presentation` parse and return `cloudId`; `markdown`/`plaintext` have **no embedded cloud id**, return `null` (raw files cannot carry metadata — this is a deliberate, accepted limitation: standalone `.md`/`.txt` are local-only, no cloud overlay, no version sidecar).
7. **Extension gate (≈ line 150-152):** no code change needed — it already uses `kindForExtension`, which now returns the 4 valid kinds and `null` (skip) for `.tuskb` and everything else. A stray legacy `.tuskb` is silently ignored. Confirm that is the behavior you see.
8. **Header comment (lines 1-11)** and `FileMeta.kind` references: update prose to the new 4-type model.
9. Build, then **manual test** (see Phase 10) before moving on — this phase is where data loss hides.

### Phase 5 — Editor selection + the new PlainText editor

1. **NEW `webapp/components/editor/PlainTextEditor.tsx`** (+ `PlainTextEditor.css`). A minimal monospace `<textarea>` editor — model it on `MarkdownEditor.tsx`'s source-pane half but with **no preview, no markdown toolbar**. Props mirror `MarkdownEditor` minimally: `documentId`, `content`, `editorFontSize`, `onContentChange`, `onWordCountChange`, `onTypingStateChange`. It must call `onContentChange` with the raw textarea value. Reuse `MarkdownEditor`'s content-reset-on-`documentId`-change pattern so switching tabs/projects loads the new content.
2. **`webapp/pages/Editor.tsx` (`activeDocumentType`, lines 154-164):** widen the type and add the plaintext branch:
   ```ts
   const activeDocumentType = useMemo<"prose" | "pinboard" | "markdown" | "plaintext">(() => {
     if (!activeTabId || !projectTabs) return "prose"
     if ((projectPinboardIds ?? []).includes(activeTabId)) return "pinboard"
     if ((projectPlaintextIds ?? []).includes(activeTabId)) return "plaintext"
     const markdownIds = getProjectMarkdownIds({ … })
     if (markdownIds.includes(activeTabId)) return "markdown"
     return "prose"
   }, [activeTabId, projectTabs, projectPinboardIds, projectPlaintextIds, projectMarkdownIds, projectMarkdownEditorEnabled])
   ```
   Add `const projectPlaintextIds = project?.plaintextIds` to the slice hoist (near lines 149-151) and to the dependency array. Keeping the deps aligned matters — the React Compiler relies on it (see the comment at `Editor.tsx:141-146`).
3. **`webapp/components/editor/EditorWorkspace.tsx` (ternary, lines 134-236):** add a `"plaintext"` branch that renders `<PlainTextEditor>`. Suggested placement: right after the `"markdown"` branch (line 172-186), before the final `else`. PlainText needs no diff-widget wiring.
4. Presentations need **no** change here — every presentation tab is in `pinboardIds`, so `activeDocumentType` already returns `"pinboard"` and `PinboardEditor` renders. Confirm by opening a presentation after Phase 6.
5. Build.

### Phase 6 — Create flows

#### 6a. Inside a Book — `webapp/components/navigation/NavigationPanel.tsx`

- Keep `handleCreateEntry` (lines 120-135) for "Create Chapter".
- **Delete `handleCreatePinboard` (lines 137-153).**
- Keep `handleCreateMarkdown` (155-171); set its tab title via `getNextEntryName(tabs, "Document")` or a literal you prefer (no longer "Markdown").
- **Add `handleCreatePlainText`** — identical to `handleCreateMarkdown` but pushes the new id into `plaintextIds` instead of `markdownIds`.
- `createMoreActions` (lines 214-225): becomes **`[Create Markdown, Create Plain Text]`** — remove the "Create Pinboard" entry. Icons: `FileText` for markdown, `FileType` (or `File`) for plain text.
- The "Create More" button (lines 284-293) is **Book-only**. Gate the whole slide-2 header on kind (see 6b/6c).

#### 6b. Inside a Presentation — same file, slide-2 header (lines 264-294)

- When `project.kind === "Presentation"`, the slide-2 header shows a **single "Create Pinboard"** button (no "Create More", no "Create Chapter").
- Wire it to a new `handleCreateSlide` that appends a tab **and** registers it as a pinboard:
  ```ts
  const handleCreateSlide = () => onProjectChange((p) => {
    const nextId = createId()
    const nextTitle = getNextEntryName(p.tabs, getProjectEntryTerms(p.kind).singular) // "Slide N"
    return {
      ...p,
      activeId: nextId,
      pinboardIds: [...(p.pinboardIds ?? []), nextId],
      tabs: [...p.tabs, { id: nextId, title: nextTitle, children: [] }],
      contentById: { ...p.contentById, [nextId]: "" },
    }
  })
  ```
  (Note: button label is "Create Pinboard" per spec; the tab it produces is labelled "Slide N" — that is intentional.)

#### 6c. Single-document kinds (Markdown / PlainText)

- When `isSingleDocumentKind(project.kind)`, the slide-2 header shows **no create buttons at all** (there is nothing to add to a single-document project).

> Implement 6a/6b/6c as a `switch (project.kind)` (or three branches) that decides which header buttons render. Do the **same** gating in `DocumentTabsPanel.tsx`'s background context-menu (lines 526-542): Book → Create Chapter / Create Markdown / Create Plain Text; Presentation → Create Pinboard; single-doc → nothing. Remove the existing "Create Pinboard" context-menu entry from the Book path.

#### 6d. Library / top-level create — Book, Presentation, Markdown, Plain Text

- `core/hooks/useAppOrchestration.ts` `onCreateProject` (≈ lines 531-539): change the signature to `onCreateProject(kind: ProjectKind)` and call `createProject(generateUntitledName(projects, kind), kind)`. Update its type in the editor/library prop bundles.
- Every caller of `onCreateProject` must pass a kind:
  - `NavigationPanel.tsx` "Create Project" button (lines 244-252) → turn into a small menu (Book / Presentation / Markdown / Plain Text) or keep it defaulting to Book and add the others to the Library only. **Recommended:** make it a dropdown menu reusing the existing `ContextMenu` component, same pattern as "Create More".
  - `webapp/pages/Library.tsx` `createNewProject` (≈ lines 210-217), the create-card button (≈ line 456), the folder `onCreateBook` (≈ line 292), the context-menu create entry (≈ lines 552-553) → all must offer the four kinds (a menu) and pass the chosen kind through.
  - `ProjectBrowserPanel.tsx` context-menu create entry (≈ lines 824-825).
  - `ProjectFolder.tsx` create button (≈ line 194).
  - `core/events/editorEvents.ts` `PROJECTS_CREATE_BOOK_EVENT` (line 15, dispatched line 194) and the `Library.tsx` listener (≈ lines 230-241): either add parallel events per kind, or change the event payload to carry a `kind`. **Recommended:** payload carries `kind`.
- New presentations created on disk in Electron mode go through the normal `createProject` → `useLocalFilesystemSync.createOnDisk` path, which (after Phase 4) serializes by kind. No separate disk-create call is needed.
- Build.

### Phase 7 — Tab-list labels & suppression

1. **Visible heading.** `DocumentTabsPanel.tsx` currently renders only the project name (≈ lines 403-405) with **no entry-noun heading**. The spec says to label the list. Add a heading element showing `getProjectEntryTerms(projectKind).plural` — "Chapters" for books, "Slides" for presentations — directly above the `<ul>` (≈ line 434). Style it as a small section label.
2. **Suppression for single-document kinds.** When `isSingleDocumentKind(projectKind)`:
   - Render **no heading and no `<ul>`** in `DocumentTabsPanel` (there is one tab; the user is always on it).
   - In `NavigationPanel`, when a single-document project is open, the rail should open straight to the editor with the tab slide effectively empty — keep slide 1 (project browser) working, but slide 2 shows just the project name, no create buttons, no tree.
   - Do **not** remove the synthetic tab; only hide the UI. `project.activeId` must still point at it.
3. The trash modal / context-menu copy in `DocumentTabsPanel` (≈ lines 495-551) already derives nouns from `getProjectEntryTerms` — once Phase 1 added the entries, "Delete Slide" etc. work automatically. Verify.
4. Build.

### Phase 8 — Icons

1. Add a resolver — new file `core/utils/projectIcons.ts` (or a function near `getProjectEntryTerms`):
   ```ts
   import { BookText, Presentation, FileText, FileType, type LucideIcon } from "lucide-react"
   export function iconForProjectKind(kind: ProjectKind): LucideIcon {
     switch (kind) {
       case "Book": return BookText
       case "Presentation": return Presentation
       case "Markdown": return FileText
       case "PlainText": return FileType
     }
   }
   ```
2. Replace the four hard-coded `BookText` usages so they branch on `project.kind`:
   - `webapp/components/library/ProjectCard.tsx:287`
   - `webapp/components/navigation/ProjectBrowserPanel.tsx:379` (`const Icon = BookText` → `const Icon = iconForProjectKind(project.kind)`)
   - `webapp/components/layout/AppShell.tsx:577`
   - `webapp/components/layout/WebMenu.tsx:24` (the `menuIcons` map — make the icon dynamic per project where this renders projects).
3. Leave `BookPlus` (create-buttons) as-is, or swap per the create menu's needs.
4. Build.

### Phase 9 — Removal & cleanup

Only now, when nothing imports them:

- **Delete files:** `core/localFiles/codecPinboard.ts`, `core/localFiles/codecSlideshow.ts`.
- **`core/localFiles/types.ts`:** remove `TUSK_PINBOARD_EXT`, `TuskPinboardNode/Line/File`, old `TuskSlide`/`TuskSlideshowFile` (already replaced in Phase 1).
- **`core/localFiles/index.ts`:** confirm no dangling exports.
- **`core/localFiles/factories.ts`:** confirm `createNewPinboardFile`/`createNewSlideshowFile` are gone.
- **`useLocalFilesystemSync.ts`:** confirm no `.tuskb`/slideshow references remain; update the header comment (lines 1-11).
- **`webapp/components/settings/WorkspaceSettings.tsx` (≈ lines 44-46):** rewrite the user-facing copy — it currently says ".tusk books, .tuskb pinboards, .tusks slideshows". New copy: ".tusk books, .tusks presentations, plus .md and .txt documents."
- **`core/electron/localWorkspace.ts:2`** and **`core/localFiles/versioning.ts:1-2`:** update comments mentioning the old three types.
- Grep the whole `frontend/src` for `tuskb`, `slideshow`, `Slideshow`, `TUSK_PINBOARD`, `createNewPinboardFile`, `createNewSlideshowFile`, `parseTuskPinboard`, `parseTuskSlideshow` — there must be **zero** hits.
- Run `npm run lint` and `tsc -b` — both clean.

> **Keep** (do not delete): `PinboardEditor.tsx`, `PinboardToolbar.tsx`, `PinboardNode.tsx`, `usePinboardGestures.ts`, `pinboardData.ts`, and `Project.pinboardIds` — they are the presentation slide editor now.

---

## 4. New files to create

| File | Purpose |
|------|---------|
| `core/localFiles/codecPresentation.ts` | `.tusks` serialize/parse (`TuskPresentationFile`) |
| `core/localFiles/codecPlainDoc.ts` | raw `.md`/`.txt` (de)serialize (identity) |
| `webapp/components/editor/PlainTextEditor.tsx` (+ `.css`) | plain-text editor for `.txt` and standalone PlainText projects |
| `core/utils/projectIcons.ts` | `iconForProjectKind` resolver |

## 5. Files to delete

| File | Reason |
|------|--------|
| `core/localFiles/codecPinboard.ts` | `.tuskb` standalone format removed |
| `core/localFiles/codecSlideshow.ts` | old text-slideshow replaced by `codecPresentation.ts` |

## 6. Files that must change (quick index)

`core/utils/projects.ts` · `core/localFiles/types.ts` · `core/localFiles/codecBook.ts` · `core/localFiles/bridge.ts` · `core/localFiles/factories.ts` · `core/localFiles/index.ts` · `core/localFiles/useLocalFilesystemSync.ts` · `core/localFiles/versioning.ts` (comment) · `core/electron/localWorkspace.ts` (comment) · `core/hooks/useAppOrchestration.ts` · `core/hooks/useWorkspaceHydration.ts` (book-counter / fallback create) · `core/events/editorEvents.ts` · `webapp/pages/Editor.tsx` · `webapp/pages/Library.tsx` · `webapp/components/editor/EditorWorkspace.tsx` · `webapp/components/navigation/NavigationPanel.tsx` · `webapp/components/navigation/DocumentTabsPanel.tsx` · `webapp/components/navigation/ProjectBrowserPanel.tsx` · `webapp/components/library/ProjectCard.tsx` · `webapp/components/library/ProjectFolder.tsx` · `webapp/components/layout/AppShell.tsx` · `webapp/components/layout/WebMenu.tsx` · `webapp/components/settings/WorkspaceSettings.tsx` · (verify) `webapp/components/settings/GlobalSettings.tsx` / `ProjectSettings.tsx` (they type a `projectKind: ProjectKind` field — should compile unchanged, just confirm).

---

## 7. Verification checklist

Run after Phase 9, in Electron mode (the local-file path is where corruption hides):

**Books (`.tusk`)**
- [ ] Create a Book from the Library → a `.tusk` file appears in the workspace folder.
- [ ] "Create Chapter" adds a chapter tab in the Chapters list.
- [ ] "Create More → Markdown" adds a tab that opens in the Markdown editor.
- [ ] "Create More → Plain Text" adds a tab that opens in the PlainText editor.
- [ ] There is **no** "Create Pinboard" option anywhere inside a book.
- [ ] Close & reopen the app → chapter/md/txt tabs and their content/mode all round-trip. Inspect the `.tusk` XML: chapters carry `mode="markdown"` / `mode="plaintext"`.

**Presentations (`.tusks`)**
- [ ] Create a Presentation from the Library → a `.tusks` file appears (NOT `.tusk` — this is the key write-path test).
- [ ] The tab list header reads "Slides".
- [ ] "Create Pinboard" adds a slide; it opens in the Pinboard editor.
- [ ] Add nodes/lines to two different slides, reopen the app → both boards round-trip independently.
- [ ] Inspect the `.tusks` XML: one `<slide>` per board, each with a `title`.

**Standalone `.md` / `.txt`**
- [ ] Create a Markdown and a Plain Text doc from the Library → `.md` / `.txt` files appear with raw content (open them in a normal text editor — no XML wrapper).
- [ ] Opening one shows **no tab list**.
- [ ] Edit, reopen → content round-trips. Editing externally and reopening reflects the change.
- [ ] Drop a hand-written `.md`/`.txt` into the workspace folder → it appears as a Library card.

**Icons & labels**
- [ ] Library/sidebar: Book shows the book icon, Presentation the presentation icon, md/txt their file icons.
- [ ] Book tab header says "Chapters"; Presentation says "Slides".

**Regression / integrity**
- [ ] `tsc -b` and `npm run lint` clean.
- [ ] A leftover `.tuskb` file in the workspace is silently ignored (not crashed on).
- [ ] Editing an existing Book does **not** change its extension or rewrite it as another kind.
- [ ] Cloud/web mode: existing Book cloud documents still load (if web support for new kinds is deferred, confirm books are unaffected).

> There is no automated test suite in this repo. Until one exists, this manual
> checklist **is** the test. Strongly consider adding unit tests for the codecs
> and `bridge.ts` first — they are pure functions and would catch the
> highest-risk round-trip bugs cheaply.

---

## 8. Risks & gotchas

- **G1 — Kind-blind writes (highest risk).** Until Phase 4 is correct, every save rewrites files as `.tusk`/book. Do not test presentations before Phase 4 is done, and verify the file extension on disk immediately after the first presentation save.
- **G2 — `ProjectKind` widening is your safety net.** `ENTRY_TERMS_BY_KIND` is an exhaustive `Record` — the compiler will flag missing kinds. Resist `as` casts; if something doesn't type-check, it's telling you about a real unhandled case.
- **G3 — Presentation tabs should be flat.** Slides are a flat list. The `DocumentTab` tree *allows* nesting; do not offer nesting UI for presentations (no "add child slide"). `projectToPresentationFile` should flatten defensively (if a nested tab ever appears, `collectTabSequence` order is the safe linearization). Books keep nesting.
- **G4 — The synthetic tab for md/txt must never be deleted.** `useTabViewMode`, `useFindReplaceModal`, `activeDocumentType`, and `EditorWorkspace` all assume `activeId` resolves to a real tab. Single-doc projects keep exactly one tab; we only hide the list UI. Make sure no "delete tab" path is reachable for single-doc kinds.
- **G5 — md/txt carry no metadata.** Raw `.md`/`.txt` cannot embed `id` / `cloud-id` / `color` / `created`. Standalone docs are local-only: derive `id` from the file path, `name` from the filename, use a default color, and skip the cloud overlay and version sidecar for them. `cloudIdFromFile` returns `null` for these. This is an accepted limitation — do not try to smuggle metadata into the file.
- **G6 — Pinboard content is opaque.** `codecPresentation.ts` stores the `board` string verbatim. Never parse or "clean up" it in the codec. The single source of truth for the board format is `PinboardEditor` + `pinboardData.ts`.
- **G7 — Four icon sites, change them together.** `ProjectCard.tsx:287`, `ProjectBrowserPanel.tsx:379`, `AppShell.tsx:577`, `WebMenu.tsx:24`. Missing one leaves a Book icon on a presentation.
- **G8 — `bookCounter`.** `useWorkspaceHydration.ts` threads a single global `bookCounter` and creates a fallback `createProject("Book 1", "Book")` (≈ lines 242, 293). It is Book-specific; leave it for Books and use `generateUntitledName(projects, kind)` for the other kinds (it already dedupes by name) rather than inventing per-kind counters. Just make sure the fallback-create path still passes a valid kind.
- **G9 — `parseProjectFromDocument` (web/cloud) hard-codes `"Book"`.** If a user creates a Presentation in web mode, it must not be parsed back as a Book. Either implement kind-aware cloud parsing in Phase 1, or explicitly scope the new kinds to Electron/local mode for now and disable creating them in web mode — but make that choice deliberately, not by accident.
- **G10 — Create-More vs Create-Pinboard gating.** After the overhaul, "Create Pinboard" must exist **only** in presentations and "Create More" (md/txt) **only** in books. A book must never be able to spawn a pinboard tab, and a presentation must never spawn a chapter. Gate by `project.kind` in both `NavigationPanel.tsx` and `DocumentTabsPanel.tsx`.
- **G11 — No tests.** Nothing will catch a regression but you. Work phase by phase, build after each, and run the Phase 7 checklist before calling it done.
