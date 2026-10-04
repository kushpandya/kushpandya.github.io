# Projects — Proof of Work

Two systems, built to be trusted with real decisions.

## kvd — MCP server for hybrid knowledge search & retrieval

**Type:** Personal / Open Source · 2025

- Production-ready **MCP server** combining **BM25 + vector similarity** via **Reciprocal Rank Fusion**.
- Full **CRUD note management**, **OAuth 2.1 + PKCE**, and **local embeddings via Ollama**.

**Tech stack:** Python · FastMCP · SQLite FTS5 · sqlite-vec · OAuth 2.1

## AgentMesh NOC — Multi-agent system for autonomous network fault diagnosis

**Type:** Personal / Proof-of-Concept · 2025

- **Detection, Triage, and Response agents** coordinated via **LangGraph**.
- Uses **kvd as the MCP memory layer** plus a **policy gate** for production safety.

**Tech stack:** Python · LangGraph · MCP · Docker
