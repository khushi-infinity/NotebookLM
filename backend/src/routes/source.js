import { Router }       from "express";
import { QdrantClient } from "@qdrant/js-client-rest";
import fs   from "fs";
import path from "path";
import { collectionNameFromFileId } from "../services/collection.js";

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || "http://localhost:6333" });
const router = Router();

/**
 * DELETE /api/source/:fileId
 * Deletes the Qdrant collection and the uploaded file from disk.
 * Always returns { ok: true } so the frontend can clean up its UI
 * even if the backend resources were already removed.
 *
 * Params:   fileId (the saved filename, e.g. "1717000000000-123456789.pdf")
 * Response: { ok: true }
 */
router.delete("/:fileId", async (req, res) => {
  const { fileId } = req.params;
  const collectionName = collectionNameFromFileId(fileId);

  // Delete Qdrant collection (non-fatal if it doesn't exist)
  try {
    await qdrant.deleteCollection(collectionName);
  } catch (err) {
    console.warn("[/api/source] Qdrant delete failed:", err.message);
  }

  // Delete uploaded file from disk (non-fatal)
  try {
    const filePath = path.resolve("./uploads", fileId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn("[/api/source] File delete failed:", err.message);
  }

  res.json({ ok: true });
});

export default router;
