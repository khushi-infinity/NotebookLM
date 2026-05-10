import "dotenv/config";
import app from "./app.js";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

// Serve frontend in local development
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, "../../frontend");
app.use(express.static(frontendDir));

// ── Start ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅  Server running at http://localhost:${PORT}`);
  console.log(`    Qdrant:  ${process.env.QDRANT_URL || "http://localhost:6333"}`);
  console.log(`    Groq key set: ${!!process.env.GROQ_API_KEY}`);
});
