# Ivoryscribe Refactor Plan (v2 — May 2026)

> **Audience:** Claude Code (or any coding agent) executing this end-to-end.
> **Goal:** Eliminate duplication, settle ambiguous state ownership, break up the biggest files, and stop the drift between intent and reality. No feature changes — behavior must be preserved.
> **Estimated impact:** ~2,500–3,500 LOC removed, every editor / page / export module follows the same skeleton afterward.

---

## What's different from the previous plan

The previous version of this file (written before many edits landed) is no longer accurate. Concretely:

1. **None of Phase 1 was actually completed.** Emoji helpers in `ProjectSettings.tsx:39-67` are still duplicated. The export helpers in `docxExport.ts`, `pdfExport.ts`, `markdownExport.ts`, `txtExport.ts` are still duplicated. `sync.js` is still uncommented. So Phase 1 carries over.
2. **The previous plan got two diagnoses wrong:**
   - It claimed `useListDrag.ts` and `useMarqueeSelection.ts` were orphans in `editor/hooks/`. They're not — both are imported by `navigation/` and `library/` code (`ProjectBrowserPanel.tsx`, `DocumentTabsPanel.tsx`, `TabNode.tsx`, `usePanelMarquee.ts`, `useMultiSelect.ts`). The misfiling is real (they don't belong under `editor/hooks/`), but they're live code, not dead code.
   - It said `useAppOrchestration` "bundles and delegates" with no domain state of its own. False. It currently owns 14 `useState` calls including `projects`, `folders`, `activeProjectId`, `view`, `bookCounter`, `projectDocumentMap`, `pendingShareRequests`. The Phase 2 state-ownership work is still all to do.
3. **The previous plan never mentioned `Editor.tsx`.** That file is now **1,475 lines** with 17 `useState` calls and 8 `console.log("[tuskai] …")` debug lines. It's the second-largest file in the repo. New Phase 4.5 covers it.
4. **The previous plan never mentioned `useCloudPreferenceSync.ts`.** This 232-line hook was added to handle Electron local-mode and overlaps with `useWorkspaceHydration` for preference loading. Addressed in Phase 2.4.
5. **`useViewTransition.ts` is confirmed dead.** Defined in `core/`, zero importers. Addressed in Phase 1.5.
6. **Backend `routes/auth.js` is still 820 lines and `routes/ai.js` is still 802 lines.** No service extraction has happened. Phase 6 carries over.
7. **`Trash.tsx` does NOT have local emoji helpers** (it imports `splitGraphemes` from `libraryUtils`). Only `ProjectSettings.tsx` is the offender now.

---

## How to use this document

1. Execute phases **in order**. Each phase has dependencies on the ones before it.
2. After every phase, run the **Verification** block and **commit**. Do not bundle phases into one commit.
3. If a step says "extract", that means: create the new file, move the code, update imports, leave behavior identical.
4. **Never delete a file without first confirming zero remaining imports** (`grep -rn "from.*<filename>" frontend/src backend/src`).
5. Run `npm run build` (frontend) after each phase. The app must still build.
6. If a refactor reveals a bug that already existed, **do not fix it in the same commit** — open a follow-up note in `REFACTOR_FOLLOWUPS.md`.

---

## Current repo map (verified May 2026)

```
ivoryscribe/                  32,783 total LOC across .ts/.tsx/.js/.css
├── frontend/
│   ├── electron/             main.ts, preload.ts, tsconfig.json   (clean)
│   └── src/
│       ├── App.tsx, main.tsx, index.css, App.css
│       ├── core/             24 files in flat directory — target of Phase 3
│       │   └── localFiles/   11 files (codecs — already cohesive, leave alone)
│       ├── landing/pages/    7 files (marketing site)
│       └── webapp/
│           ├── components/
│           │   ├── ai/        TuskAI + diff
│           │   ├── editor/    4 editors + 5 hooks + spellcheck + FindReplace
│           │   ├── export/    4 exporters + 1 modal + selection logic
│           │   ├── layout/    AppLayout + AppShell + GlobalCaretOverlay + WebMenu
│           │   ├── library/   ProjectCard + ContextMenu + Folder + 6 hooks
│           │   ├── navigation/Browser + Tabs + 4 hooks
│           │   ├── settings/  6 settings panels + ShareDialog
│           │   └── ui/        Button + GhostButton + Modal + MarqueeText
│           └── pages/         Archive, Recent, Trash, Library, Editor, Auth*
└── backend/
    └── src/
        ├── config/, middleware/, models/, routes/, services/
        └── server.js
```

### Files >500 lines (priority targets)

