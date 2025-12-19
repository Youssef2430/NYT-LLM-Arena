import React from "react";
import { Box, Text, Newline } from "ink";
import type { DashboardState, WorkerState } from "./types.js";

// ========================================
// Utility Functions
// ========================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(6)}`;
  if (cost < 1) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toFixed(0);
}

function truncateModelName(modelId: string, maxLength: number = 35): string {
  if (modelId.length <= maxLength) return modelId;
  const parts = modelId.split("/");
  if (parts.length === 2) {
    const [provider, model] = parts;
    if (modelId.length > maxLength) {
      return `${provider}/${model!.slice(0, maxLength - provider!.length - 4)}...`;
    }
  }
  return modelId.slice(0, maxLength - 3) + "...";
}

// ========================================
// Model Result Row
// ========================================

interface ModelResultRowProps {
  worker: WorkerState;
  rank: number;
}

function ModelResultRow({ worker, rank }: ModelResultRowProps) {
  const total = worker.successCount + worker.failCount + worker.timeoutCount + worker.errorCount;
  const successRate = total > 0 ? (worker.successCount / total) * 100 : 0;

  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "  ";

  const rateColor = successRate >= 80 ? "green" : successRate >= 50 ? "yellow" : "red";

  return (
    <Box flexDirection="row" marginY={0}>
      <Box width={4}>
        <Text>{medal}</Text>
      </Box>
      <Box width={38}>
        <Text color="white">{truncateModelName(worker.modelId)}</Text>
      </Box>
      <Box width={12}>
        <Text color={rateColor}>{successRate.toFixed(1)}%</Text>
      </Box>
      <Box width={10}>
        <Text color="green">{worker.successCount}</Text>
        <Text color="gray">/</Text>
        <Text color="red">{worker.failCount}</Text>
      </Box>
      <Box width={12}>
        <Text color="cyan">{formatNumber(worker.totalTokens)}</Text>
      </Box>
      <Box width={12}>
        <Text color="magenta">{worker.tokensPerSecond.toFixed(1)}/s</Text>
      </Box>
      <Box width={12}>
        <Text color="green">{formatCost(worker.totalCost)}</Text>
      </Box>
    </Box>
  );
}

// ========================================
// Final Summary Component
// ========================================

interface FinalSummaryProps {
  state: DashboardState;
}

