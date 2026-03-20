import type { ReactNode, ButtonHTMLAttributes } from "react"
import "./GhostButton.css"

type GhostButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label?: string
  labelSide?: "left" | "right"
  small?: boolean
  spinIcon?: boolean
  children: ReactNode
}

export default function GhostButton({
  label,
  labelSide = "left",
  small = false,
  spinIcon = false,
  className = "",
  children,
  ...rest
}: GhostButtonProps) {
  const classes = [
    "ghost-btn",
    small && "ghost-btn--small",
    spinIcon && "ghost-btn--spin-icon",
    className,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <button type="button" className={classes} {...rest}>
      {children}
      {label ? <span className={`ghost-btn__label ghost-btn__label--${labelSide}`}>{label}</span> : null}
    </button>
  )
}
