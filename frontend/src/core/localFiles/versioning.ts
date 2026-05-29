// Removed: sidecar version-snapshot module.
//
// Versions are now embedded directly inside .tusk / .tusks files via the
// <versions> block in their XML codec — see codecVersions.ts and the
// version-handling in useProjectVersioning.ts. The old `.foo.tusk.versions/`
// sidecar folders that the previous app generated are *not* read or
// migrated; they remain on disk untouched (the user can delete them
// manually if they want to reclaim the space).
//
// This file is kept as a stub so any stale import surfaces a clear build
// error pointing the reader at the new home of the logic, rather than a
// confusing "module not found" message.

export const SIDECAR_VERSIONING_REMOVED =
  "Sidecar versioning was removed when version snapshots moved inside the .tusk / .tusks file. " +
  "See core/localFiles/codecVersions.ts and core/hooks/useProjectVersioning.ts."
