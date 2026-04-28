# 🚀 ContextIQ

ContextIQ is an intelligent middleware layer between applications and Large Language Models (LLMs) that reduces cost, optimizes token usage, and improves response efficiency using caching, semantic memory, and smart orchestration.

---

# 🧠 Problem Statement

Modern AI applications using LLMs face:

- High API costs due to repeated or similar queries
- Redundant token usage from sending full context repeatedly
- No memory across requests
- Direct dependency on LLM calls for every request
- Poor scalability and inefficient prompt usage

---

# 💡 Solution

ContextIQ acts as a **smart AI orchestration layer** that sits between your application and LLM providers.

It:

- Avoids unnecessary LLM calls
- Uses semantic understanding to detect similar queries
- Reuses past responses intelligently
- Optimizes prompts before sending to LLM
- Tracks cost, tokens, and performance metrics

---

# 🏗️ System Architecture
Client Application
↓
ContextIQ Middleware
↓
┌───────────────────────────────┐
│ Orchestrator Engine │
└───────────────────────────────┘
↓
┌──────────────┬──────────────┬──────────────┐
│ Redis Cache │ Qdrant │ LLM Adapter │
│ (Fast Cache) │ (Semantic DB)│ (OpenAI/Claude)│
└──────────────┴──────────────┴──────────────┘
↓
PostgreSQL (Logs, Metrics, Analytics)

---

# ⚙️ Core Components

## 1. Orchestrator Engine (Brain of System)
Handles decision-making:

- Check Redis cache first
- If miss → check Qdrant similarity
- If needed → call LLM
- Store results for future reuse

---

## 2. Redis Cache (Fast Layer)
Stores:

- Full LLM responses
- Frequently repeated queries
- Temporary cached results (TTL-based)

Purpose:

- Instant response for repeated queries
- Eliminates redundant LLM calls

---

## 3. Qdrant (Semantic Memory Layer)
Stores:

- Embeddings of user queries
- Meaning-based representations of requests

Purpose:

- Detect similar intent queries
- Enable reuse of past knowledge
- Reduce unnecessary LLM calls

---

## 4. LLM Adapter
A unified interface for:

- OpenAI
- Claude
- Other LLM providers

Purpose:

- Abstract LLM integration
- Easy switching between providers

---

## 5. PostgreSQL (Observability Layer)
Stores:

- Requests & responses
- Token usage
- Cache hit/miss ratio
- Cost analytics
- Performance metrics

---

# 🔁 Request Flow
User sends query
Check Redis (exact match)
→ HIT → return response
If MISS:
→ Query Qdrant (semantic similarity)
If similar context found:
→ Build optimized prompt
Call LLM (if required)
Store results:
→ Redis (cache response)
→ Qdrant (embedding memory)
→ PostgreSQL (analytics)
Return response to user


---

# 🧪 Example API

## POST /query

### Request
```json
{
  "prompt": "Build a login page with React and Node.js authentication",
  "userId": "123"
}

Response
{
  "response": "Generated React login page with Node.js backend...",
  "source": "llm",
  "cacheHit": false,
  "costSaved": 0.0
}