import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse/lib/pdf-parse.js";

// ── Recursive character text splitter ────────────────────────────
// Tries larger separators first (paragraphs → lines → sentences → words → chars)
// to keep semantically coherent chunks.
function recursiveSplit(text, chunkSize = 1000, overlap = 200) {
  const separators = ["\n\n", "\n", ". ", " ", ""];
  const rawChunks  = [];

  function split(txt, sepIdx) {
    // Base case: fits within limit
    if (txt.length <= chunkSize) {
      if (txt.trim()) rawChunks.push(txt.trim());
      return;
    }

    const sep = separators[sepIdx];

    // No more separators — hard-split by characters
    if (sep === undefined) {
      for (let i = 0; i < txt.length; i += chunkSize - overlap) {
        const slice = txt.slice(i, i + chunkSize).trim();
        if (slice) rawChunks.push(slice);
      }
      return;
    }

    // Split by current separator and merge greedily
    const parts   = txt.split(sep);
    let current   = "";

    for (const part of parts) {
      const candidate = current ? current + sep + part : part;
      if (candidate.length > chunkSize) {
        if (current.trim()) split(current.trim(), sepIdx + 1);
        current = part;
      } else {
        current = candidate;
      }
    }
    if (current.trim()) split(current.trim(), sepIdx + 1);
  }

  split(text, 0);

  // Apply overlap: prepend the tail of the previous chunk to the current one
  const chunksWithOverlap = [];
  for (let i = 0; i < rawChunks.length; i++) {
    let chunk = rawChunks[i];
    if (i > 0 && overlap > 0) {
      const tail = rawChunks[i - 1].slice(-overlap);
      chunk = tail + "\n" + chunk;
    }
    chunksWithOverlap.push(chunk.slice(0, chunkSize));
  }

  return chunksWithOverlap;
}

// ── Estimate page number from character offset ────────────────────
function estimatePage(charOffset, totalChars, totalPages) {
  if (!totalPages || totalPages <= 1) return 1;
  return Math.max(1, Math.ceil((charOffset / totalChars) * totalPages));
}

// Helper to perform Parent-Child splitting:
// Splits text into large parent chunks, then splits each parent into smaller child chunks.
// Returns an array of child chunks mapped to their parent text payloads.
function parentChildSplit(rawText, pageCount) {
  const parents = recursiveSplit(rawText, 1200, 200);
  const chunks = [];
  let childGlobalIndex = 0;

  parents.forEach((parentText, parentIdx) => {
    // Find approximate position in the source text for page estimation
    const searchSnippet = parentText.slice(0, 60).replace(/\s+/g, " ").trim();
    const approxOffset = rawText.indexOf(searchSnippet);
    const page = estimatePage(
      approxOffset > 0 ? approxOffset : parentIdx * 1000,
      rawText.length,
      pageCount
    );

    const children = recursiveSplit(parentText, 300, 50);
    children.forEach((childText) => {
      chunks.push({
        text: childText,
        metadata: {
          page,
          chunkIndex: childGlobalIndex++,
          parentText: parentText, // Keep parent text in metadata
        },
      });
    });
  });

  return chunks;
}

// ── Main exports ──────────────────────────────────────────────────
export async function loadAndChunk(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  let rawText  = "";
  let pageCount = 1;

  // ── Load document ──────────────────────────────────────────────
  if (ext === ".pdf") {
    const buffer = fs.readFileSync(filePath);
    const data   = await pdfParse(buffer);
    rawText   = data.text;
    pageCount = data.numpages || 1;
  } else {
    // Plain text — estimate ~3000 chars per page
    rawText   = fs.readFileSync(filePath, "utf-8");
    pageCount = Math.max(1, Math.ceil(rawText.length / 3000));
  }

  if (!rawText.trim()) {
    throw new Error("Document appears to be empty or could not be parsed.");
  }

  const chunks = parentChildSplit(rawText, pageCount);
  return { chunks, pageCount };
}

export async function loadAndChunkFromUpload(file) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  let rawText = "";
  let pageCount = 1;

  if (ext === ".pdf") {
    const data = await pdfParse(file.buffer);
    rawText = data.text;
    pageCount = data.numpages || 1;
  } else {
    rawText = file.buffer.toString("utf-8");
    pageCount = Math.max(1, Math.ceil(rawText.length / 3000));
  }

  if (!rawText.trim()) {
    throw new Error("Document appears to be empty or could not be parsed.");
  }

  const chunks = parentChildSplit(rawText, pageCount);
  return { chunks, pageCount };
}

