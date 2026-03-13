import jwt from "jsonwebtoken";
import { User } from "../models/index.js";

const { JWT_SECRET = "replace-this-with-a-secure-secret" } = process.env;

export default async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Missing or invalid authorization token" });
    }

    const token = authHeader.replace("Bearer ", "");
    const payload = jwt.verify(token, JWT_SECRET);

    const user = await User.findByPk(payload.userId);
    if (!user) {
      return res.status(401).json({ message: "Invalid token user" });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized", details: error.message });
  }
}
