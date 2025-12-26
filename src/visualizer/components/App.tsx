import React from "react";
import { render, Box, Text, useApp, useInput } from "ink";
import { MultiGameVisualizer, type GameData } from "./MultiGameVisualizer.js";
import { SingleGameVisualizer } from "./SingleGameVisualizer.js";
import type { StepRecord, RunSummary } from "../../schemas/config.js";

// ========================================
// Types
// ========================================

export interface VisualizerAppProps {
  mode: "single" | "multi";
  games: GameData[];
  speed: number;
  interactive: boolean;
}

// ========================================
// Wrapper to handle app exit
// ========================================

function ExitHandler({ children }: { children: React.ReactNode }) {
  const { exit } = useApp();
  
  useInput((input, key) => {
    if (input === "q" || input === "Q" || key.escape) {
      exit();
    }
    // Also handle Ctrl+C
    if (key.ctrl && input === "c") {
      exit();
    }
  });

  return <>{children}</>;
}

// ========================================
// Main App Component
// ========================================

function VisualizerApp({ mode, games, speed, interactive }: VisualizerAppProps) {
  if (games.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">No games to visualize.</Text>
      </Box>
    );
  }

  if (mode === "multi" || games.length > 1) {
    return (
      <ExitHandler>
        <MultiGameVisualizer 
          games={games} 
          speed={speed} 
          interactive={interactive} 
        />
      </ExitHandler>
    );
  }

  const game = games[0]!;
  return (
    <ExitHandler>
      <SingleGameVisualizer
        summary={game.summary}
        steps={game.steps}
        speed={speed}
        interactive={interactive}
      />
    </ExitHandler>
  );
}

// ========================================
// Render Function
// ========================================

export async function renderVisualizerApp(props: VisualizerAppProps): Promise<void> {
  return new Promise((resolve) => {
    const { waitUntilExit } = render(<VisualizerApp {...props} />);
    waitUntilExit().then(resolve);
  });
}

export { VisualizerApp };
export type { GameData };
