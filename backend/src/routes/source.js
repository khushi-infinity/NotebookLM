import { Router }       from "express";
import { QdrantClient } from "@qdrant/js-client-rest";
import { collectionNameFromFileId } from "../services/collection.js";

const router = Router();

function getQdrant() {
  return new QdrantClient({
    url: process.env.QDRANT_URL || "http://localhost:6333",
    apiKey: process.env.QDRANT_API_KEY,
  });
}

/**
 * DELETE /api/source/:fileId
 * Deletes the Qdrant collection.
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
    await getQdrant().deleteCollection(collectionName);
  } catch (err) {
    console.warn("[/api/source] Qdrant delete failed:", err.message);
  }

  res.json({ ok: true });
});

export default router;
