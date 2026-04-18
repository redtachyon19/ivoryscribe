import "./config/loadEnv.js";
import cors from "cors";
import express from "express";
import os from "node:os";
import { DataTypes } from "sequelize";
import authRoutes from "./routes/auth.js";
import documentsRoutes from "./routes/documents.js";
import preferencesRoutes from "./routes/preferences.js";
import syncRoutes from "./routes/sync.js";
import aiRoutes from "./routes/ai.js";
import sharesRoutes from "./routes/shares.js";
import { checkoutRouter as billingRoutes, webhookRouter as billingWebhookRoutes } from "./routes/billing.js";
import authMiddleware from "./middleware/auth.js";
import { sequelize } from "./models/index.js";

const app = express();
const {
  PORT = "4000",
  HOST = "127.0.0.1",
  CLIENT_ORIGIN = "http://localhost:5173",
  ENABLE_LAN_CORS = "false",
  DB_SYNC_MODE = "safe",
} = process.env;

const lanCorsEnabled = String(ENABLE_LAN_CORS).toLowerCase() === "true";

const configuredOrigins = String(CLIENT_ORIGIN)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set(configuredOrigins.length > 0 ? configuredOrigins : ["http://localhost:5173"]);

function isPrivateIpv4Address(hostname) {
  const octets = hostname.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  const [first, second] = octets;
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isLanOrigin(origin) {
  try {
    const parsedUrl = new URL(origin);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return false;
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      return true;
    }

    return isPrivateIpv4Address(hostname);
  } catch {
    return false;
  }
}

function getNetworkUrls(port) {
  const urls = [];
  for (const addresses of Object.values(os.networkInterfaces())) {
    if (!addresses) {
      continue;
    }

    for (const address of addresses) {
      if (address.family !== "IPv4" || address.internal) {
        continue;
      }

      urls.push(`http://${address.address}:${port}`);
    }
  }

  return urls;
}

function isAllowedOrigin(origin) {
  if (allowedOrigins.has(origin)) {
    return true;
  }

  // Allow local Vite dev servers that auto-increment ports (5173, 5174, ...).
  if (
    /^https?:\/\/localhost:\d+$/.test(origin) ||
    /^https?:\/\/127\.0\.0\.1:\d+$/.test(origin) ||
    /^https?:\/\/\[::1\]:\d+$/.test(origin)
  ) {
    return true;
  }

  return lanCorsEnabled && isLanOrigin(origin);
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
app.use("/api/shares", authMiddleware, sharesRoutes);
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

    const port = Number(PORT);
    app.listen(port, HOST, () => {
      const localHost = HOST === "0.0.0.0" ? "localhost" : HOST;
      console.log(`Backend listening on http://${localHost}:${port}`);

      if (HOST === "0.0.0.0") {
        for (const networkUrl of getNetworkUrls(port)) {
          console.log(`Backend network URL: ${networkUrl}`);
        }
      }
    });
  } catch (error) {
    console.error("Failed to start backend:", error);
    process.exit(1);
  }
}

startServer();