| File | Lines | Phase |
|---|---|---|
| `frontend/src/webapp/components/editor/TypewriterEditor.tsx` | **1,836** | 4.4 |
| `frontend/src/webapp/pages/Editor.tsx` | **1,475** | 4.5 (NEW) |
| `frontend/src/webapp/components/editor/PinboardEditor.tsx` | 830 | 4.6 (NEW) |
| `frontend/src/webapp/components/editor/DraftingEditor.tsx` | 823 | 4.1–4.3 |
| `frontend/src/webapp/components/navigation/ProjectBrowserPanel.tsx` | 821 | (out of scope) |
| `backend/src/routes/auth.js` | 820 | 6.1 |
| `backend/src/routes/ai.js` | 802 | 6.2 |
| `frontend/src/webapp/components/layout/AppShell.tsx` | 772 | 5.2 |
| `frontend/src/core/versioning.ts` | 758 | (already cohesive) |
| `frontend/src/core/useWorkspaceHydration.ts` | 726 | 2.2–2.4 |
| `frontend/src/core/api.ts` | 685 | 3.2 |
| `frontend/src/webapp/components/settings/AccountSettings.tsx` | 651 | 5.4 (NEW) |
| `frontend/src/core/useAppOrchestration.ts` | 632 | 2.2, 2.3 |
| `frontend/src/webapp/pages/Library.tsx` | 630 | 5.1 |
| `frontend/src/webapp/components/navigation/DocumentTabsPanel.tsx` | 606 | (out of scope) |
| `frontend/src/webapp/components/editor/MarkdownEditor.tsx` | 584 | 4.3 |
| `frontend/src/webapp/components/settings/ShareDialog.tsx` | 554 | 5.4 (NEW) |
| `frontend/src/webapp/components/settings/GlobalSettings.tsx` | 548 | (out of scope) |
| `frontend/src/core/localFiles/useLocalFilesystemSync.ts` | 527 | (cohesive) |
| `frontend/src/webapp/components/settings/AppearanceSettings.tsx` | 523 | (out of scope) |
| `frontend/src/webapp/components/editor/spellcheck.ts` | 520 | 7.2 (rename) |
| `frontend/src/webapp/components/export/pdfExport.ts` | 503 | 1.2 |

---

## Phase 0 — Safety net

Before touching anything:

1. Confirm clean git status: `git status` → nothing uncommitted.
2. Create a working branch: `git checkout -b refactor/cleanup-pass-v2`.
3. Establish baseline:
   - `cd frontend && npm run build` — note any pre-existing warnings.
   - `cd backend && node -e "require('./src/server.js')"` — confirm it loads.
4. Record current LOC for the report at the end:
   ```bash
   find frontend/src backend/src -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.css" \) | xargs wc -l | tail -1
   ```
   Current baseline: **32,783 lines**.

---

## Phase 1 — Free wins (no risk, ~1 hour total)

No dependencies, no behavior risk, unblocks cleaner imports.

### 1.1 Remove duplicated emoji helpers in ProjectSettings

**Status:** Not done. Still duplicated.

- `frontend/src/core/libraryUtils.ts:9-37` — exported, authoritative
- `frontend/src/webapp/components/settings/ProjectSettings.tsx:39-68` — local copies

**Action:**
1. Delete lines 39–68 in `ProjectSettings.tsx` (`splitGraphemes`, `extractEmojiTokens`, `normalizeProjectEmojiWallpaper`).
2. Add to the import block:
   ```ts
   import {
     splitGraphemes,
     extractEmojiTokens,
     normalizeProjectEmojiWallpaper,
   } from "../../../core/libraryUtils"
   ```

**Verify:** `npm run build`. Open project settings modal, type emoji into the wallpaper field, confirm it still normalizes to 3 emoji.

**Commit:** `refactor: dedupe emoji helpers in ProjectSettings`

---

### 1.2 Extract export utilities

**Status:** Not done. Four export modules each re-implement identical helpers.

| File | Lines | Duplicated helpers |
|---|---|---|
| `frontend/src/webapp/components/export/docxExport.ts` | 17–62 | `normalizeLineEndings`, `plainTextFromHtml`, `slugifyFileName`, `sanitizeZipEntryName`, `downloadBlob` |
| `frontend/src/webapp/components/export/pdfExport.ts` | 210–233 | `slugifyFileName`, `sanitizeZipEntryName`, `downloadBlob` |
| `frontend/src/webapp/components/export/markdownExport.ts` | 13–35 | `slugifyFileName`, `sanitizeZipEntryName`, `downloadBlob` |
| `frontend/src/webapp/components/export/txtExport.ts` | 12–56 | `normalizeLineEndings`, `plainTextFromHtml`, `slugifyFileName`, `sanitizeZipEntryName`, `downloadBlob` |

Also: a separate `plainTextFromHtml` lives in `frontend/src/core/markdown.ts` (around line 63–69).

**Action:**
1. Diff all four implementations of each helper. If any differ by even one character, **STOP** and report — don't choose one silently.
2. Create `frontend/src/webapp/components/export/exportUtils.ts` exporting the canonical versions of:
   - `slugifyFileName(value: string): string`
   - `sanitizeZipEntryName(value: string): string`
   - `downloadBlob(blob: Blob, fileName: string): void`
3. For `normalizeLineEndings` and `plainTextFromHtml`: these are text utilities, not export-specific. Make `core/markdown.ts` the canonical home. Have `exportUtils.ts` re-export them if convenient, or import directly from `core/markdown` in the exporters.
4. In each of the four export files, delete the local definitions and import from `exportUtils` / `core/markdown`.

**Verify:** Trigger each export format from the running app (DOCX, PDF, Markdown, TXT). All four must download files with correctly slugified names.

**Commit:** `refactor: consolidate export helpers into exportUtils`

---

### 1.3 Relocate misfiled hooks (not delete)

**Status:** Previous plan was wrong about these being orphans. They're live.

- `frontend/src/webapp/components/editor/hooks/useListDrag.ts` (127 lines) — used by `ProjectBrowserPanel.tsx`, `DocumentTabsPanel.tsx`, `TabNode.tsx`, `library/useProjectDrag.ts`
- `frontend/src/webapp/components/editor/hooks/useMarqueeSelection.ts` (174 lines) — used by `library/useMultiSelect.ts`, `navigation/usePanelMarquee.ts`

These are misfiled — they're generic drag/selection primitives, not editor concerns.

**Action:**
1. Create `frontend/src/webapp/components/shared/hooks/` (new folder; if you prefer, put them at the webapp root).
2. Move both files there.
3. Update all import paths.

**Verify:** `npm run build` passes. Drag a project card in Library, marquee-select multiple items in Archive — both behaviors unchanged.

