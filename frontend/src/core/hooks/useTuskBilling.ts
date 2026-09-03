import { useEffect, useState } from "react"
import { type BillingStatusResponse, confirmTuskAiCheckoutSession, createTuskAiCheckoutSession, getBillingStatus } from "@shared/api"
import type { UserSession } from "../state/session"

const INITIAL_BILLING: BillingStatusResponse = { tuskAiActivated: false, tuskAiActivatedAt: null, purchase: null }

type UseTuskBillingParams = {
  session: UserSession | null
  isWorkspaceHydrated: boolean
  currentPathname: string
  checkoutResult: { state: string; sessionId: string }
  navigateReplace: (path: string) => void
}

export function useTuskBilling(params: UseTuskBillingParams) {
  const { session, isWorkspaceHydrated, currentPathname, checkoutResult, navigateReplace } = params
  const [tuskAiBilling, setTuskAiBilling] = useState<BillingStatusResponse>(INITIAL_BILLING)
  const [isStartingTuskCheckout, setIsStartingTuskCheckout] = useState(false)

  useEffect(() => {
    if (!session || !isWorkspaceHydrated || currentPathname !== "/app") return
    if (checkoutResult.state === "success" && checkoutResult.sessionId) {
      void (async () => {
        try {
          await confirmTuskAiCheckoutSession(session.token, checkoutResult.sessionId)
          setTuskAiBilling(await getBillingStatus(session.token))
          window.alert("Tusk AI unlocked successfully.")
        } catch (error) {
          window.alert(error instanceof Error ? error.message : "Payment completed but unlock confirmation failed")
        } finally { navigateReplace("/app") }
      })()
      return
    }
    if (checkoutResult.state === "canceled") {
      window.alert("Stripe checkout was canceled.")
      navigateReplace("/app")
    }
  }, [checkoutResult.sessionId, checkoutResult.state, currentPathname, isWorkspaceHydrated, session])

  const handleStartTuskCheckout = async () => {
    if (!session) { window.alert("You need to be logged in to unlock Tusk AI."); return }
    setIsStartingTuskCheckout(true)
    try {
      const checkout = await createTuskAiCheckoutSession(session.token)
      if (!checkout.checkoutUrl) throw new Error("Stripe did not return a checkout URL")
      window.location.assign(checkout.checkoutUrl)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to open Stripe checkout")
    } finally { setIsStartingTuskCheckout(false) }
  }

  const reset = () => {
    setTuskAiBilling(INITIAL_BILLING)
    setIsStartingTuskCheckout(false)
  }

  return { tuskAiBilling, setTuskAiBilling, isStartingTuskCheckout, handleStartTuskCheckout, reset }
}
