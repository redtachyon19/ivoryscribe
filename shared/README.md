# @ivoryscribe/shared

Platform-agnostic TypeScript shared across every IvoryScribe client:

- `frontend/` — the product web app + Electron desktop
- `website/` — the public marketing site
- `mobile/` — the Expo (React Native) app

Consumed as **source** via the `@shared/*` path alias (Vite `resolve.alias` /
tsconfig `paths` / Metro alias). There is no build step — consumers compile it.

## What belongs here

- `src/api/*` — the HTTP client (auth, documents, billing, ai, shares) and its
  types. Pure `fetch`/TS.

## Rules

- **No DOM.** No `document`, no React-DOM, no `import.meta`, no `window`. Anything
  here must bundle under Vite *and* Metro/Hermes.
- **Config is injected, not read.** The client does not know its own base URL.
  Each host app calls `configureApi({ baseUrl, isDev, devFallbackUrl })` once at
  startup (`src/api/config.ts`):
  - `frontend/` → `frontend/src/webApiConfig.ts` (reads Vite env + `window.location`)
  - `website/`  → does not call the API
  - `mobile/`   → `mobile/src/lib/config.ts` (reads Expo config / `EXPO_PUBLIC_API_URL`)
