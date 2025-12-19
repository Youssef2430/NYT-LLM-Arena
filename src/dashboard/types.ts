// ========================================
// Dashboard Types and State Management
// ========================================

export type WorkerStatus =
  | "idle"
  | "running"
  | "waiting"
  | "completed"
  | "error";

export interface WorkerState {
  modelId: string;
  status: WorkerStatus;
  currentPuzzle: string | null;
  currentStep: number;
  totalSteps: number;
  completedRuns: number;
  totalRuns: number;
  successCount: number;
  failCount: number;
  timeoutCount: number;
  errorCount: number;
  totalTokens: number;
  totalCost: number;
  totalLatencyMs: number;
  lastActionLatencyMs: number | null;
  tokensPerSecond: number;
  startTime: number | null;
  lastUpdateTime: number;
}

export interface RunEvent {
  type:
    | "run_start"
    | "run_complete"
    | "step_start"
    | "step_complete"
    | "error"
    | "worker_idle";
  modelId: string;
  puzzleId?: string;
  runId?: string;
  stepIndex?: number;
  totalSteps?: number;
  status?: "success" | "fail" | "timeout" | "error";
  tokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  cost?: number | null;
  latencyMs?: number;
  error?: string;
  timestamp: number;
}

export interface DashboardState {
  suiteName: string;
  startTime: number;
  totalPuzzles: number;
  totalModels: number;
  totalRuns: number;
  completedRuns: number;
  workers: Map<string, WorkerState>;
  recentEvents: RunEvent[];
  globalStats: GlobalStats;
  isComplete: boolean;
}

export interface GlobalStats {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  totalLatencyMs: number;
  successCount: number;
  failCount: number;
  timeoutCount: number;
  errorCount: number;
  avgTokensPerSecond: number;
  avgStepsToSolve: number;
  avgTimeToSolve: number;
  fastestSolve: number | null;
  slowestSolve: number | null;
}

export function createInitialWorkerState(
  modelId: string,
  totalRuns: number
): WorkerState {
  return {
    modelId,
    status: "idle",
    currentPuzzle: null,
    currentStep: 0,
    totalSteps: 0,
    completedRuns: 0,
    totalRuns,
    successCount: 0,
    failCount: 0,
    timeoutCount: 0,
    errorCount: 0,
    totalTokens: 0,
    totalCost: 0,
    totalLatencyMs: 0,
    lastActionLatencyMs: null,
    tokensPerSecond: 0,
    startTime: null,
    lastUpdateTime: Date.now(),
  };
}

export function createInitialDashboardState(
  suiteName: string,
  models: string[],
  totalPuzzles: number,
  repeats: number
): DashboardState {
  const runsPerModel = totalPuzzles * repeats;
  const totalRuns = models.length * runsPerModel;

  const workers = new Map<string, WorkerState>();
  for (const model of models) {
    workers.set(model, createInitialWorkerState(model, runsPerModel));
  }

  return {
    suiteName,
    startTime: Date.now(),
    totalPuzzles,
    totalModels: models.length,
    totalRuns,
    completedRuns: 0,
    workers,
    recentEvents: [],
    globalStats: {
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
      totalLatencyMs: 0,
      successCount: 0,
      failCount: 0,
      timeoutCount: 0,
      errorCount: 0,
      avgTokensPerSecond: 0,
      avgStepsToSolve: 0,
      avgTimeToSolve: 0,
      fastestSolve: null,
      slowestSolve: null,
    },
    isComplete: false,
  };
}

