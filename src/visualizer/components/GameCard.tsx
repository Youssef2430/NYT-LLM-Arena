import React from "react";
import { Box, Text } from "ink";

// ========================================
// Types
// ========================================

export interface GameState {
  remainingWords: string[];
  foundGroups: Array<{ level: string; category: string; words: string[] }>;
  mistakesLeft: number;
  selectedWords: string[];
  message: string;
  messageType: "info" | "success" | "error" | "warning";
  stepIndex: number;
  totalSteps: number;
  done: boolean;
  status: string;
}

export interface GameCardProps {
  state: GameState;
  modelName: string;
  puzzleId?: string;
  compact?: boolean;
}

// ========================================
// Color Mappings
// ========================================

const levelColors: Record<string, string> = {
  yellow: "#F9DF6D",
  green: "#A0C35A",
  blue: "#B0C4EF",
  purple: "#BA81C5",
};

// Fixed cell dimensions for consistent grid
const CELL_WIDTH = 9; // Each cell is exactly 9 chars wide
const GRID_COLS = 4;
const GRID_ROWS = 4;

const levelEmoji: Record<string, string> = {
  yellow: "🟨",
  green: "🟩",
  blue: "🟦",
  purple: "🟪",
};

const statusEmoji: Record<string, string> = {
  success: "✅",
  success_clean: "🏆",
  success_with_reveals: "✅",
  fail: "❌",
  timeout: "⏱️",
  error: "⚠️",
  gave_up: "🏳️",
  in_progress: "🎮",
};

// ========================================
// Sub-components
// ========================================

function Hearts({ count, max = 4 }: { count: number; max?: number }) {
  const hearts = [];
  for (let i = 0; i < max; i++) {
    hearts.push(
      <Text key={i} color={i < count ? "#E74C3C" : "#444"}>
        {i < count ? "♥" : "♡"}
      </Text>
    );
  }
  return (
    <Box gap={1}>
      {hearts}
    </Box>
  );
}

function WordCell({ 
  word, 
  isSelected,
  isEmpty = false,
}: { 
  word: string; 
  isSelected: boolean;
  isEmpty?: boolean;
}) {
  // Truncate and pad to exact width (CELL_WIDTH - 2 for padding)
  const maxLen = CELL_WIDTH - 2;
  const displayWord = word.toUpperCase().slice(0, maxLen).padEnd(maxLen);
  
  if (isEmpty) {
    return (
      <Box width={CELL_WIDTH}>
        <Text>{" ".repeat(CELL_WIDTH)}</Text>
      </Box>
    );
  }
  
  return (
    <Box width={CELL_WIDTH}>
      <Text 
        backgroundColor={isSelected ? "#4ECDC4" : "#2d2d2d"}
        color={isSelected ? "#1a1a1a" : "#e0e0e0"}
        bold={isSelected}
      >
        {` ${displayWord} `}
      </Text>
    </Box>
  );
}

function FoundGroupRow({ 
  group,
  totalWidth,
}: { 
  group: { level: string; category: string; words: string[] };
  totalWidth: number;
}) {
  const bgColor = levelColors[group.level] || "#666";
  const emoji = levelEmoji[group.level] || "⭐";
  
  // Create text that fills the entire row width
  const maxTextLen = totalWidth - 4; // Leave room for emoji and padding
  const categoryText = group.category.toUpperCase().slice(0, maxTextLen);
  const fullText = `${emoji} ${categoryText}`;
  const paddedText = fullText.padEnd(totalWidth);
  
  return (
    <Box width={totalWidth}>
      <Text backgroundColor={bgColor} color="#1a1a1a" bold>
        {paddedText}
      </Text>
    </Box>
  );
}

