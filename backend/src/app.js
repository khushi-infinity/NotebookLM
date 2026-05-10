import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

import uploadRoute from "./routes/upload.js";
import uploadIndexRoute from "./routes/upload-index.js";
import indexRoute from "./routes/index.js";
import queryRoute from "./routes/query.js";
import sourceRoute from "./routes/source.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, "../../frontend");

app.use(cors({ origin: "*" }));
app.use(express.json());

// Only serve static files if the frontend directory exists (local dev)
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
}

app.use("/api/upload", uploadRoute);
app.use("/api/upload-index", uploadIndexRoute);
app.use("/api/index", indexRoute);
app.use("/api/query", queryRoute);
app.use("/api/source", sourceRoute);

app.get(["/health", "/api/health"], (_, res) => res.json({ ok: true }));

export default app;