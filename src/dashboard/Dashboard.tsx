import React, { useState, useEffect } from "react";
import { Box, Text, Newline } from "ink";
import Spinner from "ink-spinner";
import type { DashboardState, WorkerState, RunEvent } from "./types.js";

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

function truncateModelName(modelId: string, maxLength: number = 30): string {
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

function getStatusColor(status: string): string {
  switch (status) {
    case "running":
      return "green";
    case "waiting":
      return "yellow";
    case "completed":
      return "cyan";
    case "error":
      return "red";
    default:
      return "gray";
  }
}

function getProgressBar(current: number, total: number, width: number = 20): string {
  const percentage = total > 0 ? current / total : 0;
  const filled = Math.round(percentage * width);
  const empty = width - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}

// ========================================
// Header Component
// ========================================

interface HeaderProps {
  suiteName: string;
  startTime: number;
  isComplete: boolean;
}

function Header({ suiteName, startTime, isComplete }: HeaderProps) {
  const [elapsed, setElapsed] = useState(Date.now() - startTime);

  useEffect(() => {
    if (isComplete) return;
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 100);
    return () => clearInterval(interval);
  }, [startTime, isComplete]);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color="cyan">
          ╔══════════════════════════════════════════════════════════════════════════════╗
        </Text>
      </Box>
      <Box>
        <Text bold color="cyan">
          ║
        </Text>
        <Text bold color="white">
          {" "}
          🎯 NYT Arena Benchmark{" "}
        </Text>
        <Text color="gray">│</Text>
        <Text color="yellow"> {suiteName} </Text>
        <Text color="gray">│</Text>
        {isComplete ? (
          <Text color="green"> ✓ Complete </Text>
        ) : (
          <Text color="green">
            {" "}
            <Spinner type="dots" /> Running{" "}
          </Text>
        )}
        <Text color="gray">│</Text>
        <Text color="white"> ⏱ {formatDuration(elapsed)} </Text>
        <Text bold color="cyan">
          {" ".repeat(Math.max(0, 25 - formatDuration(elapsed).length))}║
        </Text>
      </Box>
      <Box>
        <Text bold color="cyan">
          ╚══════════════════════════════════════════════════════════════════════════════╝
        </Text>
      </Box>
    </Box>
  );
}

// ========================================
// Global Stats Component
// ========================================

interface GlobalStatsProps {
  state: DashboardState;
}

