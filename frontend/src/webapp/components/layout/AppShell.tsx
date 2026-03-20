import type { CSSProperties, ReactNode } from "react"

type AppShellProps = {
  style: { palette: string; appStyleVariables: CSSProperties }
  children: ReactNode
}

export default function AppShell({ style, children }: AppShellProps) {
  return (
    <div className={`app app--palette-${style.palette}`} style={style.appStyleVariables}>
      {children}
    </div>
  )
}
