# Mindreader

A TypeScript-powered reasoning and research engine for intelligent code analysis.

## Features

- **🧠 Code Reasoning**: Analyze code changes and provide intelligent insights
- **🔍 Research**: Conduct research on specific topics and synthesize information
- **📋 PR Review**: Automated comprehensive code reviews on pull requests
- **⚡ CLI Tool**: Fast, local command-line interface for analysis
- **🤖 GitHub Action**: Automatic analysis on PR events

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm
- Groq API key (get one at [groq.com](https://groq.com))

### Installation

```bash
pnpm install
```

### Configuration

Create a `.env` file in the project root:

```bash
cp .env.example .env
# Edit .env and add your GROQ_API_KEY
```

## CLI Usage

### Analyze Code

```bash
pnpm -C scripts run mindreader:reason -- --files "src/index.ts" "src/utils.ts"
```

### Conduct Research

```bash
pnpm -C scripts run mindreader:research -- --query "How does authentication work in this codebase?"
```

### Review a PR

```bash
pnpm -C scripts run mindreader:review -- --pr-number 42 --repo owner/repo
```

### See All Options

```bash
pnpm -C scripts run mindreader -- --help
pnpm -C scripts run mindreader reason -- --help
pnpm -C scripts run mindreader research -- --help
pnpm -C scripts run mindreader review -- --help
```

## GitHub Action

The GitHub Action automatically runs on:

- Pull request creation/updates
- Manual workflow dispatch

### Setup

1. Add your Groq API key as a GitHub secret:
   - Go to **Settings** → **Secrets and variables** → **Actions**
   - Create `GROQ_API_KEY`

2. The action will automatically analyze PRs and post comments

### Manual Trigger

Go to **Actions** → **Reasoning & Research Analysis** → **Run workflow** and specify:
- Query or analysis mode
- PR number (if applicable)

## Project Structure

```
├── .github/workflows/reasoning-research.yml  # GitHub Action
├── scripts/
│   ├── src/
│   │   ├── mindreader.ts                     # CLI entry point
│   │   ├── reasoning/
│   │   │   └── engine.ts                     # Reasoning logic
│   │   └── research/
│   │       └── engine.ts                     # Research logic
│   └── package.json
├── .env.example                               # Environment template
└── README.md
```

## Architecture

- **ReasoningEngine**: Uses Groq's Mixtral model for code analysis
- **ResearchEngine**: Conducts structured research and synthesizes findings
- **CLI**: Commander.js-based command-line interface
- **GitHub Action**: Integrates with GitHub's native CI/CD

## API Keys

### Groq API

Get a free API key at [console.groq.com](https://console.groq.com)

Models available:
- `mixtral-8x7b-32768` (fast, powerful)
- `llama2-70b-4096`
- `gemma-7b-it`

## Development

### Build

```bash
pnpm run build
```

### Type Check

```bash
pnpm run typecheck
```

### Local Testing

```bash
# Test reasoning
pnpm -C scripts run mindreader:reason -- --files "package.json"

# Test research
pnpm -C scripts run mindreader:research -- --query "What is this project about?"
```

## License

MIT
