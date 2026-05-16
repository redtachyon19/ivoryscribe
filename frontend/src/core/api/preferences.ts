// User preferences (theme, editor settings, UI toggles).

import { request } from "./request"
import type { PreferencesRecord } from "./types"

export async function getPreferences(token: string) {
  const payload = await request<{ preferences: PreferencesRecord }>("/api/preferences", {}, token)
  return payload.preferences
}

export async function updatePreferences(
  token: string,
  input: {
    theme?: Record<string, unknown>
    editorSettings?: Record<string, unknown>
    uiSettings?: Record<string, unknown>
  },
) {
  const payload = await request<{ preferences: PreferencesRecord }>(
    "/api/preferences",
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
    token,
  )

  return payload.preferences
}
