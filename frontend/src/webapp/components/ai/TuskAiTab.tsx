import { useMemo, useState } from "react"
import { Check, LoaderCircle, Lock, MessageSquareText, RotateCcw, SendHorizontal, Trash2, X } from "lucide-react"
import { requestTuskAiEdits, type TuskAiEdit, type TuskAiProvider } from "../../../core/api"
import type { Project } from "../../../core/projects"
import "./TuskAiTab.css"

type TuskAiTabProps = {
  sessionToken: string
  hasAccess: boolean
  isUnlocking: boolean
  onUnlock: () => void
  project: Project
  onApplyEdit: (tabId: string, nextContent: string) => void
}

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
}

type DiffSegment = {
  type: "same" | "add" | "remove"
  text: string
}

type PendingEdit = TuskAiEdit & {
  state: "pending" | "kept" | "discarded"
  segments: DiffSegment[]
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function tokenize(value: string) {
  const tokens = value.match(/\w+|[^\w\s]|\s+/g)
  return tokens ?? []
}

function buildDiffSegments(before: string, after: string): DiffSegment[] {
  if (before === after) {
    return [{ type: "same", text: before }]
  }

  const beforeTokens = tokenize(before)
  const afterTokens = tokenize(after)

  let start = 0
  const maxPrefix = Math.min(beforeTokens.length, afterTokens.length)
  while (start < maxPrefix && beforeTokens[start] === afterTokens[start]) {
    start += 1
  }

  let beforeEnd = beforeTokens.length - 1
  let afterEnd = afterTokens.length - 1
  while (beforeEnd >= start && afterEnd >= start && beforeTokens[beforeEnd] === afterTokens[afterEnd]) {
    beforeEnd -= 1
    afterEnd -= 1
  }

  const segments: DiffSegment[] = []
  const prefix = beforeTokens.slice(0, start).join("")
  if (prefix) {
    segments.push({ type: "same", text: prefix })
  }

  const removed = beforeTokens.slice(start, beforeEnd + 1).join("")
  if (removed) {
    segments.push({ type: "remove", text: removed })
  }

  const added = afterTokens.slice(start, afterEnd + 1).join("")
  if (added) {
    segments.push({ type: "add", text: added })
  }

  const suffix = beforeTokens.slice(beforeEnd + 1).join("")
  if (suffix) {
    segments.push({ type: "same", text: suffix })
  }

  return segments.length > 0 ? segments : [{ type: "remove", text: before }, { type: "add", text: after }]
}

function toContextProject(project: Project) {
  return {
    name: project.name,
    kind: project.kind,
    activeId: project.activeId,
    tabs: project.tabs,
    contentById: project.contentById,
  }
}

export default function TuskAiTab({
  sessionToken,
  hasAccess,
  isUnlocking,
  onUnlock,
  project,
  onApplyEdit,
}: TuskAiTabProps) {
  const [provider, setProvider] = useState<TuskAiProvider>("gpt")
  const [prompt, setPrompt] = useState("")
  const [chatLog, setChatLog] = useState<ChatMessage[]>([])
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([])
  const [contextMatches, setContextMatches] = useState<Array<{ tabId: string; tabTitle: string; relevanceScore: number }>>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusNote, setStatusNote] = useState("")
  const [error, setError] = useState("")

  const pendingCount = useMemo(
    () => pendingEdits.filter((edit) => edit.state === "pending").length,
    [pendingEdits],
  )

  const keepSingleEdit = (editId: string) => {
    setPendingEdits((current) => {
      const target = current.find((entry) => entry.id === editId)
      if (!target || target.state !== "pending") {
        return current
      }

      onApplyEdit(target.tabId, target.after)
      return current.map((entry) =>
        entry.id === editId
          ? {
              ...entry,
              state: "kept",
            }
          : entry,
      )
    })
  }

  const discardSingleEdit = (editId: string) => {
    setPendingEdits((current) =>
      current.map((entry) =>
        entry.id === editId
          ? {
              ...entry,
              state: "discarded",
            }
          : entry,
      ),
    )
  }

  const keepAllPending = () => {
    setPendingEdits((current) => {
      const toApply = current.filter((entry) => entry.state === "pending")
      for (const entry of toApply) {
        onApplyEdit(entry.tabId, entry.after)
      }

      return current.map((entry) =>
        entry.state === "pending"
          ? {
              ...entry,
              state: "kept",
            }
          : entry,
      )
    })
  }

  const discardAllPending = () => {
    setPendingEdits((current) =>
      current.map((entry) =>
        entry.state === "pending"
          ? {
              ...entry,
              state: "discarded",
            }
          : entry,
      ),
    )
  }

  const onSubmitPrompt = async () => {
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt || isSubmitting) {
      return
    }

    setError("")
    setStatusNote("")
    setIsSubmitting(true)

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: trimmedPrompt,
    }
    setChatLog((current) => [...current, userMessage])

    try {
      const response = await requestTuskAiEdits(sessionToken, {
        provider,
        message: trimmedPrompt,
        project: toContextProject(project),
      })

      const nextEdits: PendingEdit[] = response.edits.map((edit) => ({
        ...edit,
        state: "pending",
        segments: buildDiffSegments(edit.before, edit.after),
      }))

      const summary = response.edits.length
        ? `Proposed ${response.edits.length} contextual edit${response.edits.length === 1 ? "" : "s"} across your project.`
        : "No edits were proposed for this request."
      const modelLabel = response.model ? `${provider.toUpperCase()} (${response.model})` : provider.toUpperCase()
      const assistantMessage: ChatMessage = {
        id: createId(),
        role: "assistant",
        content: `${summary} Provider: ${modelLabel}${response.usedFallback ? " (fallback mode)" : ""}`,
      }

      setChatLog((current) => [...current, assistantMessage])
      setContextMatches(response.contextMatches)
      setPendingEdits(nextEdits)
      setStatusNote(response.providerNote ?? "")
      setPrompt("")
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Failed to run Tusk AI request"
      setError(message)
      setChatLog((current) => [
        ...current,
        {
          id: createId(),
          role: "assistant",
          content: "Tusk AI could not complete that request. Please retry.",
        },
      ])
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="tuskai-tab">
      <header className="tuskai-tab__header">
        <h2>Tusk AI</h2>
        <p>Copilot-style story edits with contextual chapter search.</p>
      </header>

      <div className="tuskai-tab__body">
        <div className="tuskai-tab__feed">
          <section className="tuskai-tab__chat">
            <h3>
              <MessageSquareText size={14} /> Request Log
            </h3>
            {chatLog.length === 0 ? (
              <p className="tuskai-tab__empty">No requests yet.</p>
            ) : (
              <div className="tuskai-tab__chat-list">
                {chatLog.map((message) => (
                  <article
                    key={message.id}
                    className={`tuskai-tab__chat-item tuskai-tab__chat-item--${message.role}`}
                  >
                    <strong>{message.role === "user" ? "You" : "Tusk AI"}</strong>
                    <p>{message.content}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="tuskai-tab__context">
            <h3>Context Matches</h3>
            {contextMatches.length === 0 ? (
              <p className="tuskai-tab__empty">No context targets yet.</p>
            ) : (
              <ul className="tuskai-tab__context-list">
                {contextMatches.map((match) => (
                  <li key={`${match.tabId}-${match.tabTitle}`}>
                    <span>{match.tabTitle}</span>
                    <em>relevance {match.relevanceScore}</em>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="tuskai-tab__edits">
            <header>
              <h3>Proposed Edits</h3>
              <span>{pendingCount} pending</span>
            </header>

            <div className="tuskai-tab__bulk-actions">
              <button type="button" onClick={keepAllPending} disabled={pendingCount === 0}>
                <Check size={14} /> Keep All
              </button>
              <button type="button" onClick={discardAllPending} disabled={pendingCount === 0}>
                <Trash2 size={14} /> Delete All
              </button>
            </div>

            {pendingEdits.length === 0 ? (
              <p className="tuskai-tab__empty">No edits generated yet.</p>
            ) : (
              <div className="tuskai-tab__edit-list">
                {pendingEdits.map((edit) => (
                  <article key={edit.id} className={`tuskai-tab__edit tuskai-tab__edit--${edit.state}`}>
                    <header>
                      <h4>{edit.tabTitle}</h4>
                      <span>{edit.state}</span>
                    </header>
                    <p className="tuskai-tab__edit-summary">{edit.summary}</p>

                    <pre className="tuskai-tab__diff" aria-label={`Diff preview for ${edit.tabTitle}`}>
                      {edit.segments.map((segment, index) => (
                        <span
                          key={`${edit.id}-${index}`}
                          className={`tuskai-tab__diff-segment tuskai-tab__diff-segment--${segment.type}`}
                        >
                          {segment.text}
                        </span>
                      ))}
                    </pre>

                    <div className="tuskai-tab__edit-actions">
                      <button
                        type="button"
                        onClick={() => {
                          keepSingleEdit(edit.id)
                        }}
                        disabled={edit.state !== "pending"}
                      >
                        <Check size={14} /> Keep
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          discardSingleEdit(edit.id)
                        }}
                        disabled={edit.state !== "pending"}
                      >
                        <X size={14} /> Delete
                      </button>
                      {edit.state !== "pending" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setPendingEdits((current) =>
                              current.map((entry) =>
                                entry.id === edit.id
                                  ? {
                                      ...entry,
                                      state: "pending",
                                    }
                                  : entry,
                              ),
                            )
                          }}
                        >
                          <RotateCcw size={14} /> Re-open
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="tuskai-tab__composer">
          {hasAccess ? (
            <>
              <label className="tuskai-tab__prompt-label" htmlFor="tusk-ai-request">
                Ask for contextual rewrite
              </label>
              <textarea
                id="tusk-ai-request"
                className="tuskai-tab__prompt"
                value={prompt}
                onChange={(event) => {
                  setPrompt(event.target.value)
                }}
                placeholder="Example: Strengthen Maya's characterization across the final three chapters, keep her voice consistent, and improve emotional continuity."
                rows={6}
              />
              <div className="tuskai-tab__composer-actions">
                <label className="tuskai-tab__provider-select-wrap">
                  <span className="tuskai-tab__visually-hidden">Model provider</span>
                  <select
                    className="tuskai-tab__provider-select"
                    value={provider}
                    onChange={(event) => {
                      setProvider(event.target.value as TuskAiProvider)
                    }}
                    aria-label="Model provider"
                  >
                    <option value="gpt">GPT</option>
                    <option value="claude">Claude</option>
                    <option value="grok">Grok</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="tuskai-tab__send"
                  onClick={() => {
                    void onSubmitPrompt()
                  }}
                  disabled={!prompt.trim() || isSubmitting}
                >
                  {isSubmitting ? <LoaderCircle size={14} className="tuskai-tab__spin" /> : <SendHorizontal size={14} />}
                  <span>{isSubmitting ? "Running contextual search..." : "Send"}</span>
                </button>
              </div>

              {error ? <p className="tuskai-tab__error">{error}</p> : null}
              {statusNote ? <p className="tuskai-tab__status">{statusNote}</p> : null}
            </>
          ) : (
            <div className="tuskai-tab__locked">
              <p className="tuskai-tab__locked-title">
                <Lock size={14} /> Tusk AI is locked
              </p>
              <p className="tuskai-tab__locked-copy">
                Unlock with Stripe checkout. Card payments include Apple Pay on supported Safari devices and verified domains.
              </p>
              <button
                type="button"
                className="tuskai-tab__unlock"
                onClick={onUnlock}
                disabled={isUnlocking}
              >
                {isUnlocking ? <LoaderCircle size={14} className="tuskai-tab__spin" /> : <Lock size={14} />}
                <span>{isUnlocking ? "Redirecting to Stripe..." : "Unlock Tusk AI"}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
