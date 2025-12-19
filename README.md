# NYT Arena

[![Bun](https://img.shields.io/badge/Bun-1.0+-black?style=flat-square&logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![OpenRouter](https://img.shields.io/badge/OpenRouter-API-purple?style=flat-square)](https://openrouter.ai/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![Ink](https://img.shields.io/badge/Ink-Terminal%20UI-green?style=flat-square)](https://github.com/vadimdemedes/ink)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

> 🎯 **LLM Benchmark for NYT Crosswords and Connections puzzles**

Evaluate Large Language Models on interactive puzzle-solving tasks with real-time progress tracking, concurrent execution, and detailed metrics.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎯 **Game-Faithful Feedback** | Environments emulate exact NYT game mechanics |
| 🔄 **Concurrent Workers** | Per-model workers run in parallel |
| 📊 **Live Dashboard** | Beautiful real-time CLI with progress, metrics, activity |
| 🏆 **Leaderboard** | Automatic model ranking by success rate |
| 💰 **Cost Tracking** | Token usage and OpenRouter API costs |
| ⚡ **Performance Metrics** | Tokens/sec, solve times, latency tracking |
| 📝 **Detailed Tracing** | Every step persisted with full context |
| ✅ **Structured Outputs** | JSON schema enforcement for reliable parsing |

---

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh/) runtime (v1.0+)
- [OpenRouter API key](https://openrouter.ai/keys)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/NYT_Arena.git
cd NYT_Arena

# Install dependencies
bun install

# Set up environment variables
cp .env.example .env
# Edit .env and add your OPENROUTER_API_KEY
```

### First Run

```bash
# 1. Normalize puzzle data (918 connections puzzles)
bun run normalize:connections

# 2. List available puzzles
bun run list -t connections

# 3. Run a benchmark (dry run first)
bun run run:suite -s suites/connections-test.json --dry-run

# 4. Run the actual benchmark with live dashboard
bun run run:suite -s suites/connections-test.json
```

---

## 📊 Live Dashboard

When you run a benchmark, you'll see a real-time dashboard:

```
╔══════════════════════════════════════════════════════════════════════════════╗
║ 🎯 NYT Arena Benchmark │ connections-test │ ⠋ Running │ ⏱ 1m 23s            ║
╚══════════════════════════════════════════════════════════════════════════════╝
Overall Progress: [████████████░░░░░░░░░░░░░░░░░░░] 38.5% (5/13)
════════════════════════════════════════════════════════════════════════════════
📊 Global Statistics
Progress: 5/13 (38.5%)       Total Tokens: 12.5K      Total Cost: $0.0042
✓ Success: 3                 ├ Prompt: 10.2K          Total Time: 45.2s
✗ Failed: 2                  └ Completion: 2.3K       Fastest Solve: 3.2s
⏱ Timeout: 0                 Tokens/sec: 276.4        Slowest Solve: 12.1s
────────────────────────────────────────────────────────────────────────────────
🤖 Model Workers
Model                           Progress    W/L       Rate      Tokens    Tok/s     Cost      Status
────────────────────────────────────────────────────────────────────────────────
● openai/gpt-4o-mini            2/5        2/0       100%      4.2K      312/s     $0.0015   ⠋ Step 3
● anthropic/claude-3-haiku      2/5        1/1       50%       5.1K      245/s     $0.0018   ⠋ Step 5
● google/gemini-2.0-flash       1/3        0/1       0%        3.2K      198/s     $0.0009   ⠋ Step 2
────────────────────────────────────────────────────────────────────────────────
📜 Recent Activity
✓ openai/gpt-4o-mini solved connections-2023-06-13
→ anthropic/claude-3-haiku step 4 (156 tok) 892ms
→ google/gemini-2.0-flash step 1 (203 tok) 1.2s
▶ openai/gpt-4o-mini started connections-2023-06-14
```

### 🏆 Final Leaderboard

When complete, see the final rankings:

```
╔══════════════════════════════════════════════════════════════════════════════╗
║ 🎉 NYT Arena Benchmark Complete! │ connections-test │ Total Time: 5m 23s    ║
╚══════════════════════════════════════════════════════════════════════════════╝

📊 Overall Results
────────────────────────────────────────────────────────────────────────────────
Total Runs: 15          ✓ Solved: 10         Total Tokens: 45.2K    Total Cost: $0.0156
Success Rate: 66.7%     ✗ Failed: 5          Avg Tokens/s: 289.3    API Time: 2m 36s

🏆 Model Leaderboard
────────────────────────────────────────────────────────────────────────────────
#    Model                                  Success %   W/L       Tokens      Tok/s       Cost
────────────────────────────────────────────────────────────────────────────────
🥇  openai/gpt-4o-mini                      80.0%      4/1       12.3K       312.4/s     $0.0045
🥈  anthropic/claude-3-haiku-20240307       60.0%      3/2       18.5K       245.1/s     $0.0062
🥉  google/gemini-2.0-flash-001             60.0%      3/2       14.4K       198.7/s     $0.0049
```

---

## 📖 CLI Commands

```bash
# Main CLI
bun run cli --help

# Run a benchmark suite (with dashboard)
bun run cli run -s <suite.json> [-o <output-dir>] [--dry-run] [--no-dashboard]

# Normalize raw data
bun run cli normalize -t connections|crossword

# List available puzzles
bun run cli list [-t <type>] [-l <limit>]

# List OpenRouter models
bun run cli models [-f <filter>]
```

---

## ⚙️ Suite Configuration

Create a JSON file in `suites/`:

```json
{
  "name": "my-benchmark",
  "description": "Benchmark description",

  "models": [
    "openai/gpt-4o-mini",
    "anthropic/claude-3-haiku-20240307",
    "google/gemini-2.0-flash-001"
  ],

  "puzzles": {
    "type": "connections",
    "dateRange": { "start": "2023-06-12", "end": "2023-12-31" },
    "limit": 10,
    "shuffle": false
  },

  "repeats": 1,
  "maxSteps": 20,
  "runTimeoutMs": 180000,
  "stepTimeoutMs": 30000,

  "maxConcurrentRuns": 5,
  "maxConcurrentRequests": 10,

  "openRouter": {
    "includeUsage": true,
    "temperature": 0,
    "maxTokens": 512
  },

  "maxInvalidActions": 5
}
```

---

## 📁 Project Structure

```
NYT_Arena/
├── src/
│   ├── cli/                  # Command-line interface
│   ├── client/               # OpenRouter API client
│   ├── dashboard/            # Ink-based live dashboard
│   │   ├── App.tsx           # Main dashboard app
│   │   ├── Dashboard.tsx     # Live progress view
│   │   ├── FinalSummary.tsx  # Completion leaderboard
│   │   └── types.ts          # State management
│   ├── data/                 # Data normalization scripts
│   ├── environments/         # Game simulators
│   │   ├── ConnectionsEnv.ts # NYT Connections game
│   │   └── CrosswordEnv.ts   # NYT Crossword game
│   ├── runner/               # Benchmark runners
│   │   ├── runner.ts         # Legacy runner
│   │   └── concurrent-runner.ts # Per-model workers
│   └── schemas/              # Zod validation schemas
├── data/
│   ├── raw/                  # Raw puzzle data
│   └── normalized/           # Canonical JSON format
├── suites/                   # Benchmark configurations
├── runs/                     # Output artifacts
└── reports/                  # Generated reports
```

---

## 🎮 Supported Games

### Connections

| Feature | Details |
|---------|---------|
| **Objective** | Group 16 words into 4 categories of 4 |
| **Mistakes** | 4 allowed before game over |
| **Feedback** | Correct, incorrect, "one away" hints |
| **Actions** | `submit_group`, `give_up` |
| **Puzzles** | 918+ available (June 2023 - present) |

### Crossword

| Feature | Details |
|---------|---------|
| **Objective** | Fill the grid based on clues |
| **Actions** | `fill_entry`, `clear_entry`, `check_entry`, `submit_puzzle`, `give_up` |
| **Options** | `allowChecks`, `allowReveals` (suite config) |
| **Puzzles** | NYT crosswords 1977-2018 (requires re-acquisition) |

---

## 📈 Metrics Tracked

| Category | Metrics |
|----------|---------|
| **Progress** | Runs completed, per-model progress |
| **Results** | Success/fail/timeout/error counts |
| **Tokens** | Prompt, completion, total, tokens/sec |
| **Cost** | Per-step, per-model, total API cost |
| **Timing** | Latency, solve times, fastest/slowest |
| **Game** | Steps to solve, mistakes made, groups found |

---

## 🔧 Development

```bash
# Run TypeScript checks
bun run typecheck

# Run tests
bun test

# List normalized puzzles
bun run list -t connections -l 20
```

---

## 🌐 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENROUTER_API_KEY` | OpenRouter API key | ✅ Yes |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | ❌ No |

---

## 🙏 Acknowledgments

- [OpenRouter](https://openrouter.ai/) - Unified LLM API access
- [Ink](https://github.com/vadimdemedes/ink) - React for CLI
- [Bun](https://bun.sh/) - Fast JavaScript runtime
- NYT Games - Original puzzle formats
- Community datasets - Puzzle data sources
