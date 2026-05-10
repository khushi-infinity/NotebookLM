import express from "express";
import cors from "cors";
import uploadRoute from "./routes/upload.js";
import uploadIndexRoute from "./routes/upload-index.js";
import indexRoute from "./routes/index.js";
import queryRoute from "./routes/query.js";
import sourceRoute from "./routes/source.js";

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

app.use("/api/upload", uploadRoute);
app.use("/api/upload-index", uploadIndexRoute);
app.use("/api/index", indexRoute);
app.use("/api/query", queryRoute);
app.use("/api/source", sourceRoute);

app.get(["/health", "/api/health"], (_, res) => res.json({ ok: true }));

// Catch-all error handler
app.use((err, req, res, next) => {
  console.error("[Error Handler]", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

export default app;