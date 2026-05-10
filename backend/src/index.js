import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import uploadRoute from "./routes/upload.js";
import indexRoute  from "./routes/index.js";
import queryRoute  from "./routes/query.js";
import sourceRoute from "./routes/source.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, "../../frontend");

// ── Middleware ──────────────────────────────────────────────────
app.use(cors({ origin: "*" })); // Tighten to your frontend URL in production
app.use(express.json());
app.use(express.static(frontendDir));

// ── Routes ──────────────────────────────────────────────────────
app.use("/api/upload", uploadRoute);
app.use("/api/index",  indexRoute);
app.use("/api/query",  queryRoute);
app.use("/api/source", sourceRoute);

// ── Health check ────────────────────────────────────────────────
app.get("/health", (_, res) => res.json({ ok: true }));

// ── Start ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅  Server running at http://localhost:${PORT}`);
  console.log(`    Qdrant:  ${process.env.QDRANT_URL || "http://localhost:6333"}`);
  console.log(`    Groq key set: ${!!process.env.GROQ_API_KEY}`);
});
