import type { ButtonHTMLAttributes, ReactNode } from "react"

type ButtonVariant = "default" | "primary" | "danger" | "outline"
type ButtonSize = "sm" | "md" | "lg"

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
}

const variantClass: Record<ButtonVariant, string> = {
  default: "",
  primary: "btn--primary",
  danger: "btn--danger",
  outline: "btn--outline",
}

const sizeClass: Record<ButtonSize, string> = {
  sm: "btn--sm",
  md: "",
  lg: "btn--lg",
}

export default function Button({
  variant = "default",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const classes = ["btn", variantClass[variant], sizeClass[size], className].filter(Boolean).join(" ")

  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  )
}
