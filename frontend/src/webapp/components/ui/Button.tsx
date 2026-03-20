import type { ButtonHTMLAttributes, ReactNode } from "react"
import "./Button.css"

type ButtonVariant = "footer" | "footer-primary" | "footer-danger"

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  children: ReactNode
}

const variantClassMap: Record<ButtonVariant, string> = {
  footer: "ui-button--footer",
  "footer-primary": "ui-button--footer-primary",
  "footer-danger": "ui-button--footer-danger",
}

export default function Button({ variant = "footer", className = "", children, ...rest }: ButtonProps) {
  const classes = ["ui-button", variantClassMap[variant], className].filter(Boolean).join(" ")

  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  )
}