// A fixed 4x4 grid that always maintains the same dimensions
function FixedGrid({ 
  foundGroups,
  remainingWords, 
  selectedWords,
}: { 
  foundGroups: Array<{ level: string; category: string; words: string[] }>;
  remainingWords: string[]; 
  selectedWords: string[];
}) {
  const selectedSet = new Set(selectedWords.map(w => w.toUpperCase()));
  const totalWidth = CELL_WIDTH * GRID_COLS;
  
  // Build the 4 rows: found groups at top, remaining words fill the rest
  const rows: React.ReactNode[] = [];
  
  // Add found groups as full-width rows
  for (let i = 0; i < foundGroups.length && i < GRID_ROWS; i++) {
    rows.push(
      <FoundGroupRow 
        key={`group-${i}`} 
        group={foundGroups[i]!} 
        totalWidth={totalWidth}
      />
    );
  }
  
  // Fill remaining rows with word cells
  const wordsPerRow = GRID_COLS;
  let wordIndex = 0;
  
  while (rows.length < GRID_ROWS) {
    const rowCells: React.ReactNode[] = [];
    
    for (let col = 0; col < GRID_COLS; col++) {
      const word = remainingWords[wordIndex];
      if (word) {
        rowCells.push(
          <WordCell
            key={`word-${wordIndex}`}
            word={word}
            isSelected={selectedSet.has(word.toUpperCase())}
          />
        );
        wordIndex++;
      } else {
        // Empty cell placeholder
        rowCells.push(
          <WordCell
            key={`empty-${rows.length}-${col}`}
            word=""
            isSelected={false}
            isEmpty={true}
          />
        );
      }
    }
    
    rows.push(
      <Box key={`row-${rows.length}`} flexDirection="row">
        {rowCells}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {rows}
    </Box>
  );
}

function StatusMessage({ 
  message, 
  type 
}: { 
  message: string; 
  type: "info" | "success" | "error" | "warning";
}) {
  const colors: Record<string, string> = {
    success: "#2ECC71",
    error: "#E74C3C",
    warning: "#F39C12",
    info: "#95A5A6",
  };
  
  const icons: Record<string, string> = {
    success: "✔",
    error: "✖",
    warning: "⚠",
    info: "•",
  };

  return (
    <Box paddingX={1}>
      <Text color={colors[type]}>
        {icons[type]} {message}
      </Text>
    </Box>
  );
}

function ProgressBar({ 
  current, 
  total, 
  width = 20 
}: { 
  current: number; 
  total: number; 
  width?: number;
}) {
  const percentage = total > 0 ? current / total : 0;
  const filled = Math.round(percentage * width);
  const empty = width - filled;

  return (
    <Box>
      <Text color="#4ECDC4">{"█".repeat(filled)}</Text>
      <Text color="#444">{"░".repeat(empty)}</Text>
      <Text color="#7F8C8D"> {Math.round(percentage * 100)}%</Text>
    </Box>
  );
}

// ========================================
// Main Game Card Component
// ========================================

export function GameCard({ state, modelName, puzzleId, compact = false }: GameCardProps) {
  const isSuccess = ["success", "success_clean", "success_with_reveals"].includes(state.status);
  const isFail = state.status === "fail";
  
  const borderColor = isSuccess ? "#2ECC71" : isFail ? "#E74C3C" : "#4ECDC4";
  const emoji = statusEmoji[state.status] || "🎮";

  // Fixed card width based on grid
  const cardWidth = CELL_WIDTH * GRID_COLS + 4; // +4 for border and padding
  const separatorWidth = CELL_WIDTH * GRID_COLS;

  // Truncate model name to fit
  const maxModelLen = separatorWidth - 3;
  const displayModel = modelName.length > maxModelLen ? modelName.slice(0, maxModelLen - 3) + "..." : modelName;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      width={cardWidth}
    >
      {/* Header - Model name */}
      <Box justifyContent="space-between" marginBottom={0}>
        <Text color="white" bold>{displayModel}</Text>
      </Box>

      {/* Status bar */}
      <Box justifyContent="space-between" marginBottom={0}>
        <Box gap={1}>
          <Text>{emoji}</Text>
          <Text color="#F7DC6F">{state.stepIndex}/{state.totalSteps}</Text>
        </Box>
        <Hearts count={state.mistakesLeft} />
      </Box>

      {/* Separator */}
      <Box marginY={0}>
        <Text color="#444">{"─".repeat(separatorWidth)}</Text>
      </Box>

      {/* Fixed 4x4 Grid - always same size */}
      <FixedGrid
        foundGroups={state.foundGroups}
        remainingWords={state.remainingWords}
        selectedWords={state.selectedWords}
      />

      {/* Message */}
      {state.message && (
        <>
          <Box marginY={0}>
            <Text color="#444">{"─".repeat(separatorWidth)}</Text>
          </Box>
          <StatusMessage message={state.message} type={state.messageType} />
        </>
      )}
    </Box>
  );
}

export default GameCard;
