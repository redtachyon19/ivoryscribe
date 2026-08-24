import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/index.ts";
import { errorMessage } from "../lib/errors.ts";

const { JWT_SECRET = "replace-this-with-a-secure-secret" } = process.env;

type AuthTokenPayload = { userId: string };

/**
 * jwt.verify resolves to `string | JwtPayload`, so the shape the app actually
 * signs has to be checked rather than assumed — a token carrying a bare string
 * payload, or one missing userId, would otherwise reach User.findByPk as
 * undefined and look up whatever that coerces to.
 */
function parseTokenPayload(payload: unknown): AuthTokenPayload | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const { userId } = payload as Record<string, unknown>;
  return typeof userId === "string" && userId.length > 0 ? { userId } : null;
}

export default async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ message: "Missing or invalid authorization token" });
      return;
    }

    const token = authHeader.replace("Bearer ", "");
    const payload = parseTokenPayload(jwt.verify(token, JWT_SECRET));

    if (!payload) {
      res.status(401).json({ message: "Invalid token user" });
      return;
    }

    const user = await User.findByPk(payload.userId);
    if (!user) {
      res.status(401).json({ message: "Invalid token user" });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized", details: errorMessage(error) });
  }
}