export function FinalSummary({ state }: FinalSummaryProps) {
  const { globalStats, workers, suiteName, startTime } = state;
  const totalTime = Date.now() - startTime;

  // Sort workers by success rate, then by tokens per second
  const sortedWorkers = Array.from(workers.values()).sort((a, b) => {
    const aTotal = a.successCount + a.failCount + a.timeoutCount + a.errorCount;
    const bTotal = b.successCount + b.failCount + b.timeoutCount + b.errorCount;
    const aRate = aTotal > 0 ? a.successCount / aTotal : 0;
    const bRate = bTotal > 0 ? b.successCount / bTotal : 0;

    if (bRate !== aRate) return bRate - aRate;
    return b.tokensPerSecond - a.tokensPerSecond;
  });

  const totalRuns = globalStats.successCount + globalStats.failCount + globalStats.timeoutCount + globalStats.errorCount;
  const overallSuccessRate = totalRuns > 0 ? (globalStats.successCount / totalRuns) * 100 : 0;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold color="cyan">
            ╔══════════════════════════════════════════════════════════════════════════════════════════╗
          </Text>
        </Box>
        <Box>
          <Text bold color="cyan">║</Text>
          <Text bold color="green"> 🎉 NYT Arena Benchmark Complete! </Text>
          <Text color="gray">│</Text>
          <Text color="white"> {suiteName} </Text>
          <Text color="gray">│</Text>
          <Text color="cyan"> Total Time: {formatDuration(totalTime)} </Text>
          <Text bold color="cyan">{" ".repeat(Math.max(0, 20 - formatDuration(totalTime).length))}║</Text>
        </Box>
        <Box>
          <Text bold color="cyan">
            ╚══════════════════════════════════════════════════════════════════════════════════════════╝
          </Text>
        </Box>
      </Box>

      {/* Overall Stats */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold color="white">📊 Overall Results</Text>
        </Box>
        <Box>
          <Text color="gray">{"─".repeat(90)}</Text>
        </Box>
        <Box flexDirection="row" gap={4}>
          <Box flexDirection="column" width={25}>
            <Box>
              <Text color="gray">Total Runs: </Text>
              <Text color="white" bold>{totalRuns}</Text>
            </Box>
            <Box>
              <Text color="gray">Success Rate: </Text>
              <Text color={overallSuccessRate >= 80 ? "green" : overallSuccessRate >= 50 ? "yellow" : "red"} bold>
                {overallSuccessRate.toFixed(1)}%
              </Text>
            </Box>
          </Box>
          <Box flexDirection="column" width={25}>
            <Box>
              <Text color="green">✓ Solved: </Text>
              <Text color="green" bold>{globalStats.successCount}</Text>
            </Box>
            <Box>
              <Text color="red">✗ Failed: </Text>
              <Text color="red">{globalStats.failCount}</Text>
            </Box>
            <Box>
              <Text color="yellow">⏱ Timeout: </Text>
              <Text color="yellow">{globalStats.timeoutCount}</Text>
            </Box>
          </Box>
          <Box flexDirection="column" width={25}>
            <Box>
              <Text color="gray">Total Tokens: </Text>
              <Text color="cyan" bold>{formatNumber(globalStats.totalTokens)}</Text>
            </Box>
            <Box>
              <Text color="gray">Avg Tokens/s: </Text>
              <Text color="magenta">{globalStats.avgTokensPerSecond.toFixed(1)}</Text>
            </Box>
          </Box>
          <Box flexDirection="column" width={25}>
            <Box>
              <Text color="gray">Total Cost: </Text>
              <Text color="green" bold>{formatCost(globalStats.totalCost)}</Text>
            </Box>
            <Box>
              <Text color="gray">API Time: </Text>
              <Text color="white">{formatDuration(globalStats.totalLatencyMs)}</Text>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Leaderboard */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold color="white">🏆 Model Leaderboard</Text>
        </Box>
        <Box>
          <Text color="gray">{"─".repeat(90)}</Text>
        </Box>
        {/* Header */}
        <Box flexDirection="row">
          <Box width={4}>
            <Text bold color="gray">#</Text>
          </Box>
          <Box width={38}>
            <Text bold color="gray">Model</Text>
          </Box>
          <Box width={12}>
            <Text bold color="gray">Success %</Text>
          </Box>
          <Box width={10}>
            <Text bold color="gray">W/L</Text>
          </Box>
          <Box width={12}>
            <Text bold color="gray">Tokens</Text>
          </Box>
          <Box width={12}>
            <Text bold color="gray">Tok/s</Text>
          </Box>
          <Box width={12}>
            <Text bold color="gray">Cost</Text>
          </Box>
        </Box>
        <Box>
          <Text color="gray">{"─".repeat(90)}</Text>
        </Box>
        {sortedWorkers.map((worker, index) => (
          <ModelResultRow key={worker.modelId} worker={worker} rank={index + 1} />
        ))}
      </Box>

      {/* Timing Stats */}
      {(globalStats.fastestSolve || globalStats.slowestSolve) && (
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text bold color="white">⚡ Timing Statistics</Text>
          </Box>
          <Box>
            <Text color="gray">{"─".repeat(90)}</Text>
          </Box>
          <Box flexDirection="row" gap={4}>
            {globalStats.fastestSolve && (
              <Box>
                <Text color="gray">Fastest Solve: </Text>
                <Text color="green" bold>{formatDuration(globalStats.fastestSolve)}</Text>
              </Box>
            )}
            {globalStats.slowestSolve && (
              <Box>
                <Text color="gray">Slowest Solve: </Text>
                <Text color="yellow">{formatDuration(globalStats.slowestSolve)}</Text>
              </Box>
            )}
            {globalStats.successCount > 0 && (
              <Box>
                <Text color="gray">Avg Solve Time: </Text>
                <Text color="cyan">{formatDuration(globalStats.avgTimeToSolve)}</Text>
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray">{"═".repeat(90)}</Text>
      </Box>
      <Box justifyContent="center">
        <Text color="gray">Results saved to </Text>
        <Text color="cyan" bold>runs/{suiteName}/</Text>
      </Box>
    </Box>
  );
}

export default FinalSummary;
