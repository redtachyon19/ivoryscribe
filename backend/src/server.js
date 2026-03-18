import "./config/loadEnv.js";
import cors from "cors";
import express from "express";
import authRoutes from "./routes/auth.js";
import documentsRoutes from "./routes/documents.js";
import preferencesRoutes from "./routes/preferences.js";
import syncRoutes from "./routes/sync.js";
import authMiddleware from "./middleware/auth.js";
import { sequelize } from "./models/index.js";

const app = express();
const {
  PORT = "4000",
  CLIENT_ORIGIN = "http://localhost:5173",
  DB_SYNC_MODE = "safe",
} = process.env;

const configuredOrigins = String(CLIENT_ORIGIN)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set(configuredOrigins.length > 0 ? configuredOrigins : ["http://localhost:5173"]);

function isAllowedOrigin(origin) {
  if (allowedOrigins.has(origin)) {
    return true;
  }

  // Allow local Vite dev servers that auto-increment ports (5173, 5174, ...).
  return /^https?:\/\/localhost:\d+$/.test(origin) || /^https?:\/\/127\.0\.0\.1:\d+$/.test(origin);
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
  }),
);
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/documents", authMiddleware, documentsRoutes);
app.use("/api/preferences", authMiddleware, preferencesRoutes);
app.use("/api/sync", authMiddleware, syncRoutes);

app.use((err, _req, res, _next) => {
  res.status(500).json({ message: "Internal server error", details: err.message });
});

async function startServer() {
  try {
    await sequelize.authenticate();

    const normalizedSyncMode = String(DB_SYNC_MODE).toLowerCase();
    if (normalizedSyncMode === "alter") {
      await sequelize.sync({ alter: true });
      console.warn("Database sync mode: alter (schema changes may rewrite tables)");
    } else if (normalizedSyncMode === "force") {
      await sequelize.sync({ force: true });
      console.warn("Database sync mode: force (all existing data was dropped)");
    } else {
      await sequelize.sync();
    }

    app.listen(Number(PORT), () => {
      console.log(`Backend listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start backend:", error);
    process.exit(1);
  }
}

startServer();
