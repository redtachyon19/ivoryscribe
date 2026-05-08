import type { DiffBlock, DiffHunk } from "./diffBuilder"

export type ProposedEdit = {
  id: string
  tabId: string
  tabTitle: string
  summary: string
  before: string
  after: string
  state: "pending" | "accepted" | "rejected"
  blocks?: DiffBlock[]
  hunks?: DiffHunk[]
}
