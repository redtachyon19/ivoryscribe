import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"
import type { Project } from "../../../core/utils/projects"
import type { ProjectFolder } from "../../pages/Library"
import useMarqueeSelection from "../shared/hooks/useMarqueeSelection"
import { handleSectionDragStart } from "./useSectionDrop"

type MultiSelectDrag = {
  handleProjectDragStart: (id: string, e: React.DragEvent<HTMLElement>) => void
  handleProjectDragEnd: () => void
  handleCardDrop: (target: Project) => (e: React.DragEvent<HTMLElement>) => void
  handleFolderItemDrop: (folder: ProjectFolder) => (e: React.DragEvent<HTMLElement>) => void
  handleRootDrop: (pos: "top" | "bottom") => (e: React.DragEvent<HTMLElement>) => void
  draggingProjectId: string | null
}

type UseMultiSelectOptions = {
  onDeleteSelection: (ids: Set<string>) => void
  drag?: MultiSelectDrag
  folderIds?: Set<string>
  setProjects?: Dispatch<SetStateAction<Project[]>>
}

export default function useMultiSelect({
  onDeleteSelection,
  drag,
  folderIds = new Set(),
  setProjects,
}: UseMultiSelectOptions) {
  const [marqueeSelectedIds, setMarqueeSelectedIds] = useState<Set<string>>(new Set())
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)

  const getItemRects = useCallback(() => {
    const map = new Map<string, DOMRect>()
    const container = scrollContainerRef.current
    if (!container) return map
    for (const el of container.querySelectorAll("[data-selectable-id]")) {
      const id = el.getAttribute("data-selectable-id")
      if (id) map.set(id, el.getBoundingClientRect())
    }
    return map
  }, [])

  const marquee = useMarqueeSelection({
    getItemRects,
    containerRef: scrollContainerRef,
    onSelectionChange: setMarqueeSelectedIds,
  })

  const liveSelectedIds = marquee.isActive ? marquee.selectedIds : marqueeSelectedIds

  const clearSelection = useCallback(() => setMarqueeSelectedIds(new Set()), [])

  const onDeleteRef = useRef(onDeleteSelection)
  onDeleteRef.current = onDeleteSelection

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (marqueeSelectedIds.size === 0) return
      if ((e.target as HTMLElement).closest("input, textarea, select")) return
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault()
        onDeleteRef.current(marqueeSelectedIds)
        setMarqueeSelectedIds(new Set())
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [marqueeSelectedIds])

  const isMultiSelectTarget = useCallback(
    (id: string) => marqueeSelectedIds.size > 1 && marqueeSelectedIds.has(id),
    [marqueeSelectedIds],
  )

  const multiDragIdsRef = useRef<Set<string>>(new Set())
  const multiDragPreviewRef = useRef<HTMLElement | null>(null)

  const cleanupMultiDragPreview = () => {
    if (multiDragPreviewRef.current) {
      multiDragPreviewRef.current.remove()
      multiDragPreviewRef.current = null
    }
  }

  const handleMultiDragStart = useCallback((projectId: string, event: React.DragEvent<HTMLElement>) => {
    if (!drag) return
    if (marqueeSelectedIds.size > 1 && marqueeSelectedIds.has(projectId)) {
      const projectIds = new Set<string>()
      for (const id of marqueeSelectedIds) {
        if (!folderIds.has(id)) projectIds.add(id)
      }
      multiDragIdsRef.current = projectIds

      drag.handleProjectDragStart(projectId, event)
      event.dataTransfer.setData("text/plain", [...projectIds].join(","))

      cleanupMultiDragPreview()
      const container = scrollContainerRef.current
      if (!container) return

      const selectedEls: HTMLElement[] = []
      for (const id of marqueeSelectedIds) {
        const el = container.querySelector(`[data-selectable-id="${id}"]`) as HTMLElement | null
        if (el) selectedEls.push(el)
      }
      if (selectedEls.length === 0) return

      const wrapper = document.createElement("div")
      wrapper.style.position = "fixed"
      wrapper.style.top = "-2000px"
      wrapper.style.left = "-2000px"
      wrapper.style.pointerEvents = "none"
      wrapper.style.zIndex = "99999"

      const themed = container.closest(".app") as HTMLElement | null
      if (themed) {
        const cs = getComputedStyle(themed)
        for (const v of ["--app-bg", "--menu-bg", "--menu-border", "--menu-button", "--menu-button-hover-bg", "--menu-dropdown-bg", "--menu-dropdown-border", "--app-accent", "--app-ui-font", "--app-display-font"]) {
          const val = cs.getPropertyValue(v)
          if (val) wrapper.style.setProperty(v, val)
        }
      }

      const maxVisible = Math.min(selectedEls.length, 3)
      const firstBounds = selectedEls[0].getBoundingClientRect()
      const cardWidth = Math.round(firstBounds.width)
      const cardHeight = Math.round(firstBounds.height)
      const stackOffset = 6

      wrapper.style.width = `${cardWidth + stackOffset * (maxVisible - 1)}px`
      wrapper.style.height = `${cardHeight + stackOffset * (maxVisible - 1)}px`

      for (let i = maxVisible - 1; i >= 0; i--) {
        const clone = selectedEls[i].cloneNode(true) as HTMLElement
        clone.style.position = "absolute"
        clone.style.top = `${i * stackOffset}px`
        clone.style.left = `${i * stackOffset}px`
        clone.style.width = `${cardWidth}px`
        clone.style.height = `${cardHeight}px`
        clone.style.boxSizing = "border-box"
        clone.style.opacity = i === 0 ? "1" : "0.7"
        clone.style.borderRadius = "10px"
        clone.style.overflow = "hidden"
        clone.style.boxShadow = "0 4px 16px rgba(0,0,0,0.3)"
        clone.style.border = "1.5px solid var(--app-accent, #7ea8ff)"
        clone.style.background = "var(--menu-dropdown-bg, #1e1e1e)"
        wrapper.appendChild(clone)
      }

      if (selectedEls.length > 1) {
        const badge = document.createElement("div")
        badge.textContent = `${selectedEls.length}`
        badge.style.cssText = `
          position: absolute; top: -6px; right: -6px;
          min-width: 22px; height: 22px; padding: 0 6px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 11px;
          background: var(--app-accent, #7ea8ff); color: #fff;
          font-size: 12px; font-weight: 600;
          font-family: var(--app-ui-font, system-ui);
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          z-index: 1;
        `
        wrapper.appendChild(badge)
      }

      document.body.appendChild(wrapper)
      multiDragPreviewRef.current = wrapper

      const sourceBounds = event.currentTarget.getBoundingClientRect()
      const offsetX = event.clientX - sourceBounds.left
      const offsetY = event.clientY - sourceBounds.top
      event.dataTransfer.setDragImage(wrapper, offsetX, offsetY)
    } else {
      multiDragIdsRef.current = new Set()
      drag.handleProjectDragStart(projectId, event)
    }
  }, [marqueeSelectedIds, folderIds, drag])

  const handleMultiDragEnd = useCallback(() => {
    multiDragIdsRef.current = new Set()
    cleanupMultiDragPreview()
    drag?.handleProjectDragEnd()
  }, [drag])

  const handleMultiCardDrop = useCallback((targetProject: Project) => (event: React.DragEvent<HTMLElement>) => {
    if (!drag) return
    if (multiDragIdsRef.current.size > 1 && drag.draggingProjectId && setProjects) {
      event.preventDefault()
      event.stopPropagation()
      const targetFolderId = targetProject.folderId ?? null
      for (const id of multiDragIdsRef.current) {
        if (id !== drag.draggingProjectId) {
          setProjects((cur) => cur.map((p) => p.id === id ? { ...p, folderId: targetFolderId } : p))
        }
      }
      drag.handleCardDrop(targetProject)(event)
      multiDragIdsRef.current = new Set()
      setMarqueeSelectedIds(new Set())
      return
    }
    drag.handleCardDrop(targetProject)(event)
  }, [drag, setProjects])

  const handleMultiFolderDrop = useCallback((folder: ProjectFolder) => (event: React.DragEvent<HTMLElement>) => {
    if (!drag) return
    if (multiDragIdsRef.current.size > 1 && drag.draggingProjectId && setProjects) {
      for (const id of multiDragIdsRef.current) {
        if (id !== drag.draggingProjectId) {
          setProjects((cur) => cur.map((p) => p.id === id ? { ...p, folderId: folder.id } : p))
        }
      }
    }
    drag.handleFolderItemDrop(folder)(event)
    multiDragIdsRef.current = new Set()
    setMarqueeSelectedIds(new Set())
  }, [drag, setProjects])

  const handleMultiRootDrop = useCallback((position: "top" | "bottom") => (event: React.DragEvent<HTMLElement>) => {
    if (!drag) return
    if (multiDragIdsRef.current.size > 1 && drag.draggingProjectId && setProjects) {
      for (const id of multiDragIdsRef.current) {
        if (id !== drag.draggingProjectId) {
          setProjects((cur) => cur.map((p) => p.id === id ? { ...p, folderId: null, rootPosition: position } : p))
        }
      }
    }
    drag.handleRootDrop(position)(event)
    multiDragIdsRef.current = new Set()
    setMarqueeSelectedIds(new Set())
  }, [drag, setProjects])

  const isMultiDragging = useCallback((projectId: string, primaryDraggingId: string | null) => {
    return multiDragIdsRef.current.has(projectId) && primaryDraggingId !== null
  }, [])

  const handleMultiSectionDragStart = useCallback((projectId: string, event: React.DragEvent<HTMLElement>) => {
    if (marqueeSelectedIds.size > 1 && marqueeSelectedIds.has(projectId)) {
      const projectIds = [...marqueeSelectedIds].filter((id) => !folderIds.has(id))
      multiDragIdsRef.current = new Set(projectIds)

      event.dataTransfer.effectAllowed = "move"
      event.dataTransfer.setData("text/plain", projectIds.join(","))

      cleanupMultiDragPreview()
      const container = scrollContainerRef.current
      if (container) {
        const selectedEls: HTMLElement[] = []
        for (const id of marqueeSelectedIds) {
          const el = container.querySelector(`[data-selectable-id="${CSS.escape(id)}"]`) as HTMLElement | null
          if (el) selectedEls.push(el)
        }
        if (selectedEls.length > 0) {
          const wrapper = document.createElement("div")
          wrapper.style.position = "fixed"
          wrapper.style.top = "-2000px"
          wrapper.style.left = "-2000px"
          wrapper.style.pointerEvents = "none"
          wrapper.style.zIndex = "99999"

          const themed = container.closest(".app") as HTMLElement | null
          if (themed) {
            const cs = getComputedStyle(themed)
            for (const v of ["--app-bg", "--menu-bg", "--menu-border", "--menu-button", "--menu-button-hover-bg", "--menu-dropdown-bg", "--menu-dropdown-border", "--app-accent", "--app-ui-font", "--app-display-font"]) {
              const val = cs.getPropertyValue(v)
              if (val) wrapper.style.setProperty(v, val)
            }
          }

          const maxVisible = Math.min(selectedEls.length, 3)
          const firstBounds = selectedEls[0].getBoundingClientRect()
          const cardWidth = Math.round(firstBounds.width)
          const cardHeight = Math.round(firstBounds.height)
          const stackOffset = 6

          wrapper.style.width = `${cardWidth + stackOffset * (maxVisible - 1)}px`
          wrapper.style.height = `${cardHeight + stackOffset * (maxVisible - 1)}px`

          for (let i = maxVisible - 1; i >= 0; i--) {
            const clone = selectedEls[i].cloneNode(true) as HTMLElement
            clone.style.position = "absolute"
            clone.style.top = `${i * stackOffset}px`
            clone.style.left = `${i * stackOffset}px`
            clone.style.width = `${cardWidth}px`
            clone.style.height = `${cardHeight}px`
            clone.style.boxSizing = "border-box"
            clone.style.opacity = i === 0 ? "1" : "0.7"
            clone.style.borderRadius = "10px"
            clone.style.overflow = "hidden"
            clone.style.boxShadow = "0 4px 16px rgba(0,0,0,0.3)"
            clone.style.border = "1.5px solid var(--app-accent, #7ea8ff)"
            clone.style.background = "var(--menu-dropdown-bg, #1e1e1e)"
            wrapper.appendChild(clone)
          }

          if (selectedEls.length > 1) {
            const badge = document.createElement("div")
            badge.textContent = `${selectedEls.length}`
            badge.style.cssText = `
              position: absolute; top: -6px; right: -6px;
              min-width: 22px; height: 22px; padding: 0 6px;
              display: flex; align-items: center; justify-content: center;
              border-radius: 11px;
              background: var(--app-accent, #7ea8ff); color: #fff;
              font-size: 12px; font-weight: 600;
              font-family: var(--app-ui-font, system-ui);
              box-shadow: 0 2px 6px rgba(0,0,0,0.3);
              z-index: 1;
            `
            wrapper.appendChild(badge)
          }

          document.body.appendChild(wrapper)
          multiDragPreviewRef.current = wrapper

          const sourceBounds = event.currentTarget.getBoundingClientRect()
          const offsetX = event.clientX - sourceBounds.left
          const offsetY = event.clientY - sourceBounds.top
          event.dataTransfer.setDragImage(wrapper, offsetX, offsetY)
        }
      }
    } else {
      multiDragIdsRef.current = new Set()
      handleSectionDragStart(projectId, event)
    }
  }, [marqueeSelectedIds, folderIds])

  const handleMultiSectionDragEnd = useCallback(() => {
    multiDragIdsRef.current = new Set()
    cleanupMultiDragPreview()
  }, [])

  return {
    scrollContainerRef,
    liveSelectedIds,
    selectedIds: marqueeSelectedIds,
    isMarqueeActive: marquee.isActive,
    marqueeRect: marquee.rect,
    handleMouseDown: marquee.handleMouseDown,
    scrollClassName: marquee.isActive ? "project-hub__main-scroll--marquee" : "",
    clearSelection,
    isMultiSelectTarget,

    handleMultiDragStart,
    handleMultiDragEnd,
    handleMultiCardDrop,
    handleMultiFolderDrop,
    handleMultiRootDrop,
    isMultiDragging,

    handleMultiSectionDragStart,
    handleMultiSectionDragEnd,
  }
}
