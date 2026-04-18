# IvoryScribe

IvoryScribe is a React + TypeScript frontend with a PostgreSQL-backed Express + Sequelize API for user login and per-user sync.

## Frontend

Frontend code and config now live in `frontend/`.

Install and run from `frontend/`:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173` by default.

## Backend

Backend code is in `backend/`.

1. Create a PostgreSQL database.
2. Copy `backend/.env.example` to `backend/.env` and update values.
3. Install and start backend from `backend/`:

```bash
cd backend
npm install
npm run dev
```

Backend runs on `http://localhost:4000` by default.

### Stripe Billing for Tusk AI

To enable paid unlocks for Tusk AI, configure these in `backend/.env`:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_TUSK_PRICE_ID`

Then run Stripe webhook forwarding locally:

```bash
stripe listen --forward-to localhost:4000/api/billing/webhook
```

Detailed backend API docs: `backend/README.md`.

From the repo root, install once and run both apps together:

```bash
npm install
npm run dev
```

`npm run dev` now starts both frontend (`5173`) and backend (`4000`) together.

### LAN Access (Same Network)

Use these scripts when you want other computers on your Wi-Fi/LAN to open the app:

```bash
npm run dev:lan
```

- Serves frontend on `0.0.0.0:5173`
- Serves backend on `0.0.0.0:4000`
- Enables backend LAN CORS for private-network browser origins

For Electron + backend in LAN mode:

```bash
npm run dev:electron:lan
```

Notes:
- Electron itself still runs on the host machine.
- Other devices can open the same renderer URL in a browser using your host machine IP (for example `http://192.168.1.25:5173`).

Optional root scripts:
- `npm run dev:frontend` (frontend only)
- `npm run dev:frontend:lan` (frontend only, LAN)
- `npm run dev:backend` (backend only)
- `npm run dev:backend:lan` (backend only, LAN)
- `npm run dev:lan` (frontend + backend, LAN)
- `npm run dev:electron:lan` (electron + backend, LAN renderer URL)
- `npm run preview:lan` (preview build on LAN)
- `npm run server:dev` (backend only, legacy alias)
- `npm run server:lan` (backend start, LAN)
