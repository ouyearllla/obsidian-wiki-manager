# Wiki Manager

Obsidian plugin for managing a Wiki knowledge base. Scan `raw/` for unprocessed files, trigger AI-powered ingest, run lint checks — all from a sidebar panel.

## Features

- **Scan raw/** — Detects files in `raw/` that haven't been referenced by any source page in `wiki/来源/`
- **One-click Ingest** — Sends an ingest request directly to the [Claudian](https://github.com/YishenTu/claudian) AI assistant
- **Wiki Stats** — Shows counts of source, concept, entity, and comparison pages
- **Lint Check** — Displays health check checklist, can notify Claudian to execute
- **Open Index** — Quick open `wiki/index.md`

## How It Works

Wiki Manager integrates with [Claudian](https://github.com/YishenTu/claudian) — an Obsidian plugin that embeds Claude Code as an AI collaborator. When you click "Ingest", the plugin calls Claudian's internal API to send a message directly into the conversation, triggering the AI to process the raw file according to your knowledge base workflow.

**Fallback**: If Claudian is not detected, the plugin writes tasks to `.claude/pending-ingest.json` for batch processing on next session start.

### Vault Structure

The plugin expects a vault organized like this:

```
vault/
├── raw/                     # Raw materials (user-managed)
├── wiki/                    # Knowledge base (AI-maintained)
│   ├── index.md
│   ├── log.md
│   ├── 来源/                # Source summaries
│   ├── 概念/                # Concept pages
│   ├── 实体/                # Entity pages
│   └── 对比/                # Comparison pages
└── CLAUDE.md                # Workflow schema
```

The detection logic checks source pages in `wiki/来源/` for `[[raw/...]]` wikilinks or `source:` frontmatter references to determine which raw files have been processed.

## Installation

### From Source

1. Copy `main.js`, `manifest.json`, and `styles.css` to `.obsidian/plugins/wiki-manager/` in your vault
2. Enable the plugin in Settings → Community plugins → Wiki Manager

### Via BRAT (Beta Reviewers Auto-update Tester)

Add this repository URL in BRAT settings.

## Requirements

- Obsidian ≥ 1.4.0
- [Claudian](https://github.com/YishenTu/claudian) plugin (for real-time ingest)

## License

MIT

## Author

oll
