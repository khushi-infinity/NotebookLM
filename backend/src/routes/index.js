import { Router } from "express";
import path from "path";
import { loadAndChunk } from "../services/chunker.js";
import { storeChunks }  from "../services/embeddings.js";
import { collectionNameFromFileId } from "../services/collection.js";

const router = Router();

/**
 * POST /api/index
 * Loads the uploaded file, splits it into chunks, embeds them with
 * Groq, and stores the vectors in Qdrant.
 *
 * Body:    { fileId: string }
 * Response: { collectionName: string, pageCount: number, chunkCount: number }
 */
router.post("/", async (req, res) => {
  const { fileId } = req.body;

  if (!fileId) {
    return res.status(400).json({ error: "fileId is required." });
  }

  const filePath = path.resolve("./uploads", fileId);

  // Qdrant collection name — only alphanumeric + underscores allowed
  const collectionName = collectionNameFromFileId(fileId);

  try {
    // 1. Load document and split into chunks
    const { chunks, pageCount } = await loadAndChunk(filePath);

    if (!chunks.length) {
      return res.status(422).json({ error: "Document is empty or could not be parsed." });
    }

    // 2. Embed chunks and store in Qdrant
    await storeChunks(chunks, collectionName);

    res.json({
      collectionName,
      pageCount,
      chunkCount: chunks.length,
    });

  } catch (err) {
    console.error("[/api/index]", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
