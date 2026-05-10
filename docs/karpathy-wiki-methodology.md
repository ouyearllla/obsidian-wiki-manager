# LLM Wiki — A Pattern for Building Personal Knowledge Bases

> By [Andrej Karpathy](https://karpathy.ai) · English summary

A methodology for using LLMs to incrementally build and maintain a persistent, structured personal wiki — a living, compounding knowledge artifact.

## The Problem with RAG

Most people use LLMs with documents like RAG: upload files, the LLM retrieves relevant snippets at query time, generates an answer. It works, but the LLM re-discovers knowledge from scratch every time. Nothing accumulates. Ask a nuanced question spanning five documents, and the LLM must rediscover and piece together the fragments each time.

## The Wiki Mindset

Instead of retrieving from raw documents at query time, the LLM **incrementally builds and maintains a persistent wiki** — a structured, interlinked collection of Markdown files that sits between you and your source materials.

When you add a new document, the LLM doesn't just index it. It reads, extracts key information, and integrates it into the existing wiki — updating entity pages, revising topic summaries, flagging where new data contradicts old conclusions, strengthening or challenging evolving syntheses. Knowledge is compiled once and *kept continuously up to date*, not re-derived with every query.

**The key difference**: a wiki is a persistent, compounding artifact. Cross-references are already in place. Contradictions are flagged. Syntheses already reflect everything you've read. Each new document and each question makes the wiki richer.

## Architecture: Three Layers

| Layer | Contents | Managed by |
|-------|----------|------------|
| **Raw** | Curated source documents — articles, papers, images, data | You (read-only for AI) |
| **Wiki** | Structured Markdown — summaries, entities, concepts, comparisons | AI (read-only for you) |
| **Schema** | Rules for structure, conventions, and workflows | Both, evolving together |

## Operations

**Ingest.** You drop a new document into the raw layer and tell the LLM to process it. The LLM reads, discusses key points with you, writes a summary page, updates the index, updates related entity and concept pages, and appends to the log. One document may touch 10–15 wiki pages.

**Query.** You ask questions against the wiki. The LLM searches relevant pages, reads them, and synthesizes answers with citations. Critical insight: **good answers can be archived as new wiki pages.** Comparisons you requested, connections you discovered — these compound in the knowledge base.

**Lint.** Periodically, ask the LLM to health-check the wiki: find contradictions, outdated conclusions superseded by newer documents, orphan pages with no inbound links, important concepts missing dedicated pages, missing cross-references, data gaps fillable by web search.

## Index & Log

- **index.md** — Content-oriented. A directory of everything in the wiki, organized by category. The LLM reads it first when answering queries and updates it after every ingest.
- **log.md** — Time-oriented. Append-only record of what happened when. A consistent prefix format (`## [YYYY-MM-DD] ingest | Title`) makes it grep-able.

## Why This Works

The drudgery of maintaining a knowledge base isn't reading or thinking — it's the bookkeeping. Updating cross-references, keeping summaries current, flagging contradictions, maintaining consistency across dozens of pages. Humans abandon wikis because the maintenance burden grows faster than the value. LLMs don't get bored, don't forget to update cross-references, and can touch 15 files in a single operation. The wiki stays maintained because the maintenance cost approaches zero.

Your job: curate materials, guide analysis, ask good questions. The LLM's job: everything else.

## Relationship to Memex

This idea is spiritually related to Vannevar Bush's Memex (1945) — a personal, curated knowledge store with associative trails between documents. Bush's vision was closer to this than to today's internet: private, actively curated, where connections between documents are as valuable as the documents themselves. The part he couldn't solve was "who does the maintenance." LLMs solve that.

## Note

This document is intentionally abstract — it describes the philosophy, not the implementation. The exact directory structure, schema conventions, page formats, and toolchain all depend on your domain, preferences, and LLM of choice. Share this document with your AI agent and collaboratively instantiate a version that fits your needs.