function GlobalStats({ state }: GlobalStatsProps) {
  const { globalStats, completedRuns, totalRuns } = state;
  const progress = totalRuns > 0 ? (completedRuns / totalRuns) * 100 : 0;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box marginBottom={0}>
        <Text bold color="white">
          📊 Global Statistics
        </Text>
      </Box>
      <Box flexDirection="row" gap={2}>
        <Box flexDirection="column" width={26}>
          <Box>
            <Text color="gray">Progress: </Text>
            <Text color="cyan">
              {completedRuns}/{totalRuns}
            </Text>
            <Text color="gray"> ({progress.toFixed(1)}%)</Text>
          </Box>
          <Box>
            <Text color="green">✓ Success: {globalStats.successCount}</Text>
          </Box>
          <Box>
            <Text color="red">✗ Failed: {globalStats.failCount}</Text>
          </Box>
          <Box>
            <Text color="yellow">⏱ Timeout: {globalStats.timeoutCount}</Text>
          </Box>
        </Box>
        <Box flexDirection="column" width={26}>
          <Box>
            <Text color="gray">Total Tokens: </Text>
            <Text color="white">{formatNumber(globalStats.totalTokens)}</Text>
          </Box>
          <Box>
            <Text color="gray">├ Prompt: </Text>
            <Text color="blue">{formatNumber(globalStats.promptTokens)}</Text>
          </Box>
          <Box>
            <Text color="gray">└ Completion: </Text>
            <Text color="magenta">{formatNumber(globalStats.completionTokens)}</Text>
          </Box>
          <Box>
            <Text color="gray">Tokens/sec: </Text>
            <Text color="cyan">{globalStats.avgTokensPerSecond.toFixed(1)}</Text>
          </Box>
        </Box>
        <Box flexDirection="column" width={26}>
          <Box>
            <Text color="gray">Total Cost: </Text>
            <Text color="green">{formatCost(globalStats.totalCost)}</Text>
          </Box>
          <Box>
            <Text color="gray">Total Time: </Text>
            <Text color="white">{formatDuration(globalStats.totalLatencyMs)}</Text>
          </Box>
          <Box>
            <Text color="gray">Fastest Solve: </Text>
            <Text color="cyan">
              {globalStats.fastestSolve ? formatDuration(globalStats.fastestSolve) : "-"}
            </Text>
          </Box>
          <Box>
            <Text color="gray">Slowest Solve: </Text>
            <Text color="yellow">
              {globalStats.slowestSolve ? formatDuration(globalStats.slowestSolve) : "-"}
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

// ========================================
// Worker Row Component
// ========================================

interface WorkerRowProps {
  worker: WorkerState;
}

function WorkerRow({ worker }: WorkerRowProps) {
  const statusIcon = {
    idle: "○",
    running: "●",
    waiting: "◐",
    completed: "✓",
    error: "✗",
  }[worker.status];

  const successRate =
    worker.completedRuns > 0
      ? ((worker.successCount / worker.completedRuns) * 100).toFixed(0)
      : "-";

  return (
    <Box flexDirection="row">
      <Box width={32}>
        <Text color={getStatusColor(worker.status)}>{statusIcon} </Text>
        <Text color="white">{truncateModelName(worker.modelId, 28)}</Text>
      </Box>
      <Box width={12}>
        <Text color="gray">
          {worker.completedRuns}/{worker.totalRuns}
        </Text>
      </Box>
      <Box width={10}>
        <Text color="green">{worker.successCount}</Text>
        <Text color="gray">/</Text>
        <Text color="red">{worker.failCount}</Text>
      </Box>
      <Box width={10}>
        <Text color="cyan">{successRate}%</Text>
      </Box>
      <Box width={12}>
        <Text color="white">{formatNumber(worker.totalTokens)}</Text>
      </Box>
      <Box width={10}>
        <Text color="magenta">{worker.tokensPerSecond.toFixed(0)}/s</Text>
      </Box>
      <Box width={10}>
        <Text color="green">{formatCost(worker.totalCost)}</Text>
      </Box>
      <Box width={14}>
        {worker.status === "running" && worker.currentPuzzle ? (
          <Text color="yellow">
            <Spinner type="dots" /> Step {worker.currentStep}
          </Text>
        ) : worker.status === "completed" ? (
          <Text color="green">Done</Text>
        ) : (
          <Text color="gray">-</Text>
        )}
      </Box>
    </Box>
  );
}

// ========================================
// Workers Table Component
// ========================================

interface WorkersTableProps {
  workers: Map<string, WorkerState>;
}

function WorkersTable({ workers }: WorkersTableProps) {
  const workerList = Array.from(workers.values()).sort((a, b) =>
    a.modelId.localeCompare(b.modelId)
  );

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box marginBottom={0}>
        <Text bold color="white">
          🤖 Model Workers
        </Text>
      </Box>
      <Box flexDirection="row" marginBottom={0}>
        <Box width={32}>
          <Text bold color="gray">
            Model
          </Text>
        </Box>
        <Box width={12}>
          <Text bold color="gray">
            Progress
          </Text>
        </Box>
        <Box width={10}>
          <Text bold color="gray">
            W/L
          </Text>
        </Box>
        <Box width={10}>
          <Text bold color="gray">
            Rate
          </Text>
        </Box>
        <Box width={12}>
          <Text bold color="gray">
            Tokens
          </Text>
        </Box>
        <Box width={10}>
          <Text bold color="gray">
            Tok/s
          </Text>
        </Box>
        <Box width={10}>
          <Text bold color="gray">
            Cost
          </Text>
        </Box>
        <Box width={14}>
          <Text bold color="gray">
            Status
          </Text>
        </Box>
      </Box>
      <Box>
        <Text color="gray">{"─".repeat(100)}</Text>
      </Box>
      {workerList.map((worker) => (
        <WorkerRow key={worker.modelId} worker={worker} />
      ))}
    </Box>
  );
}

// ========================================
// Recent Events Component
// ========================================

