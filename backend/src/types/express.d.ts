import type { User } from "../models/user.ts";

/**
 * `req.user` is populated by middleware/auth.ts. It is declared non-optional
 * because every handler that reads it is mounted behind that middleware —
 * either at the app level in server.ts (documents, preferences, sync, ai,
 * shares, billing) or applied per-route in routes/auth.ts. Handlers on
 * unauthenticated routes simply never touch it.
 */
declare global {
  namespace Express {
    interface Request {
      user: User;
    }
  }
}

export {};
