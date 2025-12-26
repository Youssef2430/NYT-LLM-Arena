import chalk from "chalk";
import { join } from "path";
import { readdir, stat } from "fs/promises";
import type { RunSummary } from "../schemas/config.js";

// ========================================
// Types
// ========================================

interface ModelStats {
  modelId: string;
  totalRuns: number;
  wins: number;
  losses: number;
  timeouts: number;
  errors: number;
  winRate: number;
  avgSteps: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  avgCostPerRun: number;
  avgTokensPerRun: number;
  avgLatencyMs: number;
  tokensPerSecond: number;
  fastestWin: number | null;
  slowestWin: number | null;
  recentWins: number; // wins in last 10 runs
  streak: number; // current win streak (positive) or loss streak (negative)
}

interface LeaderboardOptions {
  runsDir: string;
  type?: "connections" | "crossword";
  since?: string; // ISO date string
  limit?: number;
  sortBy?: "wins" | "rate" | "cost" | "tokens" | "speed";
}

// ========================================
// Box Drawing Characters
// ========================================

const BOX = {
  topLeft: "╭",
  topRight: "╮",
  bottomLeft: "╰",
  bottomRight: "╯",
  horizontal: "─",
  vertical: "│",
};

const THICK_BOX = {
  topLeft: "┏",
  topRight: "┓",
  bottomLeft: "┗",
  bottomRight: "┛",
  horizontal: "━",
  vertical: "┃",
};

// ========================================
// Utility Functions
// ========================================

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

function truncateText(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  return text.slice(0, maxWidth - 1) + "…";
}

function padRight(str: string, width: number): string {
  return str.padEnd(width);
}

function padLeft(str: string, width: number): string {
  return str.padStart(width);
}

function centerText(text: string, width: number): string {
  const padding = Math.max(0, width - text.length);
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;
  return " ".repeat(leftPad) + text + " ".repeat(rightPad);
}

// ========================================
// Data Collection
// ========================================

async function collectAllRuns(runsDir: string): Promise<RunSummary[]> {
  const runs: RunSummary[] = [];

  try {
    const suites = await readdir(runsDir);

    for (const suite of suites) {
      const suitePath = join(runsDir, suite);
      const suiteStat = await stat(suitePath);
      if (!suiteStat.isDirectory()) continue;

      const timestamps = await readdir(suitePath);

      for (const timestamp of timestamps) {
        const timestampPath = join(suitePath, timestamp);
        const timestampStat = await stat(timestampPath);
        if (!timestampStat.isDirectory()) continue;

        const models = await readdir(timestampPath);

        for (const model of models) {
          const modelPath = join(timestampPath, model);
          const modelStat = await stat(modelPath);
          if (!modelStat.isDirectory()) continue;

          const puzzles = await readdir(modelPath);

          for (const puzzle of puzzles) {
            const puzzlePath = join(modelPath, puzzle);
            const puzzleStat = await stat(puzzlePath);
            if (!puzzleStat.isDirectory()) continue;

            const runIds = await readdir(puzzlePath);

            for (const runId of runIds) {
              const runPath = join(puzzlePath, runId);
              const runStat = await stat(runPath);
              if (!runStat.isDirectory()) continue;

              const summaryPath = join(runPath, "summary.json");
              const summaryFile = Bun.file(summaryPath);

              if (await summaryFile.exists()) {
                try {
                  const summary: RunSummary = await summaryFile.json();
                  runs.push(summary);
                } catch {
                  // Skip invalid summaries
                }
              }
            }
          }
        }
      }
    }
  } catch {
    // runsDir may not exist
  }

  // Sort by timestamp (oldest first for streak calculation)
  runs.sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  return runs;
}

// ========================================
// Statistics Calculation
// ========================================

