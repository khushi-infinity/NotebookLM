import { QdrantClient } from "@qdrant/js-client-rest";
let pipeline;

async function getPipeline() {
  if (!pipeline) {
    const transformers = await import("@xenova/transformers");
    pipeline = transformers.pipeline;
  }
  return pipeline;
}
// ── Model config ─────────────────────────────────────────────────
// Local embeddings avoid Groq model availability issues.
// all-MiniLM-L6-v2: fast, lightweight, 384-dim, suitable for semantic search.
const EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";
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
  const embedder = await getEmbedder();
  const output = await embedder(text, {
    pooling: "mean",
    normalize: true,
  });

  return Array.from(output.data);
}

// ── Embed an array of strings in safe batches ─────────────────────
async function embedBatch(texts) {
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
    page:  r.payload.page,
    score: r.score,
  }));
}

