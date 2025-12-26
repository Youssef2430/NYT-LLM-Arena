import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import Spinner from "ink-spinner";
import { GameCard, type GameState } from "./GameCard.js";
import type { StepRecord, RunSummary } from "../../schemas/config.js";

// ========================================
// Types
// ========================================

export interface GameData {
  summary: RunSummary;
  steps: StepRecord[];
  state: GameState;
}

export interface MultiGameVisualizerProps {
  games: GameData[];
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

function Header({ 
  totalGames, 
  currentStep, 
  maxSteps, 
  isComplete 
}: { 
  totalGames: number; 
  currentStep: number; 
  maxSteps: number;
  isComplete: boolean;
}) {
  const progress = maxSteps > 0 ? currentStep / maxSteps : 0;
  const progressWidth = 50;
  const filled = Math.round(progress * progressWidth);
  const empty = progressWidth - filled;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Title box */}
      <Box 
        borderStyle="double" 
        borderColor="cyan" 
        paddingX={2}
        justifyContent="center"
      >
        <Text color="white" bold>
          🎯 NYT ARENA - MULTI-GAME VISUALIZATION
        </Text>
      </Box>

      {/* Progress info */}
      <Box marginTop={1} gap={2}>
        <Box>
          <Text color="gray">Step </Text>
          <Text color="white" bold>{currentStep}</Text>
          <Text color="gray">/{maxSteps}</Text>
        </Box>
        <Box>
          <Text color="cyan">[</Text>
          <Text color="#4ECDC4">{"█".repeat(filled)}</Text>
          <Text color="#333">{"░".repeat(empty)}</Text>
          <Text color="cyan">]</Text>
          <Text color="white"> {Math.round(progress * 100)}%</Text>
        </Box>
      </Box>

      <Box>
        <Text color="gray">
          Watching {totalGames} game{totalGames > 1 ? "s" : ""}
          {isComplete ? " " : " "}
        </Text>
        {!isComplete && (
          <Text color="green">
            <Spinner type="dots" />
          </Text>
        )}
        {isComplete && <Text color="green">✓ Complete</Text>}
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

function FinalSummary({ games }: { games: GameData[] }) {
  const successStatuses = ["success", "success_clean", "success_with_reveals"];
  const successes = games.filter(g => successStatuses.includes(g.state.status)).length;
  const failures = games.length - successes;

  return (
    <Box flexDirection="column" marginY={1}>
      <Box 
        borderStyle="double" 
        borderColor="green" 
        paddingX={2}
        justifyContent="center"
      >
        <Text color="white" bold>🎉 ALL GAMES COMPLETE!</Text>
      </Box>
      <Box marginTop={1} gap={2}>
        <Text color="green" bold>✓ {successes} passed</Text>
        <Text color="red">✗ {failures} failed</Text>
        <Text color="gray">
          ({((successes / games.length) * 100).toFixed(0)}% win rate)
        </Text>
      </Box>
    </Box>
  );
}

// ========================================
// Main Component
// ========================================

export function MultiGameVisualizer({ 
  games: initialGames, 
  speed, 
  interactive 
}: MultiGameVisualizerProps) {
  const { exit } = useApp();
  
  // Initialize game states
  const [games, setGames] = useState<GameData[]>(() => 
    initialGames.map(g => ({
      ...g,
      state: initializeGameState(g.steps),
    }))
  );
  
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [isComplete, setIsComplete] = useState(false);
  const [isPaused, setIsPaused] = useState(interactive);
  
  const maxSteps = Math.max(...games.map(g => g.steps.length));

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
      if (currentStepIndex < maxSteps - 1) {
        const nextStep = currentStepIndex + 1;
        
        // Advance all games
        setGames(prevGames => 
          prevGames.map(game => {
            if (nextStep < game.steps.length) {
              const step = game.steps[nextStep];
              if (step) {
                return {
                  ...game,
                  state: advanceGameState(game.state, step, nextStep),
                };
              }
            }
            return game;
          })
        );
        
        setCurrentStepIndex(nextStep);
        
        if (interactive) {
          setIsPaused(true);
        }
      } else {
        // Mark final states
        setGames(prevGames =>
          prevGames.map(game => ({
            ...game,
            state: {
              ...game.state,
              status: game.summary.status,
              message: ["success", "success_clean", "success_with_reveals"].includes(game.summary.status)
                ? "Won!" 
                : "Lost",
              messageType: ["success", "success_clean", "success_with_reveals"].includes(game.summary.status)
                ? "success" as const
                : "error" as const,
            },
          }))
        );
        setIsComplete(true);
      }
    }, interactive ? 50 : speed);

    return () => clearTimeout(timer);
  }, [currentStepIndex, isPaused, isComplete, interactive, speed, maxSteps]);

  // Calculate how many columns fit
  const numGames = games.length;
  // For 6 games or fewer, show them all in one row
  const columns = numGames <= 6 ? numGames : Math.min(numGames, 3);

  return (
    <Box flexDirection="column" padding={1}>
      <Header 
        totalGames={games.length}
        currentStep={currentStepIndex + 1}
        maxSteps={maxSteps}
        isComplete={isComplete}
      />

      {/* Game cards grid */}
      <Box flexDirection="row" flexWrap="wrap" gap={1}>
        {games.map((game, index) => (
          <GameCard
            key={game.summary.runId || index}
            state={game.state}
            modelName={game.summary.modelId.split("/").pop() || game.summary.modelId}
            puzzleId={game.summary.puzzleId}
            compact={numGames > 3}
          />
        ))}
      </Box>

      {isComplete && <FinalSummary games={games} />}
      
      <Footer interactive={interactive && !isComplete} />
    </Box>
  );
}

export default MultiGameVisualizer;