**Commit:** `refactor: relocate generic drag/marquee hooks out of editor/`

---

### 1.4 Mark dead sync route

**Status:** Not done. Still no frontend caller, only a comment in `useAppOrchestration.ts:134` referencing it as "blocked".

**Action:**
1. Confirm: `grep -rn "/sync\|/api/sync" frontend/src` returns only the comment in `useAppOrchestration.ts:134`.
2. Add to the top of `backend/src/routes/sync.js`:
   ```js
   // DEPRECATED: legacy bulk-upsert endpoint. Frontend now syncs via
   // /documents, /shares, and the Electron local file watcher. Kept for
   // backward compatibility with older clients. Re-evaluate for removal
   // after 2026-11-15.
   ```
3. Do **not** delete yet — older Electron builds in the wild may still hit it.

**Verify:** Backend boots; `POST /sync/push` still responds 200 to a known-shape payload.

**Commit:** `docs: mark sync route as deprecated`

---

### 1.5 Delete `useViewTransition.ts` (confirmed dead)

**Status:** New finding. `frontend/src/core/useViewTransition.ts` defines a hook that no file imports.

**Action:**
1. Final confirm: `grep -rn "useViewTransition" frontend/src backend/src` returns only the definition file.
2. Delete `frontend/src/core/useViewTransition.ts`.

**Verify:** `npm run build` passes.

**Commit:** `chore: delete unused useViewTransition hook`

---

### 1.6 Strip TuskAI debug logs in Editor.tsx

**Status:** New finding. `Editor.tsx` has 8 `console.log("[tuskai] …")` and 2 `console.warn` calls (lines 377, 423, 453, 501, 511, 532, 547, 592).

**Action:**
1. Read each call site. Decide:
   - If it's a true error path (e.g., "dropping empty-diff edit"), keep it as `console.warn` but tag-prefix it consistently.
   - If it's a state snapshot or trace, remove it.
2. Default to removal unless the user pushes back.

**Verify:** `npm run build` passes; TuskAI flow still works (chat + edit proposal accept/reject).

**Commit:** `chore: remove tuskai debug logs from Editor.tsx`

---

## Phase 2 — Settle state ownership (CRITICAL, do before reorganizing)

> **Why this is first among the structural work:** any folder reorg done before this freezes the wrong ownership boundaries into the new structure.

### 2.1 Map the actual write-paths (analysis-only commit)

**Confirmed writers of `projects[]`:**
- `frontend/src/core/useAppOrchestration.ts` — owns the `useState` (line 34), calls `setProjects` at 90, 299, 321, 388, 470
- `frontend/src/core/useWorkspaceHydration.ts` — receives `setProjects` as a prop, calls it at 267, 332, 400, 593, 694
- `frontend/src/core/useProjectVersioning.ts` — receives `setProjects` as a prop, calls it at 158, 187

**Confirmed cross-hook session mutation:**
- `frontend/src/core/useWorkspaceHydration.ts:327` calls `setSession(null)` on 401 — bypasses `useSession`.

**Confirmed orchestration `useState` calls** (14 total in `useAppOrchestration.ts`):
- `projects`, `folders`, `activeProjectId`, `view`, `bookCounter`, `isSettingsOpen`, `isMenuBarEnabled`, `isFlagsEnabled`, `isTranslucentNavPanel`, `isEditorTyping`, `isWorkspaceHydrated`, `projectDocumentMap`, `pendingShareRequests`, `isAuthOverlayOpen`

**Action:**
1. Create `REFACTOR_NOTES.md` at the repo root with the table below, expanded to include every consumer of each state slice:

   | State | Owner (useState) | External writers | Reads from (top consumers) |
   |---|---|---|---|
   | `projects[]` | `useAppOrchestration` | `useWorkspaceHydration` (5×), `useProjectVersioning` (2×) | `Library`, `Editor`, `Archive`, `Recent`, `Trash`, `useFindReplaceModal` |
   | `folders[]` | `useAppOrchestration` | `useWorkspaceHydration` (1×) | `Library`, `ProjectBrowserPanel` |
   | `activeProjectId` | `useAppOrchestration` | `useWorkspaceHydration`, `useRouting` | `Editor`, `AppShell` |
   | `view` | `useAppOrchestration` | `useWorkspaceHydration:280` | `App.tsx`, routing |
   | `session` | `useSession` | `useWorkspaceHydration:327` (direct `setSession(null)`) | everything auth-gated |
   | `palette`, fonts | `useAppStyle` | `useWorkspaceHydration` (1×), `useCloudPreferenceSync` (1×) | global CSS application |

2. Commit just this analysis file. This is your contract for the rest of the phase.

**Commit:** `docs: document current state ownership before refactor`

---

### 2.2 Make `useAppOrchestration` the single owner — versioning goes callback-based

The state already lives in `useAppOrchestration`. The fix is to stop letting other hooks reach in.

