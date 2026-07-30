import type { ReactNode, ButtonHTMLAttributes } from "react"

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
    "btn",
    "btn--icon",
    "btn--pill",
    small && "btn--sm",
    spinIcon && "btn--spin-nudge",
    className,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <button type="button" className={classes} {...rest}>
      {children}
      {label ? <span className={`btn__label btn__label--${labelSide}`}>{label}</span> : null}
    </button>
  )
}
