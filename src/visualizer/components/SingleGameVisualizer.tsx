import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import Spinner from "ink-spinner";
import { GameCard, type GameState } from "./GameCard.js";
import type { StepRecord, RunSummary } from "../../schemas/config.js";

// ========================================
// Types
// ========================================

export interface SingleGameVisualizerProps {
  summary: RunSummary;
  steps: StepRecord[];
  speed: number;
  interactive: boolean;
}

// ========================================
// Helper Functions
// ========================================

function initializeGameState(steps: StepRecord[]): GameState {
  const firstStep = steps[0];
  let remainingWords: string[] = [];

  if (firstStep) {
    const obs = firstStep.observation as any;
    remainingWords = [...(obs.remainingWords || [])];
    for (const g of obs.foundGroups || []) {
      remainingWords.push(...g.words);
    }
  }

  return {
    remainingWords,
    foundGroups: [],
    mistakesLeft: 4,
    selectedWords: [],
    message: "Starting...",
    messageType: "info",
    stepIndex: 0,
    totalSteps: steps.length,
    done: false,
    status: "in_progress",
  };
}

function advanceGameState(
  state: GameState,
  step: StepRecord,
  stepIdx: number
): GameState {
  const newState = { ...state };
  const obs = step.observation as any;
  const action = step.parsedAction as any;
  const feedback = step.envFeedback as any;

  newState.remainingWords = obs.remainingWords || [];
  newState.foundGroups = obs.foundGroups || [];
  newState.mistakesLeft = obs.mistakesLeft ?? 4;
  newState.stepIndex = stepIdx + 1;

  if (action && action.action === "submit_group") {
    newState.selectedWords = action.words || [];
  } else {
    newState.selectedWords = [];
  }

  if (feedback) {
    if (feedback.result === "correct") {
      newState.message = feedback.foundGroup
        ? `✓ ${feedback.foundGroup.category}`
        : "Correct!";
      newState.messageType = "success";
      if (feedback.foundGroup) {
        const alreadyHas = newState.foundGroups.some(
          (g) => g.category === feedback.foundGroup.category
        );
        if (!alreadyHas) {
          newState.foundGroups = [...newState.foundGroups, feedback.foundGroup];
        }
        const foundWords = new Set(
          feedback.foundGroup.words.map((w: string) => w.toUpperCase())
        );
        newState.remainingWords = newState.remainingWords.filter(
          (w) => !foundWords.has(w.toUpperCase())
        );
      }
    } else if (feedback.result === "incorrect") {
      newState.message = feedback.oneAway ? "One away!" : "Wrong!";
      newState.messageType = feedback.oneAway ? "warning" : "error";
    } else if (feedback.result === "invalid_action") {
      newState.message = "Invalid";
      newState.messageType = "error";
    } else if (feedback.result === "gave_up") {
      newState.message = "Gave up";
      newState.messageType = "error";
    }

    if (feedback.done) {
      newState.done = true;
      newState.status = feedback.status || "fail";
    }
  }

  newState.selectedWords = [];
  return newState;
}

// ========================================
// Sub-components
// ========================================

