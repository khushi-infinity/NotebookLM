# Backend — NotebookLM RAG

Node.js + Express REST API powering the RAG pipeline.

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in environment variables
cp .env.example .env

# 3. Start Qdrant (vector database) via Docker
docker compose up -d

# 4. Start the server
npm start         # production
npm run dev       # development (auto-restarts on file change)
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GROQ_API_KEY` | Free key from https://console.groq.com |
| `QDRANT_URL` | Qdrant instance URL (default: `http://localhost:6333`) |
| `PORT` | Server port (default: `3000`) |

## Chunking Strategy

| Parameter | Value | Why |
|-----------|-------|-----|
| Splitter | Recursive character splitter | Respects natural text boundaries |
| Chunk size | 1000 chars | ~250 tokens — good semantic density |
| Overlap | 200 chars | Preserves context across boundaries |
| Separators | `\n\n → \n → ". " → " "` | Paragraph-first split hierarchy |
| Top-k | 4 chunks | Balances recall vs context length |
| Embedding model | `nomic-embed-text-v1.5` | Best Groq free-tier accuracy, 768-dim |
| LLM | `llama-3.3-70b-versatile` | Fast, high-quality grounded answers |
