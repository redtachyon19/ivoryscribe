import { useEffect, useRef, useState } from "react"
import { Check, LoaderCircle, SendHorizontal, X } from "lucide-react"
import {
  requestTuskAiChat,
  requestTuskAiEdits,
  type TuskAiProvider,
} from "@shared/api"
import type { Project } from "../../../core/utils/projects"
import type { ProposedEdit } from "./proposedEditsTypes"
import "./TuskAiTab.css"

type TuskAiTabProps = {
  sessionToken: string
  hasAccess?: boolean
  isUnlocking?: boolean
  onUnlock?: () => void
  project: Project
  pendingHunkCount: number
  onProposedEdits: (edits: ProposedEdit[]) => { applied: number; dropped: number; hunkCount: number; tabCount: number }
  onAcceptAll: () => void
  onRejectAll: () => void
}

type TuskAiMode = "chat" | "edit"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  meta?: string
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
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
  project,
  pendingHunkCount,
  onProposedEdits,
  onAcceptAll,
  onRejectAll,
}: TuskAiTabProps) {
  const [provider, setProvider] = useState<TuskAiProvider>("auto")
  const [mode, setMode] = useState<TuskAiMode>("edit")
  const [prompt, setPrompt] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = scrollRef.current
    if (node) {
      node.scrollTop = node.scrollHeight
    }
  }, [messages, isSubmitting])

  const onSend = async () => {
    const trimmed = prompt.trim()
    if (!trimmed || isSubmitting) return

    setError("")
    setIsSubmitting(true)

    setMessages((current) => [
      ...current,
      { id: createId(), role: "user", content: trimmed },
    ])
    setPrompt("")

    try {
      if (mode === "chat") {
        const response = await requestTuskAiChat(sessionToken, {
          provider,
          message: trimmed,
          project: toContextProject(project),
        })

        const replyText = response.reply ?? response.error ?? "(no response)"
        const modelLabel = response.model
          ? `${response.providerUsed.toUpperCase()} · ${response.model}`
          : response.providerUsed.toUpperCase()
        const fallbackNote = response.fellBackFrom
          ? ` · switched from ${response.fellBackFrom} (moderation)`
          : ""

        setMessages((current) => [
          ...current,
          {
            id: createId(),
            role: "assistant",
            content: replyText,
            meta: `${modelLabel}${fallbackNote}`,
          },
        ])
      } else {
        const response = await requestTuskAiEdits(sessionToken, {
          provider,
          message: trimmed,
          project: toContextProject(project),
        })

        const newEdits: ProposedEdit[] = response.edits.map((edit) => ({
          id: edit.id,
          tabId: edit.tabId,
          tabTitle: edit.tabTitle,
          summary: edit.summary,
          before: edit.before,
          after: edit.after,
          state: "pending",
          isNew: edit.isNew ?? false,
        }))

        const modelLabel = response.model
          ? `${response.providerUsed.toUpperCase()} · ${response.model}`
          : response.providerUsed.toUpperCase()
        const fallbackNote = response.fellBackFrom
          ? ` · switched from ${response.fellBackFrom} (moderation)`
          : response.usedFallback
            ? " · fallback"
            : ""

        const { applied, dropped, hunkCount, tabCount } = onProposedEdits(newEdits)

        let summary: string
        if (applied === 0) {
          summary = dropped > 0
            ? "Error — model returned an edit but no actual changes were detected."
            : "Error — model returned no edits for this request."
        } else {
          const newChapterCount = newEdits.filter((edit) => edit.isNew).length
          const newChapterNote = newChapterCount > 0
            ? ` (${newChapterCount} new ${newChapterCount === 1 ? "chapter" : "chapters"})`
            : ""
          summary = `Proposed ${hunkCount} change${hunkCount === 1 ? "" : "s"} across ${tabCount} tab${tabCount === 1 ? "" : "s"}${newChapterNote}. Review them in the editor →`
        }

        setMessages((current) => [
          ...current,
          {
            id: createId(),
            role: "assistant",
            content: summary,
            meta: `${modelLabel}${fallbackNote}`,
          },
        ])
      }
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Request failed"
      setError(message)
      setMessages((current) => [
        ...current,
        { id: createId(), role: "assistant", content: `Error: ${message}` },
      ])
    } finally {
      setIsSubmitting(false)
    }
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      void onSend()
    }
  }

  return (
    <div className="tuskai">
      <div className="tuskai__messages" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="tuskai__empty">
            Ask Tusk AI to edit your draft. <strong>Edit</strong> mode proposes diffs in the
            editor; <strong>Chat</strong> mode just talks.
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={`tuskai__msg tuskai__msg--${message.role}`}>
              <div className="tuskai__bubble">{message.content}</div>
              {message.meta ? <div className="tuskai__meta">{message.meta}</div> : null}
            </div>
          ))
        )}
        {isSubmitting ? (
          <div className="tuskai__msg tuskai__msg--assistant">
            <div className="tuskai__bubble tuskai__bubble--thinking">
              <LoaderCircle size={14} className="tuskai__spin" /> Thinking…
            </div>
          </div>
        ) : null}
      </div>

      {pendingHunkCount > 0 ? (
        <div className="tuskai__pending">
          <span>
            {pendingHunkCount} pending change{pendingHunkCount === 1 ? "" : "s"} in the editor
          </span>
          <div className="tuskai__pending-actions">
            <button
              type="button"
              className="tuskai__pending-btn tuskai__pending-btn--accept"
              onClick={onAcceptAll}
            >
              <Check size={12} /> Accept all
            </button>
            <button
              type="button"
              className="tuskai__pending-btn tuskai__pending-btn--reject"
              onClick={onRejectAll}
            >
              <X size={12} /> Reject all
            </button>
          </div>
        </div>
      ) : null}

      {error ? <div className="tuskai__error">{error}</div> : null}

      <div className="tuskai__composer">
        <textarea
          className="tuskai__input"
          value={prompt}
          onChange={(event) => {
            setPrompt(event.target.value)
          }}
          onKeyDown={onKeyDown}
          placeholder={
            mode === "edit"
              ? "Tell Tusk AI what to change… (Enter to send, Shift+Enter for newline)"
              : "Ask Tusk AI a question… (Enter to send, Shift+Enter for newline)"
          }
          rows={2}
          disabled={isSubmitting}
        />
        <div className="tuskai__composer-actions">
          <div className="tuskai__mode-toggle" role="tablist" aria-label="Mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "edit"}
              className={`tuskai__mode-btn ${mode === "edit" ? "tuskai__mode-btn--active" : ""}`}
              onClick={() => {
                setMode("edit")
              }}
              disabled={isSubmitting}
            >
              Edit
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "chat"}
              className={`tuskai__mode-btn ${mode === "chat" ? "tuskai__mode-btn--active" : ""}`}
              onClick={() => {
                setMode("chat")
              }}
              disabled={isSubmitting}
            >
              Chat
            </button>
          </div>
          <select
            className="tuskai__model"
            value={provider}
            onChange={(event) => {
              setProvider(event.target.value as TuskAiProvider)
            }}
            aria-label="Model"
            disabled={isSubmitting}
          >
            <option value="auto">Auto</option>
            <option value="claude">Claude</option>
            <option value="gpt">GPT</option>
            <option value="grok">Grok</option>
          </select>
          <button
            type="button"
            className="tuskai__send"
            onClick={() => {
              void onSend()
            }}
            disabled={!prompt.trim() || isSubmitting}
          >
            {isSubmitting ? (
              <LoaderCircle size={14} className="tuskai__spin" />
            ) : (
              <SendHorizontal size={14} />
            )}
            <span>Send</span>
          </button>
        </div>
      </div>
    </div>
  )
}
