// NYT Arena - LLM Benchmark for Crosswords + Connections
// Main entry point for library exports

// Schemas
export * from "./src/schemas/puzzles.js";
export * from "./src/schemas/actions.js";
export * from "./src/schemas/config.js";

// Environments
export { ConnectionsEnv } from "./src/environments/ConnectionsEnv.js";
export type {
  ConnectionsObservation,
  ConnectionsFeedback,
  ConnectionsHistoryEntry,
} from "./src/environments/ConnectionsEnv.js";

export { CrosswordEnv } from "./src/environments/CrosswordEnv.js";
export type {
  CrosswordObservation,
  CrosswordFeedback,
  CrosswordHistoryEntry,
  CrosswordEnvConfig,
} from "./src/environments/CrosswordEnv.js";

// OpenRouter Client
export {
  OpenRouterClient,
  OpenRouterError,
  createOpenRouterClient,
} from "./src/client/openrouter.js";
export type {
  OpenRouterConfig,
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionResult,
  OpenRouterUsage,
} from "./src/client/openrouter.js";

// Runner (legacy)
export { BenchmarkRunner, createRunner } from "./src/runner/runner.js";
export type { RunContext, RunResult, Puzzle } from "./src/runner/runner.js";

// Concurrent Runner (recommended)
export {
  ConcurrentRunner,
  createConcurrentRunner,
} from "./src/runner/concurrent-runner.js";

// Dashboard
export { runDashboard } from "./src/dashboard/App.js";
export type { DashboardOptions } from "./src/dashboard/App.js";
export { Dashboard } from "./src/dashboard/Dashboard.js";
export { FinalSummary } from "./src/dashboard/FinalSummary.js";
export type {
  DashboardState,
  WorkerState,
  RunEvent,
  GlobalStats,
} from "./src/dashboard/types.js";

// Leaderboard
export { showLeaderboard } from "./src/leaderboard/index.js";
export type {
  LeaderboardOptions,
  ModelStats,
} from "./src/leaderboard/index.js";

// CLI entry point
if (import.meta.main) {
  await import("./src/cli/index.js");
}