**Target design:**
- `useProjectVersioning` no longer calls `setProjects` directly. Instead it accepts an `onProjectRestore: (project: Project) => void` callback (and an `onProjectDuplicate` for L187).
- `useWorkspaceHydration` continues to call `setProjects` (it's the cloud sync engine — fighting that is a bigger change), but its access is funneled through typed mutators owned by the orchestrator (see 2.3).

**Action:**
1. In `useProjectVersioning.ts`, change the `setProjects` parameter to two callbacks: `onProjectRestore(project)` and `onProjectDuplicate(project)`.
2. In `useAppOrchestration.ts`, wire them:
   ```ts
   useProjectVersioning({
     onProjectRestore: (project) => setProjects(cur => /* preserve order, dedupe */),
     onProjectDuplicate: (project) => setProjects(cur => [project, ...cur]),
   })
   ```
3. Confirm no other file imports `useProjectVersioning` with `setProjects` as a prop.

**Verify:**
- Open a project, edit it, restore a previous version — works.
- Duplicate a version into the library — works.

**Commit:** `refactor: make useProjectVersioning callback-based (no direct setProjects)`

---

### 2.3 Typed mutators for `useWorkspaceHydration`

`useWorkspaceHydration` currently receives 16+ setters as individual props (line 79–97). Replace with a single mutator interface.

**Action:**
1. In `useAppOrchestration.ts`, define and pass:
   ```ts
   const workspaceMutators = {
     setProjects,
     setFolders,
     setActiveProjectId,
     applyHydratedView: (view) => setView(view),
     replacePalette: (p) => setPalette(p),
     // …one method per setter currently passed
   }
   useWorkspaceHydration({ mutators: workspaceMutators, … })
   ```
2. Inside `useWorkspaceHydration`, replace direct setter calls with `mutators.*`.
3. Move the `setSession(null)` call at line 327 out of `useWorkspaceHydration`. Replace with `mutators.onAuthFailure()` — a callback the orchestrator wires to `session.logout()`.

**Verify:** `npm run build` passes; login → hydration → editing → 401 → logout flow unchanged.

**Commit:** `refactor: route workspace hydration through typed mutators`

---

### 2.4 Collapse cloud vs local preference loading

`useCloudPreferenceSync.ts` (232 lines, added for Electron local-mode) and `useWorkspaceHydration.ts:285-306` both fetch + apply preferences. They're mutually exclusive at runtime (cloud branch gates on `session != null`, local branch gates on Electron presence + `session == null`), but the code paths are independent.

**Action:**
1. Extract a shared `applyPreferences(prefs, mutators)` function into `frontend/src/core/preferences.ts` (new file). Both hooks call it.
2. Verify both hook's branches end up calling the same `applyPreferences`. The only difference should be where the prefs come from (HTTP vs disk).

**Verify:**
- Log in to cloud mode, change theme, reload — theme persists.
- Switch to Electron local mode, change theme, reload — theme persists.

**Commit:** `refactor: extract applyPreferences shared by cloud and local sync`

---

### 2.5 Audit `useAppOrchestration` for UI vs domain split

After 2.2–2.4, `useAppOrchestration` should hold:
- **Domain state:** projects, folders, activeProjectId, projectDocumentMap, pendingShareRequests, bookCounter
- **UI/routing state:** view, isSettingsOpen, isMenuBarEnabled, isFlagsEnabled, isTranslucentNavPanel, isWorkspaceHydrated, isAuthOverlayOpen, isEditorTyping

Both belong, but the 632-line file is awkward to read. Optional follow-up: extract a `useAppShellState()` hook covering only UI toggles. Skip if time-constrained.

**Verify:** `npm run build` passes; app behavior unchanged.

**Commit (if done):** `refactor: split UI toggles into useAppShellState`

---

## Phase 3 — Reorganize `core/`

> **Prerequisite:** Phase 2 complete. Ownership is now clear; the folder split codifies it.

### 3.1 Target structure

```
frontend/src/core/
├── api/
│   ├── index.ts          (barrel re-export so old `from "../../core/api"` still works)
│   ├── request.ts        (shared fetch wrapper + error handling)
│   ├── auth.ts           (login, register, verify, password reset, account)
│   ├── documents.ts      (CRUD)
│   ├── preferences.ts
│   ├── billing.ts
│   ├── shares.ts
│   ├── ai.ts             (Tusk AI chat endpoint)
│   └── types.ts          (all response/request types)
├── hooks/
│   ├── useSession.ts
│   ├── useAppOrchestration.ts
│   ├── useWorkspaceHydration.ts
│   ├── useProjectVersioning.ts
│   ├── useCloudPreferenceSync.ts
│   ├── useFindReplaceModal.ts
│   ├── useAppStyle.ts
│   ├── useMenuState.ts
│   ├── useRouting.ts
│   ├── useNavigationHistory.ts
│   └── useTuskBilling.ts
├── utils/
│   ├── appearance.ts
│   ├── libraryUtils.ts
│   ├── markdown.ts
│   ├── projects.ts
│   ├── menu.ts
│   └── preferences.ts    (from Phase 2.4)
├── state/
│   ├── session.ts        (localStorage IO only)
│   └── versioning.ts     (snapshot logic only)
├── electron/
│   └── localWorkspace.ts
├── events/
│   └── editorEvents.ts
└── localFiles/           (unchanged — already cohesive)
```

### 3.2 Split `api.ts` (685 lines) first

Section boundaries verified against current file:
- L1–122: type definitions (`AuthResponse`, `DocumentRecord`, `TuskAiChatResponse`, `BillingStatus`, share types, etc.)
- L136–221: shared request helper + auth helpers (`resolveDefaultApiBase`, `isLikelyNetworkFailure`, generic `request()`)
- L223–395: auth endpoint functions
- L396–480: document endpoint functions
- L518–551: billing endpoint functions
- L553–685: share endpoint functions
- (preferences and AI calls are interleaved — locate by greping their function names before moving)

**Re-verify these boundaries against the actual file** before moving anything.

**Action:**
1. Create `frontend/src/core/api/` directory.
2. Create `request.ts` with the shared `request()` helper and any error classes.
3. Create `types.ts` with all response/request types.
4. Create one file per resource (`auth.ts`, `documents.ts`, `preferences.ts`, `billing.ts`, `shares.ts`, `ai.ts`), each importing from `./request` and `./types`.
5. Create `index.ts` that re-exports everything so existing `from "../../core/api"` imports keep working:
   ```ts
   export * from "./auth"
   export * from "./documents"
   export * from "./preferences"
   export * from "./billing"
   export * from "./shares"
   export * from "./ai"
   export * from "./types"
   ```
6. Delete the old `api.ts`.

**Verify:** `npm run build` passes. No import path changes elsewhere.

**Commit:** `refactor: split api.ts into per-resource modules`

---

### 3.3 Move hooks, utils, state, electron, events

For each remaining file in `core/`, decide its bucket and move it. Update imports as you go.

Move order (least-imported first):
1. `editorEvents.ts` → `events/`
2. `localWorkspace.ts` → `electron/`
3. `appearance.ts`, `libraryUtils.ts`, `markdown.ts`, `projects.ts`, `menu.ts`, `preferences.ts` → `utils/`
4. `session.ts`, `versioning.ts` → `state/`
5. All `use*.ts` files → `hooks/`

**Commit per bucket** (5 commits): `refactor: move <bucket> files into core/<bucket>/`

---

## Phase 4 — Editor extraction pass

> **Prerequisite:** Phases 2 + 3 complete.

### 4.1 Shared editor lifecycle hooks (Drafting + Typewriter)

Three duplicated patterns:

| Pattern | DraftingEditor lines | TypewriterEditor lines |
|---|---|---|
| Content-sync on doc switch | 337–352 | 789–795 |
| `setEditable(!readOnly)` with try/catch | 354–362 | 797–806 |
| `onEditorReady` lifecycle | 364–378 | 808–823 |

**Action:**
1. Create `frontend/src/webapp/components/editor/hooks/useEditorReadOnly.ts`, `useEditorReady.ts`, `useEditorContentSync.ts`.
2. Copy logic verbatim — pure mechanical extraction. Preserve the existing try/catch behavior.
3. Replace inline blocks in both editors with hook calls.

**Verify:** Switch between projects, toggle read-only, confirm identical behavior.

**Commit:** `refactor: extract shared editor lifecycle hooks`

---

### 4.2 Extract paste normalization

**Confirmed duplication:**
- `TypewriterEditor.tsx:285–329`
- `DraftingEditor.tsx:202–254`

**Action:**
1. Diff the two `normalizePastedFormatting` implementations. If not byte-identical, STOP and report.
2. Create `frontend/src/webapp/components/editor/utils/pasteNormalization.ts`. Export `normalizePastedFormatting`, `isBold`, `isItalic`, `isUnderline`.
3. Import in both editors; delete locals.

**Verify:** Paste rich text from Google Docs and Word into both editors — formatting normalization unchanged.

**Commit:** `refactor: extract paste normalization to shared util`

---

### 4.3 Centralize word counting

**Status:** Partially shared. `countWords` is exported from `core/markdown.ts:86`; Drafting and Markdown import it; Typewriter has a local copy at line 332.

**Also:** `emitWordCounts` pattern (compute documentWordCount + selectedWordCount on edit/selection) is open-coded in Drafting (294–304), Typewriter (~768–770, 840–842), and Markdown (40–51).

**Action:**
1. In `TypewriterEditor.tsx:332-334`, delete the local `countWords` and import from `core/markdown`.
2. Create `frontend/src/webapp/components/editor/utils/wordCount.ts` exporting `emitWordCounts(editor, onWordCountChange)` — a helper that wires up the same selection-change + content-change listeners all three editors install.
3. Replace the inline blocks in all three editors.

**Verify:** Word-count badge in editor footer reads the same as before on a known document.

**Commit:** `refactor: centralize word count emit logic`

---

### 4.4 Break up `TypewriterEditor.tsx` (1,836 lines) — five sub-commits

Verified section boundaries (line ranges current as of May 2026):

| Sub-phase | Extract | To file | Lines |
|---|---|---|---|
| 4.4.a | FontSize, ParaIndent, Columns extensions | `editor/extensions/typewriter/{fontSize,paraIndent,columns}.ts` | 105–270 (~165) |
| 4.4.b | Page-break extension + helpers | `editor/extensions/typewriter/pageBreak.ts` | 336–602 (~265) |
| 4.4.c | Toolbar UI (floating toolbar with font menus, alignment, columns, paint roller) | `editor/ui/TypewriterToolbar.tsx` | 1524–1836 (~310) |
| 4.4.d | Ruler drag logic + margin handles | `editor/hooks/useRulerDrag.ts` | 642–657 + ruler render at 1350–1465 (~170) |
| 4.4.e | Margin load/save (`loadMargins`, `saveMargins`, geometry constants) | `editor/utils/typewriterMargins.ts` | 26–103 (~80) |

**Per sub-phase:**
- Move the code, update imports, **do not refactor logic** — pure mechanical extraction.
- Run the editor, type, change a margin, drag the ruler. Behavior must be identical.
- Commit before moving to the next.

**Target end state:** `TypewriterEditor.tsx` is ~400 lines — component shell + composition.

**Commits (5):** `refactor: extract <thing> from TypewriterEditor`

---

### 4.5 Break up `Editor.tsx` (1,475 lines) — NEW

**Status:** Wasn't in the old plan. Now the second-largest file.

`Editor.tsx` currently dispatches between four editors and also owns:
- TuskAI state + accept/reject flow (≈ lines 370–600)
- Spell-check word add/remove + dictionary persistence (lines 50–80 + handlers)
- Find/replace modal wiring
- Export modal wiring
- Cross-page navigation (Library/Archive/Recent/Trash render from inside Editor.tsx — lines 41–44 import these views)

**Action (4 sub-commits):**
1. **Extract TuskAI orchestration** into `editor/hooks/useTuskAiSession.ts` — owns proposed-edit state, hunk acceptance, diff building. ~250 lines out.
2. **Extract spell-check dictionary hook** into `editor/hooks/useSpellCheckDictionary.ts` — owns localStorage + native add/remove word. ~120 lines out.
3. **Extract editor dispatch** into `editor/EditorSwitch.tsx` — pure component that takes `activeDocumentType` + `activeViewMode` and renders the right editor. ~200 lines out.
4. **Decide:** does `Editor.tsx` really need to import `Library`, `Archive`, `Recent`, `Trash` (lines 41–44)? If routing is happening one level up (`App.tsx`), those imports are dead weight. Verify and remove.

**Target end state:** `Editor.tsx` is ~600 lines — page shell only.

**Commits (4):** `refactor: extract <thing> from Editor.tsx`

---

### 4.6 PinboardEditor (830 lines) — NEW

**Status:** Wasn't in the old plan.

`PinboardEditor.tsx` is its own editor with marquee selection, drag, pin cards, etc. Pre-Phase 1.3 audit: it likely shares marquee/drag logic with the navigation panels.

**Action:**
1. Read the file. Identify sections (probably: pin card component, marquee/drag handlers, persistence).
2. If `useMarqueeSelection` from Phase 1.3 covers its marquee, refactor PinboardEditor to use it.
3. Split per-section as in 4.4 if it's still >500 lines after sharing.

If under 500 lines after sharing, leave it.

**Commits:** `refactor: <thing> in PinboardEditor`

---

### 4.7 (Optional) Split DraftingEditor's mega-`useEffect`

`DraftingEditor.tsx:399-605` is a 200-line `useEffect` registering listeners for `EDITOR_COMMAND_EVENT`, `EDITOR_FONT_SIZE_CHANGE_EVENT`, etc. Split into focused hooks:
- `useEditorCommandBus(editor)`
- `useEditorTypographyEvents(editor)`
- `useProjectSearchFocus()`

Skip if low on energy — Drafting is only 823 lines.

---

## Phase 5 — Page-level consolidation

### 5.1 Extract `ProjectListPage`

**Status:** Same problem as before — Archive, Recent, Trash still ~90% identical.

- `frontend/src/webapp/pages/Archive.tsx` (148 lines)
- `frontend/src/webapp/pages/Recent.tsx` (149 lines)
- `frontend/src/webapp/pages/Trash.tsx` (226 lines — only difference is shred-confirmation modal at 197–224)

Plus `Library.tsx` duplicates the `handleProjectContextMenu` callback shape.

**Action:**
1. Create `frontend/src/webapp/pages/ProjectListPage.tsx` with props:
   ```ts
   type ProjectListPageProps = {
     title: string
     icon: React.ComponentType
     emptyState: React.ReactNode
     filterFn: (p: Project) => boolean
     sortField: (p: Project) => Date | string | number
     buildActions: (projectId: string) => ContextMenuAction[]
     extraModal?: React.ReactNode  // for Trash's shred dialog
   }
   ```
2. Move shared markup (marquee rectangle, header, ViewToggle, ProjectListView) into the new component.
3. Rewrite Archive.tsx, Recent.tsx, Trash.tsx as thin configs (~50–80 lines each).
4. `Library.tsx` stays mostly separate (has folder navigation, share request list, drag — different shape).

**Verify:**
- Each page renders the same items, in the same order, with the same context-menu actions.
- Archive/restore round-trip works.
- Trash shred confirmation still appears (via `extraModal`).

**Commit:** `refactor: extract ProjectListPage; collapse Archive/Recent/Trash`

---

### 5.2 Rename `AppShell` → `EditorWorkspace` and relocate

**Status:** Names are still inverted:
- `layout/AppLayout.tsx` (100 lines) is the actual root.
- `layout/AppShell.tsx` (772 lines) is editor-page-specific.

**Action:**
1. Rename `AppShell.tsx` → `EditorWorkspace.tsx`. Move to `frontend/src/webapp/components/editor/EditorWorkspace.tsx`.
2. Update the import in `Editor.tsx` (currently `import AppShell from "../components/layout/AppShell"`).
3. Search for any other `AppShell` references: `grep -rn "AppShell" frontend/src`.
4. Update the corresponding CSS file if it exists (there isn't a separate one currently — styles are inline in component CSS imports).

**Verify:** Editor page renders identically; no broken imports.

**Commit:** `refactor: rename AppShell to EditorWorkspace and relocate`

---

### 5.3 Merge Button + GhostButton (low-priority polish)

**Status:** Confirmed `GhostButton` is imported in only ~1–2 places (primarily Modal). Worth merging.

**Action:**
1. Audit `Button.tsx` (26 lines) and `GhostButton.tsx` (37 lines).
2. Add a `"ghost"` variant to `Button`.
3. Replace usages. Delete `GhostButton.tsx`.

**Verify:** Buttons in modals + ghost icon buttons still render correctly.

**Commit:** `refactor: merge GhostButton into Button with variants`

---

### 5.4 Break up `AccountSettings.tsx` (651 lines) and `ShareDialog.tsx` (554 lines) — NEW

**Status:** New phase. Both are >500-line single-file components doing too many things.

**`AccountSettings.tsx` (651 lines)** — covers profile editing, password change, email change, account deletion. Each of these is independently testable.

**Action:**
1. Split into four sub-panels under `settings/account/`:
   - `ProfileSection.tsx` (first name, last name)
   - `EmailSection.tsx` (email change + verification challenge)
   - `PasswordSection.tsx` (password change)
   - `AccountDeletionSection.tsx` (deletion challenge + confirm)
2. `AccountSettings.tsx` becomes a shell that composes the four sections.

**Target:** each sub-panel ≤200 lines.

**Commit:** `refactor: split AccountSettings into per-concern sections`

---

**`ShareDialog.tsx` (554 lines)** — covers invite by email, manage existing shares, transfer ownership, leave share, pending requests. Multiple concerns.

**Action:**
1. Split into sub-components under `settings/share/`:
   - `ShareInviteForm.tsx`
   - `ShareList.tsx` (existing collaborators with permission edit/revoke)
   - `TransferOwnershipForm.tsx`
   - `PendingRequestList.tsx`
2. `ShareDialog.tsx` becomes the modal shell composing them.

**Target:** each sub-component ≤150 lines.

**Commit:** `refactor: split ShareDialog into focused sub-components`

---

## Phase 6 — Backend extraction

> Independent of frontend phases — can run in parallel after Phase 0.

### 6.1 Extract auth services from `routes/auth.js` (820 lines)

**Inline helpers** (still inline as of audit):
- `issueVerificationCode()` (~line 141)
- `issueAccountDeletionChallenge()` (~line 149)
- `issuePasswordResetToken()` (~line 161)
- Email change challenge parse logic (~line 116)

**Action:**
1. Create `backend/src/services/tokenIssuer.js`:
   ```js
   export async function issueVerificationCode(user, { mailer, db }) { ... }
   export async function issuePasswordResetToken(user, { mailer, db }) { ... }
   export async function issueAccountDeletionChallenge(user, { mailer, db }) { ... }
   export async function issueEmailChangeChallenge(user, newEmail, { mailer, db }) { ... }
   ```
2. Create `backend/src/services/challengeParser.js` for `parseEmailChangeChallenge()` (currently inline ~L116).
3. Extract authorization helpers — ownership/share-access checks duplicated in `documents.js:40-43, 73-76` and `shares.js:18-24, 122-128`. Move into `backend/src/services/authorization.js` (`assertDocumentOwner`, `assertCanEditDocument`).
4. Replace inline logic in `auth.js`, `documents.js`, `shares.js`.

**Target:** `auth.js` ≤ 500 lines, route handlers only.

**Verify:**
- Register a new user → email goes out.
- Request password reset → email goes out, token works.
- Request email change → challenge issued, both addresses confirm.
- Document access still gated correctly (owner + accepted shares can edit; rejected can't).

**Commit:** `refactor: extract auth and authorization services`

---

### 6.2 Extract AI prompt builder from `routes/ai.js` (802 lines)

**Sections to extract:**
- Tab selection scoring (L72–97)
- Context gathering (L104–116)
- Instruction prompt assembly (L263–362)
- Tokenization helpers (L37–44)
- Model edit normalization (L209–261)
- Provider fallback wrapper `callWithModerationFallback` (L526–561)

**Action:**
1. Create `backend/src/services/promptBuilder.js`:
   ```js
   export function selectRelevantTabs(project, userMessage) { ... }
   export function gatherProjectContext(project) { ... }
   export function buildInstructionPrompt({ provider, modelName, mode, context, userMessage }) { ... }
   export function normalizeModelEdits(rawResponse, availableTabsById) { ... }
   ```
2. Create `backend/src/services/tokenizer.js`.
3. Create `backend/src/services/aiProviders.js` for the Claude/Grok/OpenAI fallback wrapper.
4. `ai.js` should retain only: route handler, validation, calls into services, error response shaping.

**Target:** `ai.js` ≤ 400 lines.

**Verify:**
- Send an AI chat message — response identical for the same input.
- Trigger an AI edit proposal — diff payload identical.

**Commit:** `refactor: extract AI prompt building and provider routing into services`

---

### 6.3 Extract billing service

**Status:** Not in the old plan. `routes/billing.js` (245 lines) inlines `activateTuskAiFromSession()` (L36) and Stripe webhook state mutations.

**Action:**
1. Create `backend/src/services/billing.js` with `activateTuskAiFromSession`, `recordPurchase`, etc.
2. `routes/billing.js` keeps Stripe webhook validation + dispatch to service.

**Target:** `billing.js` ≤ 100 lines.

**Verify:** Stripe checkout completion still grants Tusk AI access.

**Commit:** `refactor: extract billing service from routes/billing`

---

### 6.4 Document backend conventions

After 6.1–6.3, write `backend/CONVENTIONS.md` documenting:
- Routes contain handlers + input validation only.
- Business logic and side-effects live in `services/`.
- Models are Sequelize definitions only — no methods that hit the network.
- Authorization is centralized in `services/authorization.js`; never re-check ownership inline.

**Commit:** `docs: backend layering conventions`

---

## Phase 7 — Cosmetic / low-priority

These don't block anything; pick them up if time allows.

### 7.1 Split `Home.css` (≈2,080 lines)

Currently bundles landing-page rules + duplicates `.app-brand` / `.marquee-text` selectors that already exist in `App.css:233-320`.

**Note:** The duplication audit (Q10) found that `Home.css` doesn't redefine the base classes, only references `.app-brand__name` / `__tagline`. Re-verify before deleting anything.

**Action:**
1. If `Home.css` redefines base classes, delete those rules.
2. Move `.auth-gateway__library-*` rules to `frontend/src/landing/pages/LibraryPreview.css` (new file).
3. Move `.auth-gateway__canvas-*` rules to `frontend/src/landing/pages/EditorPreview.css` (new file).
4. Import the new CSS files from the corresponding `.tsx` files.

**Target:** `Home.css` ≤ 800 lines.

**Verify:** Landing page pixel-identical to before.

**Commit:** `refactor: split Home.css into per-component landing styles`

---

### 7.2 Rename `spellcheck.ts` → `spellCheck.ts`

The only lowercase TypeScript file in the editor directory. Inconsistent with `useTypingCaret.ts`, `useMarqueeSelection.ts`, etc.

**Action:** Rename, update imports in `SpellCheckModal.tsx` and `Editor.tsx`.

**Commit:** `refactor: rename spellcheck.ts for consistent casing`

---

### 7.3 Document the frontend↔backend type contract

`core/api/types.ts` (post-Phase 3.2) mirrors Sequelize models by hand. Add to each interface:

```ts
/**
 * Mirror of backend/src/models/document.js
 * Update both when changing the shape.
 */
export interface DocumentRecord { ... }
```

Or, more ambitious: set up a shared `types/` package at the monorepo root that both `frontend/` and `backend/` import from. Skip unless committing to a monorepo workflow.

---

### 7.4 Local-files codec base abstraction (skip unless adding a 4th codec)

`core/localFiles/codecBook.ts`, `codecPinboard.ts`, `codecSlideshow.ts` share structure but aren't worth abstracting unless adding a fourth. Skip.

---

## Final verification

After all phases:

1. **LOC delta:** Re-run the LOC count from Phase 0; expect ~2,500–3,500 lines reduction.
2. **Build:** `cd frontend && npm run build && cd ../backend && node -e "require('./src/server.js')"` — both clean.
3. **Smoke test checklist:**
   - [ ] Login / logout / register / verify email
   - [ ] Password reset flow end-to-end
   - [ ] Email change flow end-to-end
   - [ ] Account deletion challenge + confirm
   - [ ] Create new project (each editor type: drafting, typewriter, markdown, pinboard)
   - [ ] Open / edit / save / version-restore an existing project
   - [ ] Share a project, accept, transfer ownership, leave share
   - [ ] Archive → restore round-trip
   - [ ] Trash → shred round-trip (with typing confirmation)
   - [ ] Recent page lists correctly
   - [ ] Library folders expand/collapse, drag-and-drop
   - [ ] AI chat + AI edit proposal accept/reject hunks individually + accept-all
   - [ ] Export to DOCX, PDF, Markdown, TXT — all four download correctly with sane slugs
   - [ ] Find/replace
   - [ ] Spell check (add to dictionary, remove, native + custom)
   - [ ] Settings: account, appearance, project, global, workspace, billing
   - [ ] Electron build still launches (`npm run dev:electron`)
   - [ ] Electron local-file mode (save/load to `~/Documents/Ivoryscribe`) works
4. **Git log:** `git log --oneline refactor/cleanup-pass-v2` — clean, atomic, reviewable commits.

---

## Out-of-scope (do not touch this pass)

- Feature additions
- Test coverage improvements (separate effort)
- Dependency upgrades
- Performance work
- `dist/`, `dist-electron/`, `node_modules/`
- `ProjectBrowserPanel.tsx` (821) and `DocumentTabsPanel.tsx` (606) — large but cohesive; revisit only if Phase 1.3 surfaces issues
- `versioning.ts` (758) — already pure logic; no win from splitting
- `useLocalFilesystemSync.ts` (527) — single concern (filesystem watcher), leave alone
- `AppearanceSettings.tsx` (523), `GlobalSettings.tsx` (548) — large but cohesive (lots of form fields); revisit only if patterns emerge

If you find bugs, they go in `REFACTOR_FOLLOWUPS.md` for a later pass — **not this branch**.

---

## Quick reference: every change at a glance

| Phase | Change | Risk | Est. time |
|---|---|---|---|
| 1.1 | Dedupe emoji helpers in ProjectSettings | None | 5 min |
| 1.2 | Extract `exportUtils.ts` | Low | 30 min |
| 1.3 | Relocate misfiled drag/marquee hooks | Low | 15 min |
| 1.4 | Mark `sync.js` deprecated | None | 5 min |
| 1.5 | Delete `useViewTransition.ts` | None | 2 min |
| 1.6 | Strip TuskAI debug logs in Editor.tsx | None | 10 min |
| 2.1 | Document state ownership | None | 30 min |
| 2.2 | Callback-based useProjectVersioning | Medium | 1 hr |
| 2.3 | Typed mutators for useWorkspaceHydration | **High** | 2–3 hr |
| 2.4 | Shared applyPreferences | Low | 45 min |
| 2.5 | (Optional) split UI toggles | Low | 1 hr |
| 3.2 | Split `api.ts` per resource | Low | 1 hr |
| 3.3 | Move files into bucketed `core/` | Low | 1–2 hr |
| 4.1 | Shared editor lifecycle hooks | Low | 30 min |
| 4.2 | Extract paste normalization | Low | 20 min |
| 4.3 | Centralize word count | Low | 20 min |
| 4.4 | Break up TypewriterEditor (5 sub-phases) | Medium | 3–4 hr |
| 4.5 | Break up Editor.tsx (4 sub-phases) | Medium | 2–3 hr |
| 4.6 | PinboardEditor cleanup | Medium | 1–2 hr |
| 4.7 | (Optional) split DraftingEditor effects | Low | 1 hr |
| 5.1 | `ProjectListPage` extraction | Medium | 2 hr |
| 5.2 | Rename AppShell → EditorWorkspace | Low | 15 min |
| 5.3 | Merge Button + GhostButton | Low | 30 min |
| 5.4 | Split AccountSettings + ShareDialog | Medium | 2 hr |
| 6.1 | Extract auth + authorization services | Medium | 1–2 hr |
| 6.2 | Extract AI prompt builder + provider routing | Medium | 1–2 hr |
| 6.3 | Extract billing service | Low | 45 min |
| 7.x | Cosmetic cleanups | None | 1–2 hr |

**Total estimated effort:** 25–35 hours, spread across ~35 atomic commits.