function calculateModelStats(
  modelId: string,
  runs: RunSummary[],
): ModelStats {
  const successStatuses = ["success", "success_clean", "success_with_reveals"];

  const wins = runs.filter((r) => successStatuses.includes(r.status)).length;
  const losses = runs.filter((r) => r.status === "fail").length;
  const timeouts = runs.filter((r) => r.status === "timeout").length;
  const errors = runs.filter((r) => r.status === "error").length;
  const totalRuns = runs.length;

  const totalTokens = runs.reduce((sum, r) => sum + r.usage.totalTokens, 0);
  const promptTokens = runs.reduce((sum, r) => sum + r.usage.promptTokens, 0);
  const completionTokens = runs.reduce(
    (sum, r) => sum + r.usage.completionTokens,
    0,
  );
  const totalCost = runs.reduce((sum, r) => sum + (r.costCreditsTotal || 0), 0);
  const totalLatencyMs = runs.reduce((sum, r) => sum + r.latencyMsTotal, 0);
  const totalSteps = runs.reduce((sum, r) => sum + r.stepsTaken, 0);

  // Calculate win times for fastest/slowest
  const winRuns = runs.filter((r) => successStatuses.includes(r.status));
  const winLatencies = winRuns.map((r) => r.latencyMsTotal);
  const fastestWin = winLatencies.length > 0 ? Math.min(...winLatencies) : null;
  const slowestWin = winLatencies.length > 0 ? Math.max(...winLatencies) : null;

  // Calculate recent performance (last 10 runs)
  const recent10 = runs.slice(-10);
  const recentWins = recent10.filter((r) =>
    successStatuses.includes(r.status),
  ).length;

  // Calculate current streak
  let streak = 0;
  for (let i = runs.length - 1; i >= 0; i--) {
    const run = runs[i]!;
    const isWin = successStatuses.includes(run.status);
    if (i === runs.length - 1) {
      streak = isWin ? 1 : -1;
    } else {
      if (streak > 0 && isWin) {
        streak++;
      } else if (streak < 0 && !isWin) {
        streak--;
      } else {
        break;
      }
    }
  }

  return {
    modelId,
    totalRuns,
    wins,
    losses,
    timeouts,
    errors,
    winRate: totalRuns > 0 ? (wins / totalRuns) * 100 : 0,
    avgSteps: totalRuns > 0 ? totalSteps / totalRuns : 0,
    totalTokens,
    promptTokens,
    completionTokens,
    totalCost,
    avgCostPerRun: totalRuns > 0 ? totalCost / totalRuns : 0,
    avgTokensPerRun: totalRuns > 0 ? totalTokens / totalRuns : 0,
    avgLatencyMs: totalRuns > 0 ? totalLatencyMs / totalRuns : 0,
    tokensPerSecond:
      totalLatencyMs > 0 ? (totalTokens / totalLatencyMs) * 1000 : 0,
    fastestWin,
    slowestWin,
    recentWins,
    streak,
  };
}

// ========================================
// Leaderboard Display
// ========================================

function getMedalEmoji(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return "  ";
}

function getStreakDisplay(streak: number): string {
  if (streak >= 5) return chalk.hex("#2ECC71")(`🔥 ${streak}W`);
  if (streak >= 3) return chalk.hex("#58D68D")(`${streak}W`);
  if (streak > 0) return chalk.hex("#82E0AA")(`${streak}W`);
  if (streak <= -5) return chalk.hex("#E74C3C")(`❄️ ${Math.abs(streak)}L`);
  if (streak <= -3) return chalk.hex("#EC7063")(`${Math.abs(streak)}L`);
  if (streak < 0) return chalk.hex("#F1948A")(`${Math.abs(streak)}L`);
  return chalk.gray("-");
}

function getTrendArrow(recentWins: number): string {
  if (recentWins >= 8) return chalk.hex("#2ECC71")("↑↑");
  if (recentWins >= 6) return chalk.hex("#58D68D")("↑");
  if (recentWins <= 2) return chalk.hex("#E74C3C")("↓");
  if (recentWins <= 4) return chalk.hex("#F39C12")("→");
  return chalk.gray("→");
}

function getWinRateColor(rate: number): (s: string) => string {
  if (rate >= 80) return chalk.hex("#2ECC71").bold;
  if (rate >= 60) return chalk.hex("#58D68D");
  if (rate >= 40) return chalk.hex("#F7DC6F");
  if (rate >= 20) return chalk.hex("#F39C12");
  return chalk.hex("#E74C3C");
}

function createSparkline(runs: RunSummary[]): string {
  const successStatuses = ["success", "success_clean", "success_with_reveals"];
  const recent = runs.slice(-20);
  
  return recent
    .map((r) => {
      if (successStatuses.includes(r.status)) {
        return chalk.hex("#2ECC71")("█");
      } else if (r.status === "fail") {
        return chalk.hex("#E74C3C")("█");
      } else {
        return chalk.hex("#F39C12")("█");
      }
    })
    .join("");
}

