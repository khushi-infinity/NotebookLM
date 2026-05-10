import multer from "multer";
import path from "path";
import fs from "fs";

// Ensure the uploads directory exists
const UPLOAD_DIR = "./uploads";
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Save files with a unique timestamped name, preserving extension
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, uniqueSuffix + ext);
  },
});

// Only allow PDF and TXT files up to 20 MB
export const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".pdf", ".txt"].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and TXT files are supported."), false);
    }
  },
});
