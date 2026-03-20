# IvoryScribe Backend

Express + Sequelize + PostgreSQL backend that provides:
- user registration and login
- email verification via Resend
- secure password hashing
- JWT-based auth
- per-user document storage
- per-user preferences/theme storage
- sync endpoints to keep client state tied to a login

## 1. Setup

1. Copy `backend/.env.example` to `backend/.env` and fill values.
2. Local dev now defaults to SQLite (`DB_DIALECT=sqlite`) and stores data at `backend/data/ivoryscribe.sqlite`.
3. To use PostgreSQL instead, set `DB_DIALECT=postgres` and fill the `DB_*` connection values.
4. Install dependencies in `backend/`:

```bash
cd backend
npm install
```

## 2. Run

From `backend/`:

```bash
npm run dev
```

The API is served on `http://localhost:4000` by default.

## Database Safety

This project now supports `DB_SYNC_MODE`:

- `safe` (default): runs `sequelize.sync()` and does not rewrite existing tables.
- `alter`: runs `sequelize.sync({ alter: true })`; use only for one-off local schema changes.
- `force`: runs `sequelize.sync({ force: true })`; drops and recreates all tables.

For local development, keep `DB_SYNC_MODE=safe` to avoid accidental data loss.

## 3. Auth Endpoints

- `POST /api/auth/register`
  - body: `{ "firstName": "Jane", "lastName": "Doe", "email": "you@example.com", "password": "your-password" }`
  - creates account and sends a 6-digit email verification code
- `POST /api/auth/login`
  - body: `{ "email": "you@example.com", "password": "your-password" }`
  - returns `403` with `EMAIL_NOT_VERIFIED` until verified
- `POST /api/auth/verify-email`
  - body: `{ "userId": "<uuid>", "code": "123456" }`
  - verifies email and returns auth token
- `POST /api/auth/resend-verification`
  - body: `{ "userId": "<uuid>" }`
  - re-sends verification code by email
- `POST /api/auth/request-account-deletion` (authenticated)
  - sends account deletion confirmation email link
- `POST /api/auth/request-password-reset` (authenticated)
  - sends password reset link by email
- `GET /api/auth/password-reset-info?token=<token>`
  - validates reset token and returns username for reset UI
- `POST /api/auth/reset-password`
  - body: `{ "token": "<token>", "newPassword": "new-password" }`
  - updates password when token is valid and not expired
- `POST /api/auth/confirm-account-deletion-code`
  - body: `{ "userId": "<uuid>", "code": "123456" }`
  - deletes account if code is valid and not expired
- `GET /api/auth/confirm-account-deletion?token=<token>`
  - deletes account when email link token is valid and not expired

`/register` returns verification metadata. `/verify-email` and `/login` (for verified users) return:

```json
{
  "token": "<jwt>",
  "user": {
    "id": "<uuid>",
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "you@example.com",
    "isEmailVerified": true
  }
}
```

Use token as: `Authorization: Bearer <jwt>`.

### Email Setup (Resend)

Set these in `backend/.env`:

- `RESEND_API_KEY=...`
- `RESEND_FROM_EMAIL="IvoryScribe <onboarding@resend.dev>"`
- `FRONTEND_PUBLIC_URL="http://localhost:5173"` (used in password reset email links)

For local schema migration, run once with `DB_SYNC_MODE=alter` so new email verification columns are created, then switch back to `safe`.
Run once in `alter` mode after pulling account deletion changes so the deletion challenge columns are created.

## 4. Document Endpoints (Authenticated)

- `GET /api/documents` - list current user's docs
- `POST /api/documents` - create doc
- `GET /api/documents/:id` - get one doc
- `PATCH /api/documents/:id` - update fields (`title`, `content`, `theme`, `metadata`)
- `DELETE /api/documents/:id` - delete doc

## 5. Preferences Endpoints (Authenticated)

- `GET /api/preferences` - get user preferences
- `PUT /api/preferences` - save user preferences

Body example:

```json
{
  "theme": { "name": "forest" },
  "editorSettings": { "fontSize": 16 },
  "uiSettings": { "showLineNumbers": true }
}
```

## 6. Sync Endpoints (Authenticated)

- `GET /api/sync`
  - returns all documents + preferences for current user
- `POST /api/sync/push`
  - pushes an array of docs and/or preferences in one request

Body example:

```json
{
  "documents": [
    {
      "id": "optional-existing-doc-id",
      "title": "Draft",
      "content": "Hello",
      "theme": { "name": "forest" },
      "metadata": { "wordCount": 1 }
    }
  ],
  "preferences": {
    "theme": { "name": "forest" },
    "editorSettings": { "fontSize": 16 },
    "uiSettings": { "showLineNumbers": true }
  }
}
```

## 7. Billing Endpoints (Stripe)

Use Stripe Checkout for one-time digital purchase unlock of Tusk AI.

Required env vars in `backend/.env`:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_TUSK_PRICE_ID` (one-time Price ID for Tusk AI unlock)

Endpoints:

- `GET /api/billing/status` (authenticated)
  - returns `tuskAiActivated` and latest purchase metadata
- `POST /api/billing/checkout-session` (authenticated)
  - creates Stripe Checkout Session and returns `checkoutUrl`
- `POST /api/billing/webhook` (Stripe webhook)
  - verifies signature and activates Tusk AI on `checkout.session.completed`

### Apple Pay Notes

Stripe Checkout shows Apple Pay automatically when:

- user is on a supported Apple Pay browser/device (usually Safari), and
- your production domain is verified in Stripe.

For local development, use Stripe CLI webhook forwarding:

```bash
stripe listen --forward-to localhost:4000/api/billing/webhook
```
