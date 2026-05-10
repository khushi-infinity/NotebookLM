import { Router } from "express";
import Groq from "groq-sdk";
import { retrieve } from "../services/embeddings.js";

const groq   = new Groq({ apiKey: process.env.GROQ_API_KEY });
const router = Router();

// LLM config
// llama-3.3-70b-versatile: free on Groq, highly capable, fast
// Free tier: 30 req/min, 14,400 req/day
const LLM_MODEL = "llama-3.3-70b-versatile";

/**
 * POST /api/query
 * Retrieves the most relevant chunks from Qdrant, then sends them
 * as context to the Groq LLM to generate a grounded answer.
 *
 * Body:     { query: string, collectionName: string }
 * Response: { answer: string, chunks: [{ page, excerpt }] }
 */
router.post("/", async (req, res) => {
  const { query, collectionName } = req.body;

  if (!query || !collectionName) {
    return res.status(400).json({ error: "query and collectionName are required." });
  }

  try {
    // ── Step 1: Semantic retrieval — top 4 chunks ─────────────────
    const docs = await retrieve(query, collectionName, 4);

    if (!docs.length) {
      return res.json({
        answer: "I couldn't find any relevant content in the document for your question.",
        chunks: [],
      });
    }

    // ── Step 2: Build context string with page labels ─────────────
    const context = docs
      .map((d, i) => `[Chunk ${i + 1} | Page ${d.page ?? "?"}]\n${d.text}`)
      .join("\n\n---\n\n");

    // ── Step 3: Grounded LLM generation ───────────────────────────
    const systemPrompt = `You are a precise, helpful document assistant called NotebookLM.
Your job is to answer the user's question using ONLY the document context provided below.

Rules:
- If the answer is not present in the context, say exactly: "I couldn't find that in the document."
- Never use your own training knowledge to fill gaps — only use what's in the context.
- Cite page numbers when relevant, e.g. "According to page 3, ..."
- Be concise but complete. Use markdown formatting (bold, bullet points) where it helps clarity.

DOCUMENT CONTEXT:
${context}`;

    const completion = await groq.chat.completions.create({
      model:       LLM_MODEL,
      temperature: 0.2,    // Low temperature = more factual, less creative
      max_tokens:  1024,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: query },
      ],
    });

    const answer = completion.choices[0].message.content;

    // ── Step 4: Return answer + citation chips for the UI ─────────
    const chunks = docs.map(d => ({
      page:    d.page,
      excerpt: d.text.slice(0, 120) + "…",
    }));

    res.json({ answer, chunks });

  } catch (err) {
    console.error("[/api/query]", err);

    // Friendly message for Groq rate limit errors
    if (err.status === 429) {
      return res.status(429).json({
        error: "Groq rate limit reached. Please wait a moment and try again.",
      });
    }

    res.status(500).json({ error: err.message });
  }
});

export default router;
