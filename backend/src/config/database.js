import { Sequelize } from "sequelize";
import path from "node:path";
import { fileURLToPath } from "node:url";

const {
  DB_DIALECT = "sqlite",
  DB_HOST = "localhost",
  DB_PORT = "5432",
  DB_NAME = "ivoryscribe",
  DB_USER = "postgres",
  DB_PASSWORD = "postgres",
  DB_STORAGE = "./data/ivoryscribe.sqlite",
  DB_LOGGING = "false",
} = process.env;

const shouldLog = DB_LOGGING === "true" ? console.log : false;
const normalizedDialect = String(DB_DIALECT).toLowerCase();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createSqliteSequelize() {
  const resolvedStorage = path.resolve(__dirname, "../../", DB_STORAGE);

  return new Sequelize({
    dialect: "sqlite",
    storage: resolvedStorage,
    logging: shouldLog,
  });
}

function createPostgresSequelize() {
  return new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
    host: DB_HOST,
    port: Number(DB_PORT),
    dialect: "postgres",
    logging: shouldLog,
  });
}

const sequelize = normalizedDialect === "postgres" ? createPostgresSequelize() : createSqliteSequelize();

export default sequelize;
