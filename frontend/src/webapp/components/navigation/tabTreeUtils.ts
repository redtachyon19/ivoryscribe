import type { DocumentTab } from "../../../core/projects"
import type { DropMode } from "../editor/hooks/useListDrag"

// Guards against dropping a node inside its own subtree.
export function containsId(node: DocumentTab, targetId: string): boolean {
  if (node.id === targetId) {
    return true
  }

  return node.children.some((child) => containsId(child, targetId))
}

// Finds a node anywhere in the tree.
export function findNode(nodes: DocumentTab[], targetId: string): DocumentTab | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return node
    }

    const nested = findNode(node.children, targetId)
    if (nested) {
      return nested
    }
  }

  return null
}

// Removes a node from any depth and returns both the new tree and removed node.
export function removeNode(
  nodes: DocumentTab[],
  targetId: string,
): { nextNodes: DocumentTab[]; removed: DocumentTab | null } {
  let removed: DocumentTab | null = null

  const nextNodes = nodes
    .filter((node) => {
      if (node.id === targetId) {
        removed = node
        return false
      }
      return true
    })
    .map((node) => {
      const nested = removeNode(node.children, targetId)
      if (nested.removed) {
        removed = nested.removed
      }

      return {
        ...node,
        children: nested.nextNodes,
      }
    })

  return { nextNodes, removed }
}

// Inserts relative to a target node (before/after), preserving nested structure.
export function insertRelative(
  nodes: DocumentTab[],
  targetId: string,
  newNode: DocumentTab,
  mode: "before" | "after",
): { nextNodes: DocumentTab[]; inserted: boolean } {
  let inserted = false
  const nextNodes: DocumentTab[] = []

  for (const node of nodes) {
    if (node.id === targetId) {
      inserted = true
      if (mode === "before") {
        nextNodes.push(newNode, node)
      } else {
        nextNodes.push(node, newNode)
      }
      continue
    }

    const nested = insertRelative(node.children, targetId, newNode, mode)
    if (nested.inserted) {
      inserted = true
      nextNodes.push({
        ...node,
        children: nested.nextNodes,
      })
      continue
    }

    nextNodes.push(node)
  }

  return { nextNodes, inserted }
}

// Inserts a node as a child of target.
export function insertInside(
  nodes: DocumentTab[],
  targetId: string,
  newNode: DocumentTab,
): { nextNodes: DocumentTab[]; inserted: boolean } {
  let inserted = false

  const nextNodes = nodes.map((node) => {
    if (node.id === targetId) {
      inserted = true
      return {
        ...node,
        children: [...node.children, newNode],
      }
    }

    const nested = insertInside(node.children, targetId, newNode)
    if (nested.inserted) {
      inserted = true
      return {
        ...node,
        children: nested.nextNodes,
      }
    }

    return node
  })

  return { nextNodes, inserted }
}

// Canonical move operation used by all drag/drop commit paths.
export function moveNode(tabs: DocumentTab[], sourceId: string, targetId: string, mode: DropMode): DocumentTab[] {
  if (sourceId === targetId) {
    return tabs
  }

  const sourceNode = findNode(tabs, sourceId)
  if (!sourceNode) {
    return tabs
  }

  if (containsId(sourceNode, targetId)) {
    return tabs
  }

  const removedResult = removeNode(tabs, sourceId)
  if (!removedResult.removed) {
    return tabs
  }

  if (mode === "inside") {
    const insertedResult = insertInside(removedResult.nextNodes, targetId, removedResult.removed)
    return insertedResult.inserted ? insertedResult.nextNodes : tabs
  }

  const insertedResult = insertRelative(removedResult.nextNodes, targetId, removedResult.removed, mode)
  return insertedResult.inserted ? insertedResult.nextNodes : tabs
}

// Applies in-place title edits by ID.
export function renameTab(nodes: DocumentTab[], targetId: string, nextTitle: string): DocumentTab[] {
  return nodes.map((node) => {
    if (node.id === targetId) {
      return {
        ...node,
        title: nextTitle,
      }
    }

    return {
      ...node,
      children: renameTab(node.children, targetId, nextTitle),
    }
  })
}

export function deleteTab(nodes: DocumentTab[], targetId: string): DocumentTab[] {
  return removeNode(nodes, targetId).nextNodes
}

export function collectDescendantTitles(node: DocumentTab): string[] {
  return node.children.flatMap((child) => [child.title, ...collectDescendantTitles(child)])
}

export function findAncestorIds(nodes: DocumentTab[], targetId: string, ancestors: string[] = []): string[] | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return ancestors
    }

    const nested = findAncestorIds(node.children, targetId, [...ancestors, node.id])
    if (nested) {
      return nested
    }
  }

  return null
}

export function collectSelectedRootIds(
  nodes: DocumentTab[],
  selectedIds: Set<string>,
  ancestorSelected = false,
): string[] {
  const rootIds: string[] = []

  for (const node of nodes) {
    const isSelected = selectedIds.has(node.id)
    if (isSelected && !ancestorSelected) {
      rootIds.push(node.id)
    }

    rootIds.push(...collectSelectedRootIds(node.children, selectedIds, ancestorSelected || isSelected))
  }

  return rootIds
}

export function moveNodes(tabs: DocumentTab[], sourceIds: string[], targetId: string, mode: DropMode): DocumentTab[] {
  if (sourceIds.length === 0) {
    return tabs
  }

  const sourceIdSet = new Set(sourceIds)
  if (sourceIdSet.has(targetId)) {
    return tabs
  }

  const targetInsideDraggedNode = sourceIds.some((sourceId) => {
    const sourceNode = findNode(tabs, sourceId)
    return sourceNode ? containsId(sourceNode, targetId) : false
  })
  if (targetInsideDraggedNode) {
    return tabs
  }

  const orderedSourceIds = mode === "after" ? [...sourceIds].reverse() : sourceIds
  return orderedSourceIds.reduce((current, sourceId) => moveNode(current, sourceId, targetId, mode), tabs)
}
