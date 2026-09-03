import { useState } from "react"
import { Check, X, Eye, Pencil } from "lucide-react"
import type { PendingShareRequest } from "@shared/api"
import "./ShareRequestList.css"

type ShareRequestListProps = {
  requests: PendingShareRequest[]
  onAccept: (shareId: string) => void
  onReject: (shareId: string) => void
}

export default function ShareRequestList({ requests, onAccept, onReject }: ShareRequestListProps) {
  const [respondingIds, setRespondingIds] = useState<Set<string>>(new Set())

  const handleRespond = (shareId: string, action: "accept" | "reject") => {
    setRespondingIds((cur) => new Set(cur).add(shareId))
    if (action === "accept") {
      onAccept(shareId)
    } else {
      onReject(shareId)
    }
  }

  return (
    <div className="share-requests">
      <span className="share-requests__title">Share Requests</span>
      <div className="share-requests__list">
        {requests.map((req) => {
          const isResponding = respondingIds.has(req.id)
          return (
            <div key={req.id} className="share-requests__item">
              <div className="share-requests__item-info">
                <span className="share-requests__item-project">{req.projectName}</span>
                <span className="share-requests__item-meta">
                  from {req.owner.name || req.owner.email}
                  <span className="share-requests__item-permission">
                    {req.permission === "edit" ? (
                      <><Pencil size={11} aria-hidden="true" /> Can edit</>
                    ) : (
                      <><Eye size={11} aria-hidden="true" /> View only</>
                    )}
                  </span>
                </span>
              </div>
              <div className="share-requests__item-actions">
                <button
                  type="button"
                  className="share-requests__accept-btn"
                  onClick={() => handleRespond(req.id, "accept")}
                  disabled={isResponding}
                  title="Accept"
                >
                  <Check size={14} strokeWidth={2.5} aria-hidden="true" />
                  Accept
                </button>
                <button
                  type="button"
                  className="share-requests__reject-btn"
                  onClick={() => handleRespond(req.id, "reject")}
                  disabled={isResponding}
                  title="Reject"
                >
                  <X size={14} strokeWidth={2.5} aria-hidden="true" />
                  Reject
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
