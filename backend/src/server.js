import "./config/loadEnv.js";
import cors from "cors";
import express from "express";
import { DataTypes } from "sequelize";
import authRoutes from "./routes/auth.js";
import documentsRoutes from "./routes/documents.js";
import preferencesRoutes from "./routes/preferences.js";
import syncRoutes from "./routes/sync.js";
import aiRoutes from "./routes/ai.js";
import { checkoutRouter as billingRoutes, webhookRouter as billingWebhookRoutes } from "./routes/billing.js";
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

// Stripe webhook signatures require the exact raw request body.
app.use("/api/billing/webhook", express.raw({ type: "application/json" }), billingWebhookRoutes);
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/documents", authMiddleware, documentsRoutes);
app.use("/api/preferences", authMiddleware, preferencesRoutes);
app.use("/api/sync", authMiddleware, syncRoutes);
app.use("/api/ai", authMiddleware, aiRoutes);
app.use("/api/billing", authMiddleware, billingRoutes);

app.use((err, _req, res, _next) => {
  res.status(500).json({ message: "Internal server error", details: err.message });
});

async function ensureUsersBillingColumns() {
  const queryInterface = sequelize.getQueryInterface();
  let usersTable;

  try {
    usersTable = await queryInterface.describeTable("users");
  } catch {
    // If users table does not exist yet, normal sync below will create it.
    return;
  }

  const hasStripeCustomerId = Object.hasOwn(usersTable, "stripeCustomerId");
  const hasTuskAiActivated = Object.hasOwn(usersTable, "tuskAiActivated");
  const hasTuskAiActivatedAt = Object.hasOwn(usersTable, "tuskAiActivatedAt");

  if (!hasStripeCustomerId) {
    await queryInterface.addColumn("users", "stripeCustomerId", {
      type: DataTypes.STRING,
      allowNull: true,
    });
  }

  if (!hasTuskAiActivated) {
    await queryInterface.addColumn("users", "tuskAiActivated", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  }

  if (!hasTuskAiActivatedAt) {
    await queryInterface.addColumn("users", "tuskAiActivatedAt", {
      type: DataTypes.DATE,
      allowNull: true,
    });
  }
}

async function startServer() {
  try {
    await sequelize.authenticate();
    await ensureUsersBillingColumns();

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
