import { useCallback, useMemo, useRef, useState } from "react"
import type { Editor as TiptapEditor } from "@tiptap/react"
import { buildDiff, renderDiffHtml, type HunkState } from "../../ai/diffBuilder"
import type { ProposedEdit } from "../../ai/proposedEditsTypes"
import type { Project } from "../../../../core/utils/projects"

type UseProposedEditReviewArgs = {
  project: Project | null
  activeContent: string
  onProjectChange: (updater: (project: Project) => Project) => void
}

export function useProposedEditReview({ project, activeContent, onProjectChange }: UseProposedEditReviewArgs) {
  const [proposedEdits, setProposedEdits] = useState<ProposedEdit[]>([])
  const [tiptapEditor, setTiptapEditor] = useState<TiptapEditor | null>(null)
  const editorStageRef = useRef<HTMLDivElement | null>(null)

  const currentEdit = useMemo(() => {
    if (!project?.activeId) return null
    return (
      proposedEdits.find(
        (edit) => edit.state === "pending" && edit.tabId === project.activeId,
      ) ?? null
    )
  }, [proposedEdits, project?.activeId])

  const isEditOnActiveTab = currentEdit !== null

  const pendingHunkCount = useMemo(() => {
    let count = 0
    for (const edit of proposedEdits) {
      if (edit.state !== "pending" || !edit.hunks) continue
      for (const hunk of edit.hunks) {
        if (hunk.state === "pending") count += 1
      }
    }
    return count
  }, [proposedEdits])

  const pendingEditTabIds = useMemo(() => {
    const ids = new Set<string>()
    for (const edit of proposedEdits) {
      if (edit.state !== "pending" || !edit.hunks) continue
      const hasPending = edit.hunks.some((hunk) => hunk.state === "pending")
      if (hasPending) ids.add(edit.tabId)
    }
    return ids
  }, [proposedEdits])

  const handleEditorReady = useCallback((instance: TiptapEditor | null) => {
    setTiptapEditor(instance)
  }, [])

  const handleProposedEdits = useCallback((edits: ProposedEdit[]) => {
    const usable: ProposedEdit[] = []
    let dropped = 0
    let hunkCount = 0
    const tabIds = new Set<string>()
    const newTabsToCreate: ProposedEdit[] = []

    for (const edit of edits) {
      const { blocks, hunks } = buildDiff(edit.before, edit.after)
      if (blocks.length === 0 || hunks.length === 0) {
        dropped += 1
        console.warn("[tuskai] dropping empty-diff edit", {
          tabId: edit.tabId,
          tabTitle: edit.tabTitle,
          isNew: edit.isNew ?? false,
          beforeSample: (edit.before ?? "").slice(0, 160),
          afterSample: (edit.after ?? "").slice(0, 160),
        })
        continue
      }
      usable.push({ ...edit, blocks, hunks })
      hunkCount += hunks.length
      tabIds.add(edit.tabId)
      if (edit.isNew) newTabsToCreate.push(edit)
    }

    const landingTabId = usable[0]?.tabId ?? null
    if (newTabsToCreate.length > 0 || landingTabId) {
      onProjectChange((p) => {
        let nextTabs = p.tabs
        let nextContentById = p.contentById
        for (const edit of newTabsToCreate) {
          if (nextContentById[edit.tabId] !== undefined) continue
          const newTab = { id: edit.tabId, title: edit.tabTitle, children: [] }
          nextTabs = [...nextTabs, newTab]
          nextContentById = { ...nextContentById, [edit.tabId]: "" }
        }
        const nextActiveId = newTabsToCreate[0]?.tabId ?? landingTabId ?? p.activeId
        return {
          ...p,
          tabs: nextTabs,
          contentById: nextContentById,
          activeId: nextActiveId,
        }
      })
    }

    setProposedEdits(usable)
    return { applied: usable.length, dropped, hunkCount, tabCount: tabIds.size }
  }, [onProjectChange])

  const currentEditDiffContent = useMemo(() => {
    if (!currentEdit?.blocks || !currentEdit.hunks) return null
    const states = new Map<string, HunkState>()
    for (const hunk of currentEdit.hunks) states.set(hunk.id, hunk.state)
    return renderDiffHtml(currentEdit.blocks, states)
  }, [currentEdit])

  const editorContentForActiveTab = isEditOnActiveTab && currentEditDiffContent
    ? currentEditDiffContent
    : activeContent

  const handleHunkDecision = useCallback(
    (hunkId: string, decision: "accepted" | "rejected") => {
      const activeTabId = project?.activeId ?? null
      const target = proposedEdits.find(
        (edit) =>
          edit.state === "pending" &&
          edit.tabId === activeTabId &&
          edit.hunks?.some((hunk) => hunk.id === hunkId),
      )
      if (!target?.blocks || !target.hunks) {
        console.warn("[tuskai] hunk decision ignored — no matching edit", {
          hunkId,
          decision,
          activeTabId,
          pendingEdits: proposedEdits
            .filter((e) => e.state === "pending")
            .map((e) => ({ id: e.id, tabId: e.tabId, tabTitle: e.tabTitle, hunkIds: e.hunks?.map((h) => h.id) ?? [] })),
        })
        return
      }

      const nextHunks = target.hunks.map((hunk) =>
        hunk.id === hunkId ? { ...hunk, state: decision } : hunk,
      )
      const allResolved = nextHunks.every((hunk) => hunk.state !== "pending")

      if (allResolved) {
        const states = new Map<string, HunkState>()
        for (const hunk of nextHunks) states.set(hunk.id, hunk.state)
        const finalHtml = renderDiffHtml(target.blocks, states)
        const allRejected = nextHunks.every((hunk) => hunk.state === "rejected")

        if (target.isNew && allRejected) {
          onProjectChange((p) => {
            const nextContentById = { ...p.contentById }
            delete nextContentById[target.tabId]
            return {
              ...p,
              tabs: p.tabs.filter((tab) => tab.id !== target.tabId),
              contentById: nextContentById,
              activeId: p.activeId === target.tabId ? (p.tabs[0]?.id ?? null) : p.activeId,
            }
          })
        } else {
          onProjectChange((p) => ({
            ...p,
            contentById: { ...p.contentById, [target.tabId]: finalHtml },
          }))
        }
      }

      setProposedEdits((current) =>
        current.map((edit) => {
          if (edit.id !== target.id) return edit
          return {
            ...edit,
            hunks: nextHunks,
            ...(allResolved ? { state: "accepted" as const } : {}),
          }
        }),
      )
    },
    [project?.activeId, proposedEdits, onProjectChange],
  )

  const handleAcceptAllPendingHunks = useCallback(() => {
    const pendingEdits = proposedEdits.filter(
      (edit) => edit.state === "pending" && edit.blocks && edit.hunks,
    )
    if (pendingEdits.length === 0) return

    const finalsByTabId = new Map<string, string>()
    for (const edit of pendingEdits) {
      const nextHunks = edit.hunks!.map((hunk) =>
        hunk.state === "pending" ? { ...hunk, state: "accepted" as const } : hunk,
      )
      const states = new Map<string, HunkState>()
      for (const hunk of nextHunks) states.set(hunk.id, hunk.state)
      finalsByTabId.set(edit.tabId, renderDiffHtml(edit.blocks!, states))
    }

    onProjectChange((p) => {
      let nextContentById = p.contentById
      for (const [tabId, finalHtml] of finalsByTabId) {
        nextContentById = { ...nextContentById, [tabId]: finalHtml }
      }
      return { ...p, contentById: nextContentById }
    })

    setProposedEdits((current) =>
      current.map((edit) => {
        if (edit.state !== "pending" || !edit.hunks) return edit
        const acceptedHunks = edit.hunks.map((hunk) =>
          hunk.state === "pending" ? { ...hunk, state: "accepted" as const } : hunk,
        )
        return { ...edit, hunks: acceptedHunks, state: "accepted" as const }
      }),
    )
  }, [proposedEdits, onProjectChange])

  const handleRejectAllProposedEdits = useCallback(() => {
    const newTabIdsToRemove = new Set<string>()
    for (const edit of proposedEdits) {
      if (edit.isNew && edit.state === "pending") {
        newTabIdsToRemove.add(edit.tabId)
      }
    }
    if (newTabIdsToRemove.size > 0) {
      onProjectChange((p) => {
        const nextContentById = { ...p.contentById }
        for (const id of newTabIdsToRemove) delete nextContentById[id]
        const nextTabs = p.tabs.filter((tab) => !newTabIdsToRemove.has(tab.id))
        return {
          ...p,
          tabs: nextTabs,
          contentById: nextContentById,
          activeId: newTabIdsToRemove.has(p.activeId ?? "")
            ? (nextTabs[0]?.id ?? null)
            : p.activeId,
        }
      })
    }
    setProposedEdits([])
  }, [proposedEdits, onProjectChange])

  return {
    tiptapEditor,
    editorStageRef,
    currentEdit,
    isEditOnActiveTab,
    pendingHunkCount,
    pendingEditTabIds,
    editorContentForActiveTab,
    handleEditorReady,
    handleProposedEdits,
    handleHunkDecision,
    handleAcceptAllPendingHunks,
    handleRejectAllProposedEdits,
  }
}
