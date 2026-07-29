import { useState } from "react"
import { FolderOpen, HardDrive } from "lucide-react"
import Button from "../ui/Button"

type Props = {
  rootPath: string | null
  onChangeLocalWorkspace?: () => Promise<string | null> | void
  autoCreateDefaultRoot?: boolean
  onAutoCreateDefaultRootChange?: (enabled: boolean) => void
  sectionRef: (element: HTMLElement | null) => void
}

export default function WorkspaceSettings({
  rootPath,
  onChangeLocalWorkspace,
  autoCreateDefaultRoot,
  onAutoCreateDefaultRootChange,
  sectionRef,
}: Props) {
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

      {onAutoCreateDefaultRootChange ? (
        <>
          <label
            className="global-settings__field global-settings__field--toggle"
            htmlFor="settings-auto-create-default-root-toggle"
          >
            <span>Create a default workspace folder</span>
            <span className="global-settings__switch" aria-hidden="true">
              <input
                id="settings-auto-create-default-root-toggle"
                type="checkbox"
                checked={autoCreateDefaultRoot ?? true}
                onChange={(event) => {
                  onAutoCreateDefaultRootChange(event.target.checked)
                }}
              />
              <span className="global-settings__switch-track" />
            </span>
          </label>
          <p className="global-settings__field-description">
            When on, Ivoryscribe creates <code>Scribe</code> in your Documents folder on
            first launch so there&apos;s somewhere to write straight away. Turn it off to keep
            Documents untouched and choose your own folder instead — an existing{" "}
            <code>Scribe</code> folder is still used if you already have one. Turning this
            off never deletes anything.
          </p>
        </>
      ) : null}
    </section>
  )
}
