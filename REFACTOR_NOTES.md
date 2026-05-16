# Refactor Notes — Phase 2 State-Ownership Audit

> Snapshot of the current write paths through `frontend/src/core/`, captured before Phase 2 changes.
> This is the contract for the rest of the phase — if reality diverges, update this file first.

## State ownership table

| State | `useState` owner | External writers (current) | Reads from |
|---|---|---|---|
| `projects: Project[]` | `useAppOrchestration.ts:34` | `useWorkspaceHydration` (5 sites: L267, 332, 400, 593, 694), `useProjectVersioning` (2 sites: L158, 187), `useLocalFilesystemSync` (passed as `setProjects` prop) | `Library`, `Editor`, `Archive`, `Recent`, `Trash`, `useFindReplaceModal`, every editor |
| `folders: ProjectFolder[]` | `useAppOrchestration.ts:35` | `useWorkspaceHydration:270`, `useLocalFilesystemSync` | `Library`, `ProjectBrowserPanel` |
| `activeProjectId: string \| null` | `useAppOrchestration.ts:36` | `useWorkspaceHydration:277, 336`, `useProjectVersioning:173, 209`, `useLocalFilesystemSync`, `useRouting`-driven effect at orchestrator L296 | `Editor`, `AppShell` |
| `view: "projects" \| "editor"` | `useAppOrchestration.ts:37` | `useWorkspaceHydration:280` (always sets to "projects" on hydrate), `useProjectVersioning:174, 210`, orchestrator's onLogin/onLogout callbacks | `App.tsx`, routing |
| `bookCounter: number` | `useAppOrchestration.ts:38` | `useWorkspaceHydration:306, 338` | counter for "Book N" project names |
| `isSettingsOpen: boolean` | `useAppOrchestration.ts:39` | (orchestrator only) | settings modal |
| `isMenuBarEnabled` | `useAppOrchestration.ts:40` | `useWorkspaceHydration:281`, `useCloudPreferenceSync:121`, orchestrator | top menu visibility |
| `isFlagsEnabled` | `useAppOrchestration.ts:41` | `useWorkspaceHydration:282`, `useCloudPreferenceSync:122`, orchestrator | flag rail visibility |
| `isTranslucentNavPanel` | `useAppOrchestration.ts:42` | `useWorkspaceHydration:283`, `useCloudPreferenceSync:123`, orchestrator | nav panel theme |
| `isEditorTyping` | `useAppOrchestration.ts:43` | (orchestrator only, via editor callback) | caret overlay |
| `isWorkspaceHydrated` | `useAppOrchestration.ts:44` | `useWorkspaceHydration:321, 339`, `useLocalFilesystemSync` | gates polling, autosave, sync |
| `projectDocumentMap: Record<string,string>` | `useAppOrchestration.ts:45` | `useWorkspaceHydration:268, 333, 438, 571, 620, 695`, `useProjectVersioning:98, 106`, orchestrator | cloud-id lookup |
| `pendingShareRequests` | `useAppOrchestration.ts:46` | `useWorkspaceHydration:257, 259`, orchestrator share handlers | share request list |
| `isAuthOverlayOpen` | `useAppOrchestration.ts:199` | (orchestrator only) | sign-in overlay |
| `session: UserSession \| null` | `useSession.ts` state | **`useWorkspaceHydration:327` calls `setSession(null)` directly on 401** | every auth-gated feature |
| `palette`, `customPaletteBackground`, `customPaletteAccent`, `displayFont`, `bodyFont`, `uiFont`, `fontSize`, `isWordCountEnabled` | `useAppStyle.ts` state | `useWorkspaceHydration` (8 setters), `useCloudPreferenceSync` (8 setters), orchestrator onLogout, settings UI | global CSS + per-editor |
| `projectVersionsByProjectId` | `useProjectVersioning.ts:58` | `useWorkspaceHydration:269` (re-applies on hydrate), `useProjectVersioning` internal | settings version list |

## Things that need to change in Phase 2

### 2.2 — `useProjectVersioning` callback-based
Currently receives raw setters (`setProjects`, `setActiveProjectId`, `setView`) and reaches into orchestrator state directly. Replace with high-level callbacks:
- `onRestoreVersion(projectId: string, snapshot: Project): boolean` — orchestrator owns the merge logic (replace project, set active, switch view)
- `onDuplicateVersion(snapshot: Project): { newProjectId: string } | null` — orchestrator owns the dedupe-name + insert logic

After: `useProjectVersioning` no longer needs `projects`, `setProjects`, `setActiveProjectId`, `setView`, or the `viewRef`/`activeProjectRef` (the orchestrator can read its own refs).

### 2.3 — Typed mutators for `useWorkspaceHydration`
Currently receives 30+ individual props (setters + value reads + refs). Group the setters into a single `mutators` object with semantic names:
- `applyHydratedWorkspace({ projects, folders, activeProjectId, ... })` — single call replaces 10+ setter calls during hydration
- `applyHydratedPreferences({ palette, fonts, ui })` — preference application (shared with Phase 2.4)
- `onAuthFailure()` — replaces direct `setSession(null) + setSessionInStorage(null)`. Orchestrator wires to `logout()`.
- `markHydrated()` — replaces `setIsWorkspaceHydrated(true)`
- `applyRemoteProjectUpdates(updates)` — replaces the polling-loop and sync-loop `setProjects((current) => ...)`

This is the biggest structural change in Phase 2. Approach: do it in one commit since splitting halfway leaves the hook with two different prop shapes.

### 2.4 — Shared `applyPreferences`
Both `useWorkspaceHydration:285-306` and `useCloudPreferenceSync:94-140` independently:
- Read `prefs.theme`, `prefs.editorSettings`, `prefs.uiSettings`
- Resolve palette + fonts + UI booleans
- Apply via setters
- Trigger `requestEditorFontFamilyChange(bodyFont)`

Extract `applyPreferences(prefs, prefMutators)` into `core/preferences.ts`. Both hooks call it. Saves ~70 duplicate LOC and ensures the two paths stay aligned.

### 2.5 (optional) — Split UI toggles
`useAppOrchestration` is 632 lines with 14 `useState`. The domain state (`projects`, `folders`, `activeProjectId`, `projectDocumentMap`, `pendingShareRequests`, `bookCounter`) belongs in the orchestrator. The UI toggles (`isSettingsOpen`, `isMenuBarEnabled`, `isFlagsEnabled`, `isTranslucentNavPanel`, `isEditorTyping`, `isAuthOverlayOpen`) could move into a separate `useAppShellState` hook. Skip if time-constrained.

## Risks

- `setIsWorkspaceHydrated(true)` is called from two hooks (cloud + local). Make sure the orchestrator's gating effects (`isWorkspaceHydrated && ...`) still trigger correctly after the refactor.
- The hydration flow has a known race: `setView("projects")` at L280 can fight an `onLogin` callback that also sets the view. After Phase 2.3, the routing should be: hydration emits `applyHydratedWorkspace`, which lands view=projects; the onLogin callback fires once and is idempotent.
- `useProjectVersioning` is registered to a `message` event listener (L301). Make sure the callback refs are stable across renders so the listener doesn't see stale callbacks.
