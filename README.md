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

Detailed backend API docs: `backend/README.md`.

You can also run both from the repo root with:
- `npm run dev`
- `npm run server:dev`
