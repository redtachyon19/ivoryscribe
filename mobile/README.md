# IvoryScribe mobile

The IvoryScribe iOS/Android app — [Expo](https://docs.expo.dev/) (React Native,
SDK 57) + expo-router. Shares the backend API client with the web apps via the
`@shared/*` alias (see [`../shared`](../shared)).

## Structure

```
src/
  app/                 # expo-router file-based routes
    _layout.tsx        # root Stack, inits @shared/api, wraps SessionProvider
    index.tsx          # redirects to /library or /auth based on session
    auth.tsx           # login / register  → @shared/api
    library.tsx        # document list      → @shared/api
    editor/[id].tsx    # WebView editor     → @shared/api
  lib/
    config.ts          # points @shared/api at the backend
    session.tsx        # SecureStore-backed auth session
    theme.ts           # colors / spacing
```

The editor screen hosts a WebView with a minimal `contentEditable` surface. That
is the seam where the real **TipTap** bundle will go — same bridge contract (seed
`innerHTML`, post `{ type: 'content', html }` on input). TipTap is DOM-bound, so
it lives in a WebView here just as it would in any native framework.

## Running it

The app needs the **backend running** (see [`../DEPLOY.md`](../DEPLOY.md) §1 or
`npm --prefix ../backend run dev`).

```bash
npm install          # first time
npx expo start       # then press i (iOS simulator) or a (Android emulator)
```

### Pointing at the backend

`src/lib/config.ts` resolves the API base URL in this order:

1. `EXPO_PUBLIC_API_URL` env var
2. `app.json` → `expo.extra.apiUrl`
3. `http://localhost:4000` (default)

- **iOS simulator** reaches the host via `localhost` — the default works.
- **Android emulator** needs `EXPO_PUBLIC_API_URL=http://10.0.2.2:4000`.
- **A physical device** needs your machine's LAN IP, e.g.
  `EXPO_PUBLIC_API_URL=http://192.168.1.20:4000 npx expo start`.

## Verifying without a device

```bash
npx tsc --noEmit                       # types
npx expo export --platform ios         # bundles with Metro (proves @shared resolves)
```
