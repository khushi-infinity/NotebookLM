import app from "./app.js";

// ── Start ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅  Server running at http://localhost:${PORT}`);
  console.log(`    Qdrant:  ${process.env.QDRANT_URL || "http://localhost:6333"}`);
  console.log(`    Groq key set: ${!!process.env.GROQ_API_KEY}`);
});
