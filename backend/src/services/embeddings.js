import { QdrantClient } from "@qdrant/js-client-rest";

let pipeline;

async function getPipeline() {
  if (!pipeline) {
    const transformers = await import("@xenova/transformers");
    // Set cache directory on the dynamically imported env
    transformers.env.cacheDir = "/tmp/transformers";
    pipeline = transformers.pipeline;
  }
  return pipeline;
}

// ── Model config ─────────────────────────────────────────────────
// Local/hosted model config. We use all-MiniLM-L6-v2 because it's fast, lightweight, and 384-dimensional.
const EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";
const HF_EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2";
const VECTOR_DIM  = 384;

let embedderPromise;
let qdrant;

async function getEmbedder() {
  if (!embedderPromise) {
    const pipe = await getPipeline();
    embedderPromise = pipe("feature-extraction", EMBED_MODEL);
  }
  return embedderPromise;
}

function getQdrant() {
  if (!qdrant) {
    qdrant = new QdrantClient({
      url: process.env.QDRANT_URL || "http://localhost:6333",
      apiKey: process.env.QDRANT_API_KEY,
    });
  }
  return qdrant;
}

// ── Embed a single string ─────────────────────────────────────────
export async function embed(text) {
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY;
  if (token) {
    const response = await fetch(`https://router.huggingface.co/hf-inference/models/${HF_EMBED_MODEL}/pipeline/feature-extraction`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: text }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Hugging Face API error: ${response.status} ${response.statusText} - ${errText}`);
    }

    const data = await response.json();
    if (Array.isArray(data)) {
      if (Array.isArray(data[0])) {
        return data[0]; // If nested, extract the first embedding
      }
      return data;
    }
    throw new Error(`Unexpected Hugging Face response format: ${JSON.stringify(data)}`);
  }

  // Fallback to local Transformers.js
  const embedder = await getEmbedder();
  const output = await embedder(text, {
    pooling: "mean",
    normalize: true,
  });

  return Array.from(output.data);
}

// ── Embed an array of strings in safe batches ─────────────────────
async function embedBatch(texts) {
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY;
  if (token) {
    const vectors = [];
    const batchSize = 16;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      const response = await fetch(`https://router.huggingface.co/hf-inference/models/${HF_EMBED_MODEL}/pipeline/feature-extraction`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: batch }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Hugging Face API error: ${response.status} ${response.statusText} - ${errText}`);
      }

      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error(`Unexpected Hugging Face response format: ${JSON.stringify(data)}`);
      }
      
      for (const item of data) {
        if (Array.isArray(item)) {
          vectors.push(item);
        } else {
          throw new Error(`Unexpected item format in HF response: ${JSON.stringify(item)}`);
        }
      }
    }
    return vectors;
  }

  // Fallback to local Transformers.js batching
  const vectors   = [];
  const batchSize = 8;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const batchVectors = await Promise.all(batch.map(text => embed(text)));
    vectors.push(...batchVectors);
  }

  return vectors;
}


// ── Ensure Qdrant collection exists ──────────────────────────────
async function ensureCollection(name) {
  try {
    await getQdrant().getCollection(name);
    // Collection already exists — nothing to do
  } catch {
    await getQdrant().createCollection(name, {
      vectors: { size: VECTOR_DIM, distance: "Cosine" },
    });
  }
}

// ── Store chunks into Qdrant ──────────────────────────────────────
export async function storeChunks(chunks, collectionName) {
  await ensureCollection(collectionName);

  const texts   = chunks.map(c => c.text);
  const vectors = await embedBatch(texts);

  // Build Qdrant points — id, vector, payload
  const points = chunks.map((chunk, i) => ({
    id:      i,
    vector:  vectors[i],
    payload: {
      text: chunk.text,
      page: chunk.metadata.page,
      chunkIndex: chunk.metadata.chunkIndex,
      parentText: chunk.metadata.parentText || chunk.text, // Store parentText in payload
    },
  }));

  // Upsert in batches of 100 to avoid payload size limits
  const batchSize = 100;
  for (let i = 0; i < points.length; i += batchSize) {
    await getQdrant().upsert(collectionName, {
      wait:   true,
      points: points.slice(i, i + batchSize),
    });
  }
}

// ── Retrieve top-k semantically similar chunks ────────────────────
export async function retrieve(query, collectionName, k = 4) {
  const queryVector = await embed(query);

  const results = await getQdrant().search(collectionName, {
    vector:       queryVector,
    limit:        k,
    with_payload: true,
  });

  return results.map(r => ({
    text:  r.payload.text,
    parentText: r.payload.parentText || r.payload.text, // Fallback to child text if parentText doesn't exist
    page:  r.payload.page,
    score: r.score,
  }));
}


