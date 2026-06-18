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
 * Advanced RAG pipeline:
 * 1. Query Rewriting: Generates a search-optimized query.
 * 2. Retrieval: Retrieves top-8 parent-child mapped chunks.
 * 3. LLM Reranking: Reranks retrieved chunks using a lightweight LLM and selects top 4.
 * 4. Grounded Generation & LLM Judge Self-Correction Loop.
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
    // ── Step 1: Query Rewriter / Refiner ──────────────────────────
    let searchOptimizedQuery = query;
    try {
      const rewriteResponse = await groq.chat.completions.create({
        model: "meta-llama/llama-3.1-8b-instant",
        temperature: 0.1,
        max_tokens: 256,
        messages: [
          {
            role: "system",
            content: "You are a search query optimizer. Given a user's natural language question, rewrite it to be a concise, standalone search query optimized for semantic vector search. Do not include any explanations, conversation, or headers — return ONLY the optimized search query."
          },
          {
            role: "user",
            content: query
          }
        ]
      });
      searchOptimizedQuery = rewriteResponse.choices[0].message.content.trim() || query;
      console.log(`[Advanced RAG - Query Rewriter] Original: "${query}" -> Optimized: "${searchOptimizedQuery}"`);
    } catch (err) {
      console.warn("[Advanced RAG] Query Rewriter failed, using original query:", err.message);
    }

    // ── Step 2: Semantic retrieval (Retrieve top 8 child chunks) ────
    const docs = await retrieve(searchOptimizedQuery, collectionName, 8);

    if (!docs.length) {
      return res.json({
        answer: "I couldn't find any relevant content in the document for your question.",
        chunks: [],
      });
    }

    // ── Step 3: LLM Reranker ──────────────────────────────────────
    let rerankedDocs = docs.slice(0, 4); // Fallback to top 4
    if (docs.length > 4) {
      try {
        const rerankPrompt = `You are a Search Results Reranker. Given a query and a list of document chunks, select the top 4 chunks that are most relevant to answering the query.
Return the result strictly as a JSON object containing a list of 0-based indices under the key "indices", ordered from most relevant to least.
Example format: { "indices": [2, 0, 5, 1] }
Do not include any explanation or extra text.

Query: ${query}
Retrieved Chunks:
${docs.map((d, i) => `[Chunk Index ${i}] ${d.parentText}`).join("\n\n")}`;

        const rerankResponse = await groq.chat.completions.create({
          model: "meta-llama/llama-3.1-8b-instant",
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "user", content: rerankPrompt }
          ]
        });

        const rerankResult = JSON.parse(rerankResponse.choices[0].message.content);
        const indices = rerankResult.indices;
        
        if (Array.isArray(indices)) {
          const validatedIndices = indices
            .map(Number)
            .filter(idx => !isNaN(idx) && idx >= 0 && idx < docs.length)
            .slice(0, 4);
          
          if (validatedIndices.length > 0) {
            rerankedDocs = validatedIndices.map(idx => docs[idx]);
            console.log(`[Advanced RAG - Reranker] Selected indices:`, validatedIndices);
          }
        }
      } catch (err) {
        console.warn("[Advanced RAG] Reranking failed, using default top 4:", err.message);
      }
    }

    // ── Step 4: Build parent-context string with page labels ────────
    const context = rerankedDocs
      .map((d, i) => `[Chunk ${i + 1} | Page ${d.page ?? "?"}]\n${d.parentText}`)
      .join("\n\n---\n\n");

    const systemPrompt = `You are a precise, helpful document assistant called NotebookLM.
Your job is to answer the user's question using ONLY the document context provided below.

Rules:
- If the answer is not present in the context, say exactly: "I couldn't find that in the document."
- Never use your own training knowledge to fill gaps — only use what's in the context.
- Cite page numbers when relevant, e.g. "According to page 3, ..."
- Be concise but complete. Use markdown formatting (bold, bullet points) where it helps clarity.

DOCUMENT CONTEXT:
${context}`;

    // ── Step 5: Generation and LLM-as-a-Judge Correction Loop ────────
    let answer = "";
    let loopCount = 0;
    const maxLoops = 2;
    let feedback = "";

    while (loopCount < maxLoops) {
      loopCount++;
      const userPrompt = feedback 
        ? `${query}\n\n[Correction Feedback from QA Judge]: Your previous answer failed quality checks: "${feedback}". Please rewrite the answer using the context provided, resolving this issue.`
        : query;

      const completion = await groq.chat.completions.create({
        model:       LLM_MODEL,
        temperature: 0.2, // Low temperature = more factual
        max_tokens:  1024,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt },
        ],
      });

      answer = completion.choices[0].message.content;

      // LLM Judge Evaluation
      try {
        const judgePrompt = `You are a Quality Assurance Judge for a RAG system. Evaluate the generated answer based on the retrieved context and user query.
Return the result strictly as a JSON object containing the keys "faithful" (boolean), "relevant" (boolean), and "feedback" (string).
- "faithful": Set to true if the answer is completely supported by the context and contains no hallucinations or external knowledge. Otherwise set to false.
- "relevant": Set to true if the answer directly and completely answers the user's query. Otherwise set to false.
- "feedback": If either is false, provide a short instruction on how to correct the answer. Otherwise leave empty.

Example format:
{
  "faithful": true,
  "relevant": true,
  "feedback": ""
}

User Query: ${query}

Retrieved Context:
${context}

Generated Answer:
${answer}`;

        const judgeResponse = await groq.chat.completions.create({
          model: "meta-llama/llama-3.1-8b-instant",
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "user", content: judgePrompt }
          ]
        });

        const judgeResult = JSON.parse(judgeResponse.choices[0].message.content);
        console.log(`[Advanced RAG - LLM Judge] Evaluation (Pass ${loopCount}):`, judgeResult);

        if (judgeResult.faithful && judgeResult.relevant) {
          break; // Pass! Return the answer
        } else {
          feedback = judgeResult.feedback || "Answer was not fully grounded in context or did not answer the query.";
        }
      } catch (err) {
        console.warn("[Advanced RAG] LLM-as-a-Judge evaluation failed, accepting current answer:", err.message);
        break; 
      }
    }

    // ── Step 6: Return answer + citation chips for the UI ─────────
    const chunks = rerankedDocs.map(d => ({
      page:    d.page,
      excerpt: d.text.slice(0, 120) + "…", // Expose child chunk to UI
    }));

    res.json({ answer, chunks });

  } catch (err) {
    console.error("[/api/query]", err);

    if (err.status === 429) {
      return res.status(429).json({
        error: "Groq rate limit reached. Please wait a moment and try again.",
      });
    }

    res.status(500).json({ error: err.message });
  }
});

export default router;
