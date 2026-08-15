import { useEffect, useRef, type RefObject } from "react"

const RESET_DELAY_MS = 1600

async function writeToClipboard(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Falls through to the execCommand path — clipboard access is blocked in
    // some packaged/insecure-context shells.
  }

  try {
    const scratch = document.createElement("textarea")
    scratch.value = text
    scratch.setAttribute("readonly", "")
    scratch.style.position = "fixed"
    scratch.style.top = "-1000px"
    scratch.style.opacity = "0"
    document.body.appendChild(scratch)
    scratch.select()
    const copied = document.execCommand("copy")
    document.body.removeChild(scratch)
    return copied
  } catch {
    return false
  }
}

/**
 * Wires the copy buttons that `renderMarkdownPreviewHtml` bakes into each code
 * block. The preview is injected as raw HTML, so this listens on the container
 * and resolves the button at click time instead of binding per element.
 */
export function useMarkdownPreviewCopy(hostRef: RefObject<HTMLElement | null>) {
  const timersRef = useRef(new Set<number>())

  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }

    const timers = timersRef.current

    const onClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }

      const button = target.closest<HTMLButtonElement>("[data-md-copy]")
      if (!button || !host.contains(button)) {
        return
      }

      event.preventDefault()

      const code = button.closest(".md-code")?.querySelector("code")
      const text = code?.textContent ?? ""
      if (!text) {
        return
      }

      const label = button.querySelector(".md-code__copy-label")

      void writeToClipboard(text).then((copied) => {
        button.classList.toggle("is-copied", copied)
        button.classList.toggle("is-failed", !copied)
        if (label) {
          label.textContent = copied ? "Copied" : "Failed"
        }

        const timer = window.setTimeout(() => {
          button.classList.remove("is-copied", "is-failed")
          if (label) {
            label.textContent = "Copy"
          }
          timers.delete(timer)
        }, RESET_DELAY_MS)

        timers.add(timer)
      })
    }

    host.addEventListener("click", onClick)

    return () => {
      host.removeEventListener("click", onClick)
      timers.forEach((timer) => window.clearTimeout(timer))
      timers.clear()
    }
  }, [hostRef])
}
