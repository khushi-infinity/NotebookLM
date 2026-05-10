import { Router } from "express";
import { upload } from "../middleware/upload.js";

const router = Router();

/**
 * POST /api/upload
 * Accepts a multipart/form-data request with a single `file` field.
 * Saves it to ./uploads/ and returns the fileId + original filename.
 *
 * Response: { fileId: string, fileName: string }
 */
router.post("/", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file provided." });
  }

  res.json({
    fileId:   req.file.filename,       // e.g. "1717000000000-123456789.pdf"
    fileName: req.file.originalname,   // e.g. "my-research.pdf"
  });
});

export default router;
