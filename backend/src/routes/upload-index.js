import { Router } from "express";
import { v4 as uuidv4 } from "uuid";

import { uploadMemory } from "../middleware/upload.js";
import { loadAndChunkFromUpload } from "../services/chunker.js";
import { storeChunks } from "../services/embeddings.js";
import { collectionNameFromFileId } from "../services/collection.js";

const router = Router();

router.post("/", uploadMemory.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file provided." });
  }

  const fileId = `${Date.now()}-${uuidv4()}`;
  const collectionName = collectionNameFromFileId(fileId);

  try {
    const { chunks, pageCount } = await loadAndChunkFromUpload(req.file);

    if (!chunks.length) {
      return res.status(422).json({ error: "Document is empty or could not be parsed." });
    }

    await storeChunks(chunks, collectionName);

    res.json({
      fileId,
      fileName: req.file.originalname,
      collectionName,
      pageCount,
      chunkCount: chunks.length,
    });
  } catch (err) {
    console.error("[/api/upload-index]", err);
    res.status(500).json({
      error: err.message,
      cause: err.cause ? (err.cause.message || String(err.cause)) : undefined,
      stack: err.stack,
    });
  }
});

export default router;