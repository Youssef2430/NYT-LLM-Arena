import React, { useState, useEffect } from "react";
import { render } from "ink";
import { Dashboard } from "./Dashboard.js";
import { FinalSummary } from "./FinalSummary.js";
import {
  createInitialDashboardState,
  updateWorkerState,
  type DashboardState,
  type RunEvent,
} from "./types.js";
import { ConcurrentRunner } from "../runner/concurrent-runner.js";
import type { SuiteConfig } from "../schemas/config.js";
import type { ConnectionsPuzzle, CrosswordPuzzle } from "../schemas/puzzles.js";

// ========================================
// App Component
// ========================================

interface AppProps {
  initialState: DashboardState;
  runner: ConcurrentRunner;
  puzzles: (ConnectionsPuzzle | CrosswordPuzzle)[];
  onComplete: (results: any[]) => void;
}

function App({ initialState, runner, puzzles, onComplete }: AppProps) {
  const [state, setState] = useState<DashboardState>(initialState);
  const [showFinalSummary, setShowFinalSummary] = useState(false);

  useEffect(() => {
    // Subscribe to runner events
    const handleEvent = (event: RunEvent) => {
      setState((prevState) => updateWorkerState(prevState, event));
    };

    runner.on("event", handleEvent);

    // Start the benchmark
    runner.runSuite(puzzles).then((results) => {
      // Mark as complete and show final summary after a short delay
      setTimeout(() => {
        setState((prev) => ({ ...prev, isComplete: true }));
        setShowFinalSummary(true);
        onComplete(results);
      }, 500);
    });

    return () => {
      runner.off("event", handleEvent);
    };
  }, [runner, puzzles, onComplete]);

  // Show final summary when complete
  if (showFinalSummary) {
    return <FinalSummary state={state} />;
  }

  return <Dashboard state={state} />;
}

// ========================================
// Render Function
// ========================================

export interface DashboardOptions {
  config: SuiteConfig;
  puzzles: (ConnectionsPuzzle | CrosswordPuzzle)[];
  runsDir?: string;
}

export async function runDashboard(options: DashboardOptions): Promise<any[]> {
  const { config, puzzles, runsDir = "runs" } = options;

  // Create initial state
  const initialState = createInitialDashboardState(
    config.name,
    config.models,
    puzzles.length,
    config.repeats,
  );

  // Create runner
  const runner = new ConcurrentRunner(config, runsDir);

  // Track results
  let results: any[] = [];

  // Create a promise that resolves when benchmark is complete
  const completionPromise = new Promise<any[]>((resolve) => {
    const handleComplete = (benchmarkResults: any[]) => {
      results = benchmarkResults;
      // Give time to render final summary
      setTimeout(() => {
        resolve(benchmarkResults);
      }, 2000);
    };

    // Render the dashboard
    const { waitUntilExit } = render(
      <App
        initialState={initialState}
        runner={runner}
        puzzles={puzzles}
        onComplete={handleComplete}
      />,
    );
  });

  return completionPromise;
}

export default App;
