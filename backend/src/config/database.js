import { Sequelize } from "sequelize";
import path from "node:path";
import { fileURLToPath } from "node:url";

const {
  DATABASE_URL,
  DB_DIALECT = "sqlite",
  DB_HOST = "localhost",
  DB_PORT = "5432",
  DB_NAME = "ivoryscribe",
  DB_USER = "postgres",
  DB_PASSWORD = "postgres",
  DB_STORAGE = "./data/ivoryscribe.sqlite",
  DB_LOGGING = "false",
  DB_SSL = "false",
} = process.env;

const shouldLog = DB_LOGGING === "true" ? console.log : false;
const sslEnabled = String(DB_SSL).toLowerCase() === "true";

// A DATABASE_URL (as injected by Railway/Render/Neon/Supabase) always implies
// Postgres, regardless of what DB_DIALECT happens to say.
const normalizedDialect = DATABASE_URL ? "postgres" : String(DB_DIALECT).toLowerCase();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Managed Postgres almost always requires TLS, and its certs frequently don't
// chain to a public root — so require SSL but don't reject the unverified cert.
const postgresSsl = sslEnabled ? { require: true, rejectUnauthorized: false } : false;

function createSqliteSequelize() {
  const resolvedStorage = path.resolve(__dirname, "../../", DB_STORAGE);

  return new Sequelize({
    dialect: "sqlite",
    storage: resolvedStorage,
    logging: shouldLog,
  });
}

function createPostgresSequelize() {
  const options = {
    dialect: "postgres",
    logging: shouldLog,
    dialectOptions: postgresSsl ? { ssl: postgresSsl } : {},
  };

  // Prefer a single connection string when the platform hands one to us.
  if (DATABASE_URL) {
    return new Sequelize(DATABASE_URL, options);
  }

  return new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
    ...options,
    host: DB_HOST,
    port: Number(DB_PORT),
  });
}

const sequelize = normalizedDialect === "postgres" ? createPostgresSequelize() : createSqliteSequelize();

export default sequelize;
