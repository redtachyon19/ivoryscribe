import { Sequelize, type Options } from "sequelize";
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

const shouldLog: Options["logging"] = DB_LOGGING === "true" ? console.log : false;
const sslEnabled = String(DB_SSL).toLowerCase() === "true";

const normalizedDialect = DATABASE_URL ? "postgres" : String(DB_DIALECT).toLowerCase();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const postgresSsl = sslEnabled ? { require: true, rejectUnauthorized: false } : false;

function createSqliteSequelize(): Sequelize {
  const resolvedStorage = path.resolve(__dirname, "../../", DB_STORAGE);

  return new Sequelize({
    dialect: "sqlite",
    storage: resolvedStorage,
    logging: shouldLog,
  });
}

function createPostgresSequelize(): Sequelize {
  const options: Options = {
    dialect: "postgres",
    logging: shouldLog,
    dialectOptions: postgresSsl ? { ssl: postgresSsl } : {},
  };

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