export async function showLeaderboard(options: LeaderboardOptions): Promise<void> {
  const { runsDir, type, since, limit = 20, sortBy = "rate" } = options;

  // Collect all runs
  let allRuns = await collectAllRuns(runsDir);

  if (allRuns.length === 0) {
    console.log(chalk.yellow("\n  No runs found. Run some benchmarks first!\n"));
    console.log(chalk.gray("  Use: bun run cli run -s suites/connections-test.json\n"));
    return;
  }

  // Apply filters
  if (type) {
    allRuns = allRuns.filter((r) => r.task === type);
  }
  if (since) {
    const sinceDate = new Date(since);
    allRuns = allRuns.filter((r) => new Date(r.startedAt) >= sinceDate);
  }

  if (allRuns.length === 0) {
    console.log(chalk.yellow("\n  No runs match the specified filters.\n"));
    return;
  }

  // Group by model
  const runsByModel = new Map<string, RunSummary[]>();
  for (const run of allRuns) {
    const existing = runsByModel.get(run.modelId) || [];
    existing.push(run);
    runsByModel.set(run.modelId, existing);
  }

  // Calculate stats for each model
  const modelStats: ModelStats[] = [];
  for (const [modelId, runs] of runsByModel) {
    modelStats.push(calculateModelStats(modelId, runs));
  }

  // Sort by criteria
  switch (sortBy) {
    case "wins":
      modelStats.sort((a, b) => b.wins - a.wins);
      break;
    case "rate":
      modelStats.sort((a, b) => b.winRate - a.winRate);
      break;
    case "cost":
      modelStats.sort((a, b) => a.avgCostPerRun - b.avgCostPerRun);
      break;
    case "tokens":
      modelStats.sort((a, b) => b.tokensPerSecond - a.tokensPerSecond);
      break;
    case "speed":
      modelStats.sort((a, b) => a.avgLatencyMs - b.avgLatencyMs);
      break;
    default:
      modelStats.sort((a, b) => b.winRate - a.winRate);
  }

  // Limit results
  const displayStats = modelStats.slice(0, limit);

  // Calculate totals
  const totalRuns = allRuns.length;
  const totalModels = modelStats.length;
  const successStatuses = ["success", "success_clean", "success_with_reveals"];
  const totalWins = allRuns.filter((r) => successStatuses.includes(r.status)).length;
  const totalTokens = allRuns.reduce((sum, r) => sum + r.usage.totalTokens, 0);
  const totalCost = allRuns.reduce((sum, r) => sum + (r.costCreditsTotal || 0), 0);

  // Render header
  console.log("");
  const headerWidth = 100;
  console.log(
    chalk.hex("#4ECDC4").bold(
      `  ${THICK_BOX.topLeft}${THICK_BOX.horizontal.repeat(headerWidth)}${THICK_BOX.topRight}`,
    ),
  );
  console.log(
    chalk.hex("#4ECDC4").bold(`  ${THICK_BOX.vertical}`) +
      chalk.white.bold(centerText("🏆 NYT ARENA - GLOBAL LEADERBOARD 🏆", headerWidth)) +
      chalk.hex("#4ECDC4").bold(THICK_BOX.vertical),
  );
  console.log(
    chalk.hex("#4ECDC4").bold(
      `  ${THICK_BOX.bottomLeft}${THICK_BOX.horizontal.repeat(headerWidth)}${THICK_BOX.bottomRight}`,
    ),
  );
  console.log("");

  // Global stats summary
  console.log(chalk.hex("#7F8C8D")("  Global Statistics"));
  console.log(chalk.hex("#555")(("  " + "─".repeat(50))));
  console.log(
    chalk.gray("  Total Runs: ") +
      chalk.white.bold(totalRuns.toLocaleString()) +
      chalk.gray("  │  Models Tested: ") +
      chalk.white.bold(totalModels.toString()) +
      chalk.gray("  │  Overall Win Rate: ") +
      getWinRateColor((totalWins / totalRuns) * 100)(
        `${((totalWins / totalRuns) * 100).toFixed(1)}%`,
      ),
  );
  console.log(
    chalk.gray("  Total Tokens: ") +
      chalk.hex("#4ECDC4")(formatNumber(totalTokens)) +
      chalk.gray("  │  Total Cost: ") +
      chalk.hex("#2ECC71")(formatCost(totalCost)) +
      (type ? chalk.gray(`  │  Task: ${chalk.hex("#F7DC6F")(type)}`) : ""),
  );
  console.log("");

  // Table header
  const colWidths = {
    rank: 4,
    model: 32,
    runs: 6,
    wins: 10,
    rate: 8,
    avgSteps: 6,
    tokens: 8,
    cost: 10,
    speed: 8,
    trend: 6,
    streak: 7,
  };

  console.log(chalk.hex("#7F8C8D")("  Model Rankings"));
  console.log(chalk.hex("#555")("  " + "─".repeat(headerWidth)));
  
  // Column headers
  const headers =
    chalk.hex("#7F8C8D")(
      "  " +
        padRight("#", colWidths.rank) +
        padRight("Model", colWidths.model) +
        padLeft("Runs", colWidths.runs) +
        padLeft("W/L", colWidths.wins) +
        padLeft("Rate", colWidths.rate) +
        padLeft("Steps", colWidths.avgSteps) +
        padLeft("Tokens", colWidths.tokens) +
        padLeft("Cost/Run", colWidths.cost) +
        padLeft("Tok/s", colWidths.speed) +
        padLeft("Trend", colWidths.trend) +
        padLeft("Streak", colWidths.streak),
    );
  console.log(headers);
  console.log(chalk.hex("#444")("  " + "─".repeat(headerWidth)));

  // Render each model
  for (let i = 0; i < displayStats.length; i++) {
    const stats = displayStats[i]!;
    const rank = i + 1;
    const medal = getMedalEmoji(rank);
    
    // Truncate model name, show provider/model format nicely
    const modelParts = stats.modelId.split("/");
    let modelDisplay: string;
    if (modelParts.length >= 2) {
      const provider = modelParts[0]!.slice(0, 8);
      const model = modelParts.slice(1).join("/");
      modelDisplay = truncateText(`${provider}/${model}`, colWidths.model - 2);
    } else {
      modelDisplay = truncateText(stats.modelId, colWidths.model - 2);
    }

    const rateColor = getWinRateColor(stats.winRate);
    const winsLosses = `${stats.wins}/${stats.losses}`;

    // Build row
    const row =
      "  " +
      padRight(`${medal}`, colWidths.rank) +
      chalk.white(padRight(modelDisplay, colWidths.model)) +
      chalk.hex("#95A5A6")(padLeft(stats.totalRuns.toString(), colWidths.runs)) +
      chalk.hex("#58D68D")(padLeft(winsLosses, colWidths.wins)) +
      rateColor(padLeft(`${stats.winRate.toFixed(1)}%`, colWidths.rate)) +
      chalk.hex("#95A5A6")(padLeft(stats.avgSteps.toFixed(1), colWidths.avgSteps)) +
      chalk.hex("#4ECDC4")(padLeft(formatNumber(stats.avgTokensPerRun), colWidths.tokens)) +
      chalk.hex("#2ECC71")(padLeft(formatCost(stats.avgCostPerRun), colWidths.cost)) +
      chalk.hex("#9B59B6")(padLeft(stats.tokensPerSecond.toFixed(0), colWidths.speed)) +
      padLeft(getTrendArrow(stats.recentWins), colWidths.trend) +
      padLeft(getStreakDisplay(stats.streak), colWidths.streak);

    console.log(row);

    // Add sparkline for top 5 models
    if (rank <= 5) {
      const modelRuns = runsByModel.get(stats.modelId) || [];
      const sparkline = createSparkline(modelRuns);
      if (sparkline) {
        console.log(
          chalk.hex("#444")(
            "  " +
              " ".repeat(colWidths.rank) +
              "Last 20: " +
              sparkline,
          ),
        );
      }
    }
  }

  // Footer
  console.log(chalk.hex("#444")("  " + "─".repeat(headerWidth)));

  if (modelStats.length > limit) {
    console.log(
      chalk.hex("#7F8C8D")(`  ... and ${modelStats.length - limit} more models`),
    );
  }

  // Legend
  console.log("");
  console.log(chalk.hex("#7F8C8D")("  Legend"));
  console.log(chalk.hex("#555")("  " + "─".repeat(40)));
  console.log(
    chalk.gray("  ") +
      chalk.hex("#2ECC71")("█") +
      chalk.gray(" Win  ") +
      chalk.hex("#E74C3C")("█") +
      chalk.gray(" Loss  ") +
      chalk.hex("#F39C12")("█") +
      chalk.gray(" Timeout/Error"),
  );
  console.log(
    chalk.gray("  Trend: ") +
      chalk.hex("#2ECC71")("↑↑") +
      chalk.gray(" Hot (8+ wins)  ") +
      chalk.hex("#E74C3C")("↓") +
      chalk.gray(" Cold (<3 wins in last 10)"),
  );
  console.log(
    chalk.gray("  Streak: ") +
      chalk.hex("#2ECC71")("🔥 5W") +
      chalk.gray(" = 5 consecutive wins  ") +
      chalk.hex("#E74C3C")("❄️ 5L") +
      chalk.gray(" = 5 consecutive losses"),
  );
  console.log("");

  // Options help
  console.log(chalk.hex("#555")("  Options:"));
  console.log(chalk.hex("#7F8C8D")("    --type <type>      Filter by puzzle type (connections/crossword)"));
  console.log(chalk.hex("#7F8C8D")("    --since <date>     Only runs after date (YYYY-MM-DD)"));
  console.log(chalk.hex("#7F8C8D")("    --limit <n>        Number of models to show (default: 20)"));
  console.log(chalk.hex("#7F8C8D")("    --sort <by>        Sort by: wins, rate, cost, tokens, speed"));
  console.log("");
}

// Export for CLI
export { type LeaderboardOptions, type ModelStats };