export function updateWorkerState(
  state: DashboardState,
  event: RunEvent
): DashboardState {
  const worker = state.workers.get(event.modelId);
  if (!worker) return state;

  const updatedWorker = { ...worker, lastUpdateTime: event.timestamp };
  const updatedGlobalStats = { ...state.globalStats };

  switch (event.type) {
    case "run_start":
      updatedWorker.status = "running";
      updatedWorker.currentPuzzle = event.puzzleId || null;
      updatedWorker.currentStep = 0;
      updatedWorker.totalSteps = event.totalSteps || 0;
      if (!updatedWorker.startTime) {
        updatedWorker.startTime = event.timestamp;
      }
      break;

    case "step_start":
      updatedWorker.currentStep = event.stepIndex || 0;
      break;

    case "step_complete":
      updatedWorker.currentStep = (event.stepIndex || 0) + 1;
      if (event.tokens) {
        updatedWorker.totalTokens += event.tokens;
        updatedGlobalStats.totalTokens += event.tokens;
      }
      if (event.promptTokens) {
        updatedGlobalStats.promptTokens += event.promptTokens;
      }
      if (event.completionTokens) {
        updatedGlobalStats.completionTokens += event.completionTokens;
      }
      if (event.cost != null) {
        updatedWorker.totalCost += event.cost;
        updatedGlobalStats.totalCost += event.cost;
      }
      if (event.latencyMs) {
        updatedWorker.lastActionLatencyMs = event.latencyMs;
        updatedWorker.totalLatencyMs += event.latencyMs;
        updatedGlobalStats.totalLatencyMs += event.latencyMs;
      }
      // Calculate tokens per second
      if (updatedWorker.totalLatencyMs > 0) {
        updatedWorker.tokensPerSecond =
          (updatedWorker.totalTokens / updatedWorker.totalLatencyMs) * 1000;
      }
      break;

    case "run_complete":
      updatedWorker.completedRuns++;
      updatedWorker.currentPuzzle = null;
      updatedWorker.status = "idle";

      if (event.status === "success") {
        updatedWorker.successCount++;
        updatedGlobalStats.successCount++;
        // Track solve times
        if (event.latencyMs) {
          if (
            updatedGlobalStats.fastestSolve === null ||
            event.latencyMs < updatedGlobalStats.fastestSolve
          ) {
            updatedGlobalStats.fastestSolve = event.latencyMs;
          }
          if (
            updatedGlobalStats.slowestSolve === null ||
            event.latencyMs > updatedGlobalStats.slowestSolve
          ) {
            updatedGlobalStats.slowestSolve = event.latencyMs;
          }
        }
      } else if (event.status === "fail") {
        updatedWorker.failCount++;
        updatedGlobalStats.failCount++;
      } else if (event.status === "timeout") {
        updatedWorker.timeoutCount++;
        updatedGlobalStats.timeoutCount++;
      } else if (event.status === "error") {
        updatedWorker.errorCount++;
        updatedGlobalStats.errorCount++;
      }
      break;

    case "error":
      updatedWorker.status = "error";
      break;

    case "worker_idle":
      updatedWorker.status = "completed";
      break;
  }

  // Calculate global averages
  const totalCompleted =
    updatedGlobalStats.successCount +
    updatedGlobalStats.failCount +
    updatedGlobalStats.timeoutCount +
    updatedGlobalStats.errorCount;

  if (updatedGlobalStats.totalLatencyMs > 0) {
    updatedGlobalStats.avgTokensPerSecond =
      (updatedGlobalStats.totalTokens / updatedGlobalStats.totalLatencyMs) *
      1000;
  }
  if (updatedGlobalStats.successCount > 0 && updatedGlobalStats.totalLatencyMs > 0) {
    updatedGlobalStats.avgTimeToSolve =
      updatedGlobalStats.totalLatencyMs / updatedGlobalStats.successCount;
  }

  // Update workers map
  const updatedWorkers = new Map(state.workers);
  updatedWorkers.set(event.modelId, updatedWorker);

  // Keep only last 50 events
  const recentEvents = [event, ...state.recentEvents].slice(0, 50);

  const completedRuns = Array.from(updatedWorkers.values()).reduce(
    (sum, w) => sum + w.completedRuns,
    0
  );

  const isComplete = completedRuns >= state.totalRuns;

  return {
    ...state,
    workers: updatedWorkers,
    recentEvents,
    globalStats: updatedGlobalStats,
    completedRuns,
    isComplete,
  };
}
