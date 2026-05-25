// Workspace settings panel: shows the current local-workspace root and lets
// the user point Ivoryscribe at a different folder on disk. Only rendered in
// the Electron app (the orchestrator gates by `localWorkspaceRoot` presence).

import { useState } from "react"
import { FolderOpen, HardDrive } from "lucide-react"
import Button from "../ui/Button"

type Props = {
  rootPath: string | null
  onChangeLocalWorkspace?: () => Promise<string | null> | void
  sectionRef: (element: HTMLElement | null) => void
}

export default function WorkspaceSettings({ rootPath, onChangeLocalWorkspace, sectionRef }: Props) {
  const [isPicking, setIsPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleChange = async () => {
    if (!onChangeLocalWorkspace) return
    setIsPicking(true)
    setError(null)
    try {
      await onChangeLocalWorkspace()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsPicking(false)
    }
  }

  return (
    <section
      className="global-settings__section"
      data-settings-section="workspace"
      ref={sectionRef}
    >
      <h3 className="global-settings__section-title">
        <HardDrive size={18} strokeWidth={2} aria-hidden={true} />
        <span>Workspace</span>
      </h3>

      <p className="global-settings__field-description">
        Every project lives as a file inside your workspace folder. Subfolders show up as
        Library folders, and these file types are recognized: <code>.tusk</code> books,
        <code> .tusks</code> presentations, <code>.md</code> and <code>.txt</code> documents,
        and <code>.pdf</code> files (read-only — drop them in to view).
        Changing the workspace switches you to a different folder — your old files stay where they are.
      </p>

      <div className="global-settings__field">
        <label className="global-settings__field-label">Workspace folder</label>
        <div className="workspace-settings__path-row">
          <div className="workspace-settings__path" title={rootPath ?? "Not set"}>
            <FolderOpen size={14} strokeWidth={2} aria-hidden={true} />
            <span className="workspace-settings__path-text">{rootPath ?? "Not set"}</span>
          </div>
          <Button
            variant="footer"
            onClick={() => { void handleChange() }}
            disabled={isPicking || !onChangeLocalWorkspace}
          >
            {isPicking ? "Choosing…" : "Change folder…"}
          </Button>
        </div>
        {error ? <p className="workspace-settings__error">{error}</p> : null}
      </div>
    </section>
  )
}