function Header({ summary, isComplete }: { summary: RunSummary; isComplete: boolean }) {
  const modelShort = summary.modelId.split("/").pop() || summary.modelId;
  
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box 
        borderStyle="double" 
        borderColor="cyan" 
        paddingX={2}
        justifyContent="center"
      >
        <Text color="white" bold>
          ✨ NYT CONNECTIONS ✨
        </Text>
      </Box>
      
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text color="#7F8C8D">▸ Model:  </Text>
          <Text color="#4ECDC4" bold>{modelShort}</Text>
        </Box>
        <Box>
          <Text color="#7F8C8D">▸ Puzzle: </Text>
          <Text color="#F7DC6F" bold>{summary.puzzleId}</Text>
          {!isComplete && (
            <Text color="green">
              {" "}<Spinner type="dots" />
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const progressWidth = 40;
  const progress = total > 0 ? current / total : 0;
  const filled = Math.round(progress * progressWidth);
  const empty = progressWidth - filled;
  
  return (
    <Box marginY={1}>
      <Text color="#7F8C8D">Progress </Text>
      <Text color="cyan">[</Text>
      <Text color="#4ECDC4">{"█".repeat(filled)}</Text>
      <Text color="#333">{"░".repeat(empty)}</Text>
      <Text color="cyan">]</Text>
      <Text color="white" bold> {Math.round(progress * 100)}%</Text>
      <Text color="#666"> ({current}/{total})</Text>
    </Box>
  );
}

function FinalStats({ summary }: { summary: RunSummary }) {
  const isSuccess = ["success", "success_clean", "success_with_reveals"].includes(summary.status);
  const metrics = summary.metrics as { mistakesMade: number; groupsFound: number };
  
  return (
    <Box flexDirection="column" marginY={1}>
      <Box 
        borderStyle="double" 
        borderColor={isSuccess ? "green" : "red"} 
        paddingX={2}
        justifyContent="center"
      >
        <Text color="white" bold>
          {isSuccess ? "🎉 PUZZLE COMPLETED!" : "💀 PUZZLE FAILED"}
        </Text>
      </Box>
      
      <Box flexDirection="column" marginTop={1} marginLeft={2}>
        <Text color="white" bold>Final Statistics:</Text>
        <Text color="gray">  Groups Found:  {metrics?.groupsFound ?? 0}/4</Text>
        <Text color="gray">  Mistakes Made: {metrics?.mistakesMade ?? 0}/4</Text>
        <Text color="gray">  Steps Taken:   {summary.stepsTaken}</Text>
        <Text color="gray">  Total Tokens:  {summary.usage.totalTokens.toLocaleString()}</Text>
        <Text color="gray">  Total Latency: {(summary.latencyMsTotal / 1000).toFixed(2)}s</Text>
        {summary.costCreditsTotal && (
          <Text color="gray">  Total Cost:    ${summary.costCreditsTotal.toFixed(6)}</Text>
        )}
      </Box>
    </Box>
  );
}

function Footer({ interactive }: { interactive: boolean }) {
  return (
    <Box marginTop={1}>
      {interactive ? (
        <Text color="#666">
          <Text color="#888">[SPACE/ENTER]</Text> Next step  
          <Text color="#888">[Q]</Text> Quit
        </Text>
      ) : (
        <Text color="#666">Press Ctrl+C to exit</Text>
      )}
    </Box>
  );
}

// ========================================
// Main Component
// ========================================

export function SingleGameVisualizer({
  summary,
  steps,
  speed,
  interactive,
}: SingleGameVisualizerProps) {
  const { exit } = useApp();
  
  const [state, setState] = useState<GameState>(() => initializeGameState(steps));
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [isComplete, setIsComplete] = useState(false);
  const [isPaused, setIsPaused] = useState(interactive);

  // Handle keyboard input
  useInput((input, key) => {
    if (input === "q" || input === "Q") {
      exit();
      return;
    }
    
    if (interactive && (input === " " || key.return)) {
      setIsPaused(false);
    }
  });

  // Auto-advance effect
  useEffect(() => {
    if (isPaused || isComplete) return;

    const timer = setTimeout(() => {
      if (currentStepIndex < steps.length - 1) {
        const nextStep = currentStepIndex + 1;
        const step = steps[nextStep];
        
        if (step) {
          setState(prev => advanceGameState(prev, step, nextStep));
          setCurrentStepIndex(nextStep);
        }
        
        if (interactive) {
          setIsPaused(true);
        }
      } else {
        // Mark final state
        setState(prev => ({
          ...prev,
          status: summary.status,
          message: ["success", "success_clean", "success_with_reveals"].includes(summary.status)
            ? "Won!"
            : "Lost",
          messageType: ["success", "success_clean", "success_with_reveals"].includes(summary.status)
            ? "success" as const
            : "error" as const,
        }));
        setIsComplete(true);
      }
    }, interactive ? 50 : speed);

    return () => clearTimeout(timer);
  }, [currentStepIndex, isPaused, isComplete, interactive, speed, steps, summary.status]);

  return (
    <Box flexDirection="column" padding={1}>
      <Header summary={summary} isComplete={isComplete} />
      
      {/* Game card - larger version for single game */}
      <Box justifyContent="center">
        <GameCard
          state={state}
          modelName={summary.modelId.split("/").pop() || summary.modelId}
          puzzleId={summary.puzzleId}
          compact={false}
        />
      </Box>
      
      <ProgressBar current={currentStepIndex + 1} total={steps.length} />
      
      {isComplete && <FinalStats summary={summary} />}
      
      <Footer interactive={interactive && !isComplete} />
    </Box>
  );
}

export default SingleGameVisualizer;
