import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load backend/.env before other modules read process.env at import time.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
