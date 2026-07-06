# Deploying IvoryScribe (Backend + Postgres)

The desktop app is distributed for download, but it talks to a hosted backend
(Express + Sequelize) backed by **Postgres**. This guide covers:

1. Running the full stack **locally on Postgres** with Docker (to validate the DB migration).
2. Deploying the backend + managed Postgres to **Railway**.
3. Pointing the downloadable app / marketing site at the deployed backend.

The database dialect is chosen at runtime:

- No `DATABASE_URL` and `DB_DIALECT=sqlite` (the local default) → SQLite file at `backend/data/ivoryscribe.sqlite`.
- A `DATABASE_URL` is present → **Postgres** (dialect forced), TLS controlled by `DB_SSL`.

On first boot the server runs `sequelize.sync()` (safe mode), which **creates any
missing tables automatically** — so a fresh Postgres needs no manual migration step.

---

## 1. Run the full stack locally on Postgres

This uses the same Postgres engine as production, so you can confirm the app works
end-to-end before deploying.

```bash
# from the repo root
cp backend/.env.example backend/.env   # if you don't already have one; fill in secrets
docker compose up --build
```

- API: http://localhost:4000/health → `{"status":"ok"}`
- Postgres: localhost:5432 (user/password/db all `ivoryscribe`)

`docker-compose.yml` forces `DATABASE_URL` at the compose Postgres and overrides
whatever `DB_*` values are in `backend/.env`, so you don't have to change your local
env to try Postgres. Secrets (JWT, Stripe, Resend, AI keys) are still read from
`backend/.env`.

Stop and wipe the local DB volume:

```bash
docker compose down -v
```

---

## 2. Deploy the backend to Railway

Railway builds the `backend/Dockerfile` and injects `DATABASE_URL` from a managed
Postgres. Config lives in [`backend/railway.json`](backend/railway.json)
(`DOCKERFILE` builder + `/health` health check).

### One-time setup

1. Create a Railway project → **New Project**.
2. **Add a Postgres database**: New → Database → Add PostgreSQL.
3. **Add the backend service** from your GitHub repo (or `railway up`).
4. In the backend service **Settings → Root Directory**, set it to **`backend`**.
   This makes Railway read `backend/railway.json` and build `backend/Dockerfile`.

### Backend service variables

In the backend service **Variables**, add:

| Variable | Value | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Reference the Postgres service. Uses Railway's private network. |
| `DB_SSL` | `false` | Private networking is not TLS. Set `true` only if you connect over the public proxy. |
| `DB_SYNC_MODE` | `safe` | Creates missing tables; never rewrites existing ones. |
| `JWT_SECRET` | *(long random string)* | |
| `JWT_EXPIRES_IN` | `7d` | |
| `CLIENT_ORIGIN` | `https://ivoryscribe.com,https://www.ivoryscribe.com` | Comma-separated allowed web origins. The desktop app sends no Origin and is always allowed. |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | *(from Resend)* | Email verification. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_TUSK_PRICE_ID` | *(from Stripe)* | Billing. |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `XAI_API_KEY` | *(optional)* | Tusk AI providers. |

Do **not** set `PORT` or `HOST` — Railway injects `PORT`, and the Docker image
already binds `HOST=0.0.0.0`.

### Deploy

Push to the connected branch (or run `railway up`). Railway builds the Dockerfile,
starts the container, and waits for `/health` to pass.

**Custom domain (`api.ivoryscribe.com`).** In the backend service →
**Settings → Networking → Custom Domain**, add `api.ivoryscribe.com`. Railway
shows a target host; create a DNS **CNAME** at your registrar:

| Type | Name | Value |
| --- | --- | --- |
| CNAME | `api` | `<target>.up.railway.app` (the value Railway shows) |

Railway provisions the TLS cert automatically once DNS resolves, so the API goes
live at `https://api.ivoryscribe.com` — which is exactly what the app is built
against (§3). Keep `ivoryscribe.com` / `www` pointed at wherever the marketing
site is hosted.

> **Stripe webhook:** point your Stripe webhook endpoint at
> `https://api.ivoryscribe.com/api/billing/webhook` and copy the signing secret
> into `STRIPE_WEBHOOK_SECRET`.

---

## 3. The downloadable app / site → backend (already wired)

The frontend resolves its API base from `VITE_API_URL` at **build time**
(`frontend/src/core/api/request.ts`). This is already committed in
[`frontend/.env.production`](frontend/.env.production):

```bash
VITE_API_URL=https://api.ivoryscribe.com
```

`vite build` and `build:electron` both load `.env.production` automatically, so
`npm run build` (web) and `npm run package` (desktop) point at the production API
with no extra step. The value is public — it ships inside the client bundle either
way — so it lives in the repo rather than in a secret. During local development
(`npm run dev`) the var is absent and the app falls back to `localhost:4000`.

## 4. Continuous deployment (GitHub Actions)

[`.github/workflows/deploy-backend.yml`](.github/workflows/deploy-backend.yml)
redeploys the backend to Railway on every push to `main` that touches `backend/**`
(or via **Actions → Run workflow**). Configure once under
**GitHub → Settings → Secrets and variables → Actions**:

- Secret `RAILWAY_TOKEN` — a Railway **project token** (Railway project → Settings → Tokens).
- Variable `RAILWAY_SERVICE` — the backend service name.

Railway's built-in GitHub integration can also auto-deploy on push; use one or the
other, not both, to avoid double deploys.