interface RecentEventsProps {
  events: RunEvent[];
  maxEvents?: number;
}

function RecentEvents({ events, maxEvents = 8 }: RecentEventsProps) {
  const displayEvents = events.slice(0, maxEvents);

  function getEventIcon(event: RunEvent): string {
    switch (event.type) {
      case "run_start":
        return "▶";
      case "run_complete":
        return event.status === "success" ? "✓" : event.status === "fail" ? "✗" : "⏱";
      case "step_complete":
        return "→";
      case "error":
        return "⚠";
      default:
        return "•";
    }
  }

  function getEventColor(event: RunEvent): string {
    switch (event.type) {
      case "run_complete":
        return event.status === "success" ? "green" : event.status === "fail" ? "red" : "yellow";
      case "error":
        return "red";
      case "run_start":
        return "cyan";
      default:
        return "gray";
    }
  }

  function formatEventMessage(event: RunEvent): string {
    const model = truncateModelName(event.modelId, 20);
    switch (event.type) {
      case "run_start":
        return `${model} started ${event.puzzleId || "puzzle"}`;
      case "run_complete":
        const status = event.status === "success" ? "solved" : event.status || "ended";
        return `${model} ${status} ${event.puzzleId || "puzzle"}`;
      case "step_complete":
        const tokens = event.tokens ? ` (${event.tokens} tok)` : "";
        const latency = event.latencyMs ? ` ${event.latencyMs}ms` : "";
        return `${model} step ${event.stepIndex}${tokens}${latency}`;
      case "error":
        return `${model} error: ${event.error || "unknown"}`;
      default:
        return `${model} ${event.type}`;
    }
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={0}>
        <Text bold color="white">
          📜 Recent Activity
        </Text>
      </Box>
      {displayEvents.length === 0 ? (
        <Box>
          <Text color="gray">Waiting for events...</Text>
        </Box>
      ) : (
        displayEvents.map((event, index) => (
          <Box key={`${event.timestamp}-${index}`}>
            <Text color={getEventColor(event)}>{getEventIcon(event)} </Text>
            <Text color="gray">{formatEventMessage(event)}</Text>
          </Box>
        ))
      )}
    </Box>
  );
}

// ========================================
// Progress Bar Component
// ========================================

interface ProgressBarProps {
  current: number;
  total: number;
  label?: string;
}

function ProgressBar({ current, total, label }: ProgressBarProps) {
  const percentage = total > 0 ? (current / total) * 100 : 0;
  const width = 50;
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;

  return (
    <Box>
      {label && <Text color="gray">{label}: </Text>}
      <Text color="cyan">[</Text>
      <Text color="green">{"█".repeat(filled)}</Text>
      <Text color="gray">{"░".repeat(empty)}</Text>
      <Text color="cyan">]</Text>
      <Text color="white">
        {" "}
        {percentage.toFixed(1)}% ({current}/{total})
      </Text>
    </Box>
  );
}

// ========================================
// Main Dashboard Component
// ========================================

interface DashboardProps {
  state: DashboardState;
}

export function Dashboard({ state }: DashboardProps) {
  return (
    <Box flexDirection="column" padding={1}>
      <Header
        suiteName={state.suiteName}
        startTime={state.startTime}
        isComplete={state.isComplete}
      />

      <ProgressBar
        current={state.completedRuns}
        total={state.totalRuns}
        label="Overall Progress"
      />

      <Box marginY={1}>
        <Text color="gray">{"═".repeat(80)}</Text>
      </Box>

      <GlobalStats state={state} />

      <Box marginY={1}>
        <Text color="gray">{"─".repeat(80)}</Text>
      </Box>

      <WorkersTable workers={state.workers} />

      <Box marginY={1}>
        <Text color="gray">{"─".repeat(80)}</Text>
      </Box>

      <RecentEvents events={state.recentEvents} />

      {state.isComplete && (
        <Box marginTop={1} flexDirection="column">
          <Box>
            <Text color="gray">{"═".repeat(80)}</Text>
          </Box>
          <Box justifyContent="center">
            <Text bold color="green">
              🎉 Benchmark Complete! Results saved to runs/{state.suiteName}/
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default Dashboard;
