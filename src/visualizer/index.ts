import chalk from "chalk";
import { join } from "path";
import { readdir, stat } from "fs/promises";
import type { StepRecord, RunSummary } from "../schemas/config.js";

// ========================================
// Types
// ========================================

interface RunInfo {
  path: string;
  summary: RunSummary;
  timestamp: Date;
}

interface GameState {
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

interface MultiGameState {
  runInfo: RunInfo;
  steps: StepRecord[];
  gameState: GameState;
  currentStepIndex: number;
}

// ========================================
// Box Drawing Characters (prettier borders)
// ========================================

const BOX = {
  topLeft: "╭",
  topRight: "╮",
  bottomLeft: "╰",
  bottomRight: "╯",
  horizontal: "─",
  vertical: "│",
  horizontalDown: "┬",
  horizontalUp: "┴",
  verticalRight: "├",
  verticalLeft: "┤",
  cross: "┼",
};

const DOUBLE_BOX = {
  topLeft: "╔",
  topRight: "╗",
  bottomLeft: "╚",
  bottomRight: "╝",
  horizontal: "═",
  vertical: "║",
};

// ========================================
// Color helpers for difficulty levels
// ========================================

const levelBgColors: Record<string, (text: string) => string> = {
  yellow: (t) => chalk.bgHex("#F9DF6D").hex("#000000")(t),
  green: (t) => chalk.bgHex("#A0C35A").hex("#000000")(t),
  blue: (t) => chalk.bgHex("#B0C4EF").hex("#000000")(t),
  purple: (t) => chalk.bgHex("#BA81C5").hex("#000000")(t),
};

const levelEmoji: Record<string, string> = {
  yellow: "🟨",
  green: "🟩",
  blue: "🟦",
  purple: "🟪",
};

const statusColors: Record<string, (text: string) => string> = {
  success: chalk.bgGreen.black,
  success_clean: chalk.bgGreen.black,
  success_with_reveals: chalk.bgGreen.black,
  fail: chalk.bgRed.white,
  timeout: chalk.bgYellow.black,
  error: chalk.bgRed.white,
  gave_up: chalk.bgGray.white,
};

const statusEmoji: Record<string, string> = {
  success: "✅",
  success_clean: "✅",
  success_with_reveals: "✅",
  fail: "❌",
  timeout: "⏱️",
  error: "⚠️",
  gave_up: "🏳️",
  in_progress: "🎮",
};

// ========================================
// Run Discovery
// ========================================

async function findAllRuns(runsDir: string): Promise<RunInfo[]> {
  const runs: RunInfo[] = [];

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
                  runs.push({
                    path: runPath,
                    summary,
                    timestamp: new Date(summary.startedAt),
                  });
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

  // Sort by timestamp (newest first)
  runs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return runs;
}

async function findLatestRun(runsDir: string): Promise<RunInfo | null> {
  const runs = await findAllRuns(runsDir);
  return runs.length > 0 ? (runs[0] ?? null) : null;
}

async function findRunById(
  runsDir: string,
  runId: string,
): Promise<RunInfo | null> {
  const runs = await findAllRuns(runsDir);
  return runs.find((r) => r.summary.runId === runId) ?? null;
}

async function findRunsByModel(
  runsDir: string,
  modelId: string,
): Promise<RunInfo[]> {
  const runs = await findAllRuns(runsDir);
  return runs.filter((r) =>
    r.summary.modelId.toLowerCase().includes(modelId.toLowerCase()),
  );
}

async function findRunsByPuzzle(
  runsDir: string,
  puzzleId: string,
): Promise<RunInfo[]> {
  const runs = await findAllRuns(runsDir);
  return runs.filter((r) =>
    r.summary.puzzleId.toLowerCase().includes(puzzleId.toLowerCase()),
  );
}

// ========================================
// Step Loading
// ========================================

async function loadSteps(runPath: string): Promise<StepRecord[]> {
  // Try uncompressed first
  const stepsPath = join(runPath, "steps.jsonl");
  const stepsFile = Bun.file(stepsPath);

  if (await stepsFile.exists()) {
    const content = await stepsFile.text();
    const lines = content.trim().split("\n").filter(Boolean);
    return lines.map((line) => JSON.parse(line));
  }

  // Try compressed
  const gzPath = join(runPath, "steps.jsonl.gz");
  const gzFile = Bun.file(gzPath);

  if (await gzFile.exists()) {
    const compressed = await gzFile.arrayBuffer();
    const decompressed = Bun.gunzipSync(new Uint8Array(compressed));
    const content = new TextDecoder().decode(decompressed);
    const lines = content.trim().split("\n").filter(Boolean);
    return lines.map((line) => JSON.parse(line));
  }

  return [];
}

// ========================================
// Pretty Mini Card Rendering (for multi-game view)
// ========================================

const MINI_CARD_WIDTH = 36;
const MINI_CELL_WIDTH = 8;

function centerText(text: string, width: number): string {
  const visibleLength = stripAnsi(text).length;
  const padding = Math.max(0, width - visibleLength);
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;
  return " ".repeat(leftPad) + text + " ".repeat(rightPad);
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

function truncateText(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  return text.slice(0, maxWidth - 1) + "…";
}

function renderMiniCell(word: string, isSelected: boolean): string {
  const displayWord = truncateText(word.toUpperCase(), MINI_CELL_WIDTH - 1);
  const padded = displayWord.padEnd(MINI_CELL_WIDTH - 1);

  if (isSelected) {
    return chalk.bgWhite.black(` ${padded}`);
  } else {
    return chalk.bgHex("#2a2a2a").white(` ${padded}`);
  }
}

function renderMiniFoundGroup(group: {
  level: string;
  category: string;
  words: string[];
}): string[] {
  const lines: string[] = [];
  const colorFn = levelBgColors[group.level] || chalk.bgGray;
  const innerWidth = MINI_CARD_WIDTH - 4;

  const categoryDisplay = truncateText(
    group.category.toUpperCase(),
    innerWidth,
  );
  lines.push(colorFn(centerText(categoryDisplay, MINI_CARD_WIDTH - 2)));

  return lines;
}

function renderMiniCard(state: GameState, summary: RunSummary): string[] {
  const lines: string[] = [];
  const innerWidth = MINI_CARD_WIDTH - 2;

  // Model name (shortened)
  const modelShort = summary.modelId.split("/").pop() || summary.modelId;
  const modelDisplay = truncateText(modelShort, innerWidth - 2);

  // Top border with model name
  lines.push(
    chalk.cyan(BOX.topLeft) +
      chalk.cyan(BOX.horizontal) +
      chalk.cyan.bold(modelDisplay) +
      chalk.cyan(
        BOX.horizontal.repeat(
          Math.max(0, innerWidth - modelDisplay.length - 1),
        ),
      ) +
      chalk.cyan(BOX.topRight),
  );

  // Status bar
  const emoji = statusEmoji[state.status] || "🎮";
  const stepInfo = `${state.stepIndex}/${state.totalSteps}`;
  const hearts =
    "❤️".repeat(state.mistakesLeft) + "🖤".repeat(4 - state.mistakesLeft);
  const statusLine = `${emoji} ${stepInfo}  ${hearts}`;
  lines.push(
    chalk.cyan(BOX.vertical) +
      " " +
      statusLine +
      " ".repeat(Math.max(0, innerWidth - stripAnsi(statusLine).length - 1)) +
      chalk.cyan(BOX.vertical),
  );

  // Separator
  lines.push(
    chalk.cyan(BOX.verticalRight) +
      chalk.gray(BOX.horizontal.repeat(innerWidth)) +
      chalk.cyan(BOX.verticalLeft),
  );

  // Found groups
  for (const group of state.foundGroups) {
    const groupLines = renderMiniFoundGroup(group);
    for (const gl of groupLines) {
      lines.push(chalk.cyan(BOX.vertical) + gl + chalk.cyan(BOX.vertical));
    }
  }

  // Remaining words grid (4 words per row)
  const selectedSet = new Set(state.selectedWords.map((w) => w.toUpperCase()));
  const gridWords = [...state.remainingWords];

  for (let row = 0; row < Math.ceil(gridWords.length / 4); row++) {
    const rowWords = gridWords.slice(row * 4, row * 4 + 4);
    const cells = rowWords.map((word) => {
      const isSelected = selectedSet.has(word.toUpperCase());
      return renderMiniCell(word, isSelected);
    });
    const rowStr = cells.join(" ");
    const rowPadding = Math.max(0, innerWidth - stripAnsi(rowStr).length - 1);
    lines.push(
      chalk.cyan(BOX.vertical) +
        " " +
        rowStr +
        " ".repeat(rowPadding) +
        chalk.cyan(BOX.vertical),
    );
  }

  // Message
  if (state.message) {
    lines.push(
      chalk.cyan(BOX.verticalRight) +
        chalk.gray(BOX.horizontal.repeat(innerWidth)) +
        chalk.cyan(BOX.verticalLeft),
    );
    let msgColor: (s: string) => string;
    switch (state.messageType) {
      case "success":
        msgColor = chalk.green;
        break;
      case "error":
        msgColor = chalk.red;
        break;
      case "warning":
        msgColor = chalk.yellow;
        break;
      default:
        msgColor = chalk.gray;
    }
    const msgDisplay = truncateText(state.message, innerWidth - 2);
    lines.push(
      chalk.cyan(BOX.vertical) +
        " " +
        msgColor(msgDisplay) +
        " ".repeat(Math.max(0, innerWidth - msgDisplay.length - 1)) +
        chalk.cyan(BOX.vertical),
    );
  }

  // Bottom border
  lines.push(
    chalk.cyan(BOX.bottomLeft) +
      chalk.cyan(BOX.horizontal.repeat(innerWidth)) +
      chalk.cyan(BOX.bottomRight),
  );

  return lines;
}

// ========================================
// Full Size Pretty Card (for single game view)
// ========================================

const CARD_WIDTH = 60;
const CELL_WIDTH = 13;

function renderCell(
  word: string,
  isSelected: boolean,
  foundLevel?: string,
): string {
  const displayWord = truncateText(word.toUpperCase(), CELL_WIDTH - 2);
  const centered = centerText(displayWord, CELL_WIDTH - 2);

  if (foundLevel) {
    const colorFn = levelBgColors[foundLevel] || chalk.bgGray;
    return colorFn(` ${centered} `);
  } else if (isSelected) {
    return chalk.bgWhite.black.bold(` ${centered} `);
  } else {
    return chalk.bgHex("#3a3a3a").white(` ${centered} `);
  }
}

function renderFoundGroup(group: {
  level: string;
  category: string;
  words: string[];
}): string[] {
  const lines: string[] = [];
  const colorFn = levelBgColors[group.level] || chalk.bgGray;
  const innerWidth = CARD_WIDTH - 4;

  // Category name centered
  const categoryDisplay = truncateText(
    group.category.toUpperCase(),
    innerWidth,
  );
  lines.push(colorFn(centerText(categoryDisplay, CARD_WIDTH - 2)));

  // Words centered
  const wordsDisplay = truncateText(
    group.words.join(", ").toUpperCase(),
    innerWidth,
  );
  lines.push(colorFn(centerText(wordsDisplay, CARD_WIDTH - 2)));

  return lines;
}

function renderGrid(
  remainingWords: string[],
  selectedWords: string[],
  foundGroups: Array<{ level: string; category: string; words: string[] }>,
): string[] {
  const lines: string[] = [];

  // Render found groups first (at the top)
  for (const group of foundGroups) {
    lines.push(...renderFoundGroup(group));
    lines.push(""); // spacing
  }

  // Render remaining words in a 4x4 grid
  const selectedSet = new Set(selectedWords.map((w) => w.toUpperCase()));

  const gridWords = [...remainingWords];
  while (gridWords.length % 4 !== 0 && gridWords.length < 16) {
    gridWords.push("");
  }

  for (let row = 0; row < Math.ceil(gridWords.length / 4); row++) {
    const rowWords = gridWords.slice(row * 4, row * 4 + 4);
    const cells = rowWords.map((word) => {
      if (!word) return " ".repeat(CELL_WIDTH);
      const isSelected = selectedSet.has(word.toUpperCase());
      return renderCell(word, isSelected);
    });
    lines.push(cells.join(" "));
  }

  return lines;
}

// ========================================
// Terminal Helpers
// ========================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clearScreen(): void {
  process.stdout.write("\x1b[2J\x1b[H");
}

function hideCursor(): void {
  process.stdout.write("\x1b[?25l");
}

function showCursor(): void {
  process.stdout.write("\x1b[?25h");
}

function waitForKeypress(): Promise<"next" | "quit"> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const onData = (key: string) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);

      if (key === "\u0003" || key === "q" || key === "Q") {
        resolve("quit");
      } else {
        resolve("next");
      }
    };

    stdin.on("data", onData);
  });
}

// ========================================
// Multi-Game Grid Visualization
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
  stepIdx: number,
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
          (g) => g.category === feedback.foundGroup.category,
        );
        if (!alreadyHas) {
          newState.foundGroups = [...newState.foundGroups, feedback.foundGroup];
        }
        const foundWords = new Set(
          feedback.foundGroup.words.map((w: string) => w.toUpperCase()),
        );
        newState.remainingWords = newState.remainingWords.filter(
          (w) => !foundWords.has(w.toUpperCase()),
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

function renderMultiGameHeader(
  totalGames: number,
  currentStep: number,
  maxSteps: number,
): string[] {
  const lines: string[] = [];

  lines.push("");
  lines.push(
    chalk.cyan.bold(
      `  ${DOUBLE_BOX.topLeft}${DOUBLE_BOX.horizontal.repeat(70)}${DOUBLE_BOX.topRight}`,
    ),
  );
  lines.push(
    chalk.cyan.bold(`  ${DOUBLE_BOX.vertical}`) +
      chalk.white.bold(
        centerText("🎯 NYT ARENA - MULTI-GAME VISUALIZATION", 70),
      ) +
      chalk.cyan.bold(DOUBLE_BOX.vertical),
  );
  lines.push(
    chalk.cyan.bold(
      `  ${DOUBLE_BOX.bottomLeft}${DOUBLE_BOX.horizontal.repeat(70)}${DOUBLE_BOX.bottomRight}`,
    ),
  );
  lines.push("");

  // Progress bar
  const progressWidth = 50;
  const progress = Math.round((currentStep / maxSteps) * progressWidth);
  const progressBar =
    chalk.green("█".repeat(progress)) +
    chalk.gray("░".repeat(progressWidth - progress));
  lines.push(
    chalk.gray(
      `  Step ${currentStep}/${maxSteps}  [${progressBar}] ${Math.round((currentStep / maxSteps) * 100)}%`,
    ),
  );
  lines.push(
    chalk.gray(`  Watching ${totalGames} game${totalGames > 1 ? "s" : ""}`),
  );
  lines.push("");

  return lines;
}

function renderMultiGameFooter(interactive: boolean): string[] {
  const lines: string[] = [];
  lines.push("");
  if (interactive) {
    lines.push(chalk.gray("  [SPACE/ENTER] Next step  [Q] Quit"));
  } else {
    lines.push(chalk.gray("  Press Ctrl+C to exit"));
  }
  lines.push("");
  return lines;
}

function combineCardsHorizontally(
  cards: string[][],
  cardsPerRow: number,
  gap: number = 2,
): string[] {
  const result: string[] = [];
  const gapStr = " ".repeat(gap);

  for (let i = 0; i < cards.length; i += cardsPerRow) {
    const rowCards = cards.slice(i, i + cardsPerRow);

    // Find max height in this row
    const maxHeight = Math.max(...rowCards.map((c) => c.length));

    // Pad each card to max height
    const paddedCards = rowCards.map((card) => {
      const cardWidth = card[0] ? stripAnsi(card[0]).length : MINI_CARD_WIDTH;
      while (card.length < maxHeight) {
        card.push(" ".repeat(cardWidth));
      }
      return card;
    });

    // Combine line by line
    for (let line = 0; line < maxHeight; line++) {
      const lineParts = paddedCards.map((card) => card[line] || "");
      result.push("  " + lineParts.join(gapStr));
    }

    result.push(""); // Gap between rows
  }

  return result;
}

async function runMultiGameVisualization(
  games: MultiGameState[],
  speed: number,
  interactive: boolean,
  columns: number,
): Promise<void> {
  hideCursor();

  try {
    // Find max steps across all games
    const maxSteps = Math.max(...games.map((g) => g.steps.length));

    // Initialize all game states
    for (const game of games) {
      game.gameState = initializeGameState(game.steps);
      game.currentStepIndex = -1;
    }

    // Show initial state
    clearScreen();
    const initialCards = games.map((g) =>
      renderMiniCard(g.gameState, g.runInfo.summary),
    );
    const header = renderMultiGameHeader(games.length, 0, maxSteps);
    const body = combineCardsHorizontally(initialCards, columns);
    const footer = renderMultiGameFooter(interactive);
    console.log([...header, ...body, ...footer].join("\n"));

    if (interactive) {
      const result = await waitForKeypress();
      if (result === "quit") {
        showCursor();
        return;
      }
    } else {
      await sleep(speed);
    }

    // Process steps
    for (let stepIdx = 0; stepIdx < maxSteps; stepIdx++) {
      // Advance each game that has this step
      for (const game of games) {
        if (stepIdx < game.steps.length) {
          const step = game.steps[stepIdx];
          if (step) {
            game.gameState = advanceGameState(game.gameState, step, stepIdx);
            game.currentStepIndex = stepIdx;
          }
        }
      }

      // Render all cards
      clearScreen();
      const cards = games.map((g) =>
        renderMiniCard(g.gameState, g.runInfo.summary),
      );
      const stepHeader = renderMultiGameHeader(
        games.length,
        stepIdx + 1,
        maxSteps,
      );
      const stepBody = combineCardsHorizontally(cards, columns);
      const stepFooter = renderMultiGameFooter(interactive);
      console.log([...stepHeader, ...stepBody, ...stepFooter].join("\n"));

      if (interactive) {
        const result = await waitForKeypress();
        if (result === "quit") {
          showCursor();
          return;
        }
      } else {
        await sleep(speed);
      }
    }

    // Final state
    clearScreen();
    const finalHeader: string[] = [];
    finalHeader.push("");
    finalHeader.push(
      chalk.cyan.bold(
        `  ${DOUBLE_BOX.topLeft}${DOUBLE_BOX.horizontal.repeat(70)}${DOUBLE_BOX.topRight}`,
      ),
    );
    finalHeader.push(
      chalk.cyan.bold(`  ${DOUBLE_BOX.vertical}`) +
        chalk.green.bold(centerText("🎉 ALL GAMES COMPLETE!", 70)) +
        chalk.cyan.bold(DOUBLE_BOX.vertical),
    );
    finalHeader.push(
      chalk.cyan.bold(
        `  ${DOUBLE_BOX.bottomLeft}${DOUBLE_BOX.horizontal.repeat(70)}${DOUBLE_BOX.bottomRight}`,
      ),
    );
    finalHeader.push("");

    // Summary stats
    const successes = games.filter((g) =>
      ["success", "success_clean", "success_with_reveals"].includes(
        g.gameState.status,
      ),
    ).length;
    finalHeader.push(
      chalk.white(
        `  Results: ${chalk.green(`${successes} passed`)} / ${chalk.red(`${games.length - successes} failed`)}`,
      ),
    );
    finalHeader.push("");

    // Mark final status on each game
    for (const game of games) {
      game.gameState.status = game.runInfo.summary.status;
      game.gameState.message =
        game.runInfo.summary.status === "success" ? "Won!" : "Lost";
      game.gameState.messageType =
        game.runInfo.summary.status === "success" ? "success" : "error";
    }

    const finalCards = games.map((g) =>
      renderMiniCard(g.gameState, g.runInfo.summary),
    );
    const finalBody = combineCardsHorizontally(finalCards, columns);
    console.log([...finalHeader, ...finalBody].join("\n"));
    console.log("");
  } finally {
    showCursor();
  }
}

// ========================================
// Single Game Visualization (prettier version)
// ========================================

function renderSingleGameScreen(
  state: GameState,
  summary: RunSummary,
  interactive: boolean,
): string[] {
  const lines: string[] = [];
  const innerWidth = CARD_WIDTH - 2;

  // Header
  lines.push("");
  lines.push(
    chalk.cyan.bold(
      `  ${DOUBLE_BOX.topLeft}${DOUBLE_BOX.horizontal.repeat(CARD_WIDTH)}${DOUBLE_BOX.topRight}`,
    ),
  );
  lines.push(
    chalk.cyan.bold(`  ${DOUBLE_BOX.vertical}`) +
      chalk.white.bold(centerText("🎯 NYT CONNECTIONS", CARD_WIDTH)) +
      chalk.cyan.bold(DOUBLE_BOX.vertical),
  );
  lines.push(
    chalk.cyan.bold(
      `  ${DOUBLE_BOX.bottomLeft}${DOUBLE_BOX.horizontal.repeat(CARD_WIDTH)}${DOUBLE_BOX.bottomRight}`,
    ),
  );
  lines.push("");

  // Model and puzzle info
  const modelShort =
    summary.modelId.length > 45
      ? summary.modelId.slice(0, 42) + "..."
      : summary.modelId;
  lines.push(chalk.gray(`  Model:  ${chalk.cyan(modelShort)}`));
  lines.push(
    chalk.gray(
      `  Puzzle: ${chalk.yellow(summary.puzzleId)}    Step: ${chalk.white(`${state.stepIndex}/${state.totalSteps}`)}`,
    ),
  );
  lines.push("");

  // Mistakes indicator
  const hearts =
    "❤️ ".repeat(state.mistakesLeft) + "🖤 ".repeat(4 - state.mistakesLeft);
  lines.push(`  Mistakes remaining: ${hearts}`);
  lines.push("");

  // Card container
  lines.push(
    chalk.gray(
      `  ${BOX.topLeft}${BOX.horizontal.repeat(CARD_WIDTH)}${BOX.topRight}`,
    ),
  );

  // Grid
  const gridLines = renderGrid(
    state.remainingWords,
    state.selectedWords,
    state.foundGroups,
  );
  for (const line of gridLines) {
    const padding = Math.max(0, CARD_WIDTH - stripAnsi(line).length);
    lines.push(
      chalk.gray(`  ${BOX.vertical}`) +
        line +
        " ".repeat(padding) +
        chalk.gray(BOX.vertical),
    );
  }

  lines.push(
    chalk.gray(
      `  ${BOX.bottomLeft}${BOX.horizontal.repeat(CARD_WIDTH)}${BOX.bottomRight}`,
    ),
  );
  lines.push("");

  // Message
  if (state.message) {
    let msgColor: (s: string) => string;
    let icon: string;
    switch (state.messageType) {
      case "success":
        msgColor = chalk.green;
        icon = "✅";
        break;
      case "error":
        msgColor = chalk.red;
        icon = "❌";
        break;
      case "warning":
        msgColor = chalk.yellow;
        icon = "⚠️ ";
        break;
      default:
        msgColor = chalk.gray;
        icon = "ℹ️ ";
    }
    lines.push(`  ${icon} ${msgColor(state.message)}`);
    lines.push("");
  }

  // Progress bar
  const progressWidth = 40;
  const progress = Math.round(
    (state.stepIndex / state.totalSteps) * progressWidth,
  );
  const progressBar =
    chalk.green("█".repeat(progress)) +
    chalk.gray("░".repeat(progressWidth - progress));
  lines.push(
    `  Progress: [${progressBar}] ${Math.round((state.stepIndex / state.totalSteps) * 100)}%`,
  );
  lines.push("");

  // Instructions
  lines.push(
    interactive
      ? chalk.gray("  [SPACE/ENTER] Next step  [Q] Quit")
      : chalk.gray("  Press Ctrl+C to exit"),
  );
  lines.push("");

  return lines;
}

async function runSingleGameVisualization(
  runInfo: RunInfo,
  steps: StepRecord[],
  speed: number,
  interactive: boolean,
): Promise<void> {
  const summary = runInfo.summary;

  let gameState = initializeGameState(steps);

  hideCursor();

  try {
    // Show initial state
    clearScreen();
    console.log(
      renderSingleGameScreen(gameState, summary, interactive).join("\n"),
    );

    if (interactive) {
      const result = await waitForKeypress();
      if (result === "quit") {
        showCursor();
        return;
      }
    } else {
      await sleep(speed);
    }

    // Process each step
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step) continue;

      // Show selection
      const action = step.parsedAction as any;
      if (action && action.action === "submit_group") {
        gameState.selectedWords = action.words || [];
        gameState.message = `Submitting: ${action.words.join(" + ")}`;
        gameState.messageType = "info";
        gameState.stepIndex = i + 1;

        clearScreen();
        console.log(
          renderSingleGameScreen(gameState, summary, interactive).join("\n"),
        );

        if (interactive) {
          const result = await waitForKeypress();
          if (result === "quit") {
            showCursor();
            return;
          }
        } else {
          await sleep(speed / 2);
        }
      }

      // Show result
      gameState = advanceGameState(gameState, step, i);

      clearScreen();
      console.log(
        renderSingleGameScreen(gameState, summary, interactive).join("\n"),
      );

      if (interactive) {
        const result = await waitForKeypress();
        if (result === "quit") {
          showCursor();
          return;
        }
      } else {
        await sleep(speed);
      }
    }

    // Final screen
    clearScreen();
    gameState.status = summary.status;

    const finalLines: string[] = [];
    finalLines.push("");
    finalLines.push(
      chalk.cyan.bold(
        `  ${DOUBLE_BOX.topLeft}${DOUBLE_BOX.horizontal.repeat(CARD_WIDTH)}${DOUBLE_BOX.topRight}`,
      ),
    );

    if (summary.status === "success" || summary.status === "success_clean") {
      finalLines.push(
        chalk.cyan.bold(`  ${DOUBLE_BOX.vertical}`) +
          chalk.green.bold(centerText("🎉 PUZZLE COMPLETED!", CARD_WIDTH)) +
          chalk.cyan.bold(DOUBLE_BOX.vertical),
      );
    } else {
      finalLines.push(
        chalk.cyan.bold(`  ${DOUBLE_BOX.vertical}`) +
          chalk.red.bold(centerText("💀 PUZZLE FAILED", CARD_WIDTH)) +
          chalk.cyan.bold(DOUBLE_BOX.vertical),
      );
    }

    finalLines.push(
      chalk.cyan.bold(
        `  ${DOUBLE_BOX.bottomLeft}${DOUBLE_BOX.horizontal.repeat(CARD_WIDTH)}${DOUBLE_BOX.bottomRight}`,
      ),
    );
    finalLines.push("");

    // Final grid
    finalLines.push(
      chalk.gray(
        `  ${BOX.topLeft}${BOX.horizontal.repeat(CARD_WIDTH)}${BOX.topRight}`,
      ),
    );
    const finalGrid = renderGrid([], [], gameState.foundGroups);
    for (const line of finalGrid) {
      const padding = Math.max(0, CARD_WIDTH - stripAnsi(line).length);
      finalLines.push(
        chalk.gray(`  ${BOX.vertical}`) +
          line +
          " ".repeat(padding) +
          chalk.gray(BOX.vertical),
      );
    }
    finalLines.push(
      chalk.gray(
        `  ${BOX.bottomLeft}${BOX.horizontal.repeat(CARD_WIDTH)}${BOX.bottomRight}`,
      ),
    );
    finalLines.push("");

    // Stats
    const metrics = summary.metrics as {
      mistakesMade: number;
      groupsFound: number;
    };
    finalLines.push(chalk.white.bold("  Final Statistics:"));
    finalLines.push(chalk.gray(`    Groups Found:   ${metrics.groupsFound}/4`));
    finalLines.push(
      chalk.gray(`    Mistakes Made:  ${metrics.mistakesMade}/4`),
    );
    finalLines.push(chalk.gray(`    Steps Taken:    ${summary.stepsTaken}`));
    finalLines.push(
      chalk.gray(
        `    Total Tokens:   ${summary.usage.totalTokens.toLocaleString()}`,
      ),
    );
    finalLines.push(
      chalk.gray(
        `    Total Latency:  ${(summary.latencyMsTotal / 1000).toFixed(2)}s`,
      ),
    );
    if (summary.costCreditsTotal) {
      finalLines.push(
        chalk.gray(
          `    Total Cost:     $${summary.costCreditsTotal.toFixed(6)}`,
        ),
      );
    }
    finalLines.push("");

    console.log(finalLines.join("\n"));
  } finally {
    showCursor();
  }
}

// ========================================
// List Runs Display
// ========================================

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

async function listRuns(runsDir: string, limit: number): Promise<void> {
  const runs = await findAllRuns(runsDir);

  if (runs.length === 0) {
    console.log(chalk.yellow("\nNo runs found.\n"));
    return;
  }

  console.log(chalk.blue.bold("\n📋 Recent Runs\n"));
  console.log(
    chalk.gray(
      "  " +
        "RUN ID".padEnd(24) +
        "MODEL".padEnd(35) +
        "PUZZLE".padEnd(25) +
        "STATUS".padEnd(12) +
        "TIME",
    ),
  );
  console.log(chalk.gray("  " + "─".repeat(105)));

  for (const run of runs.slice(0, limit)) {
    const statusFn = statusColors[run.summary.status] || chalk.gray;
    const statusText = statusFn(run.summary.status.padEnd(12));
    const timeAgo = getTimeAgo(run.timestamp);

    console.log(
      `  ${chalk.white(run.summary.runId.padEnd(24))}${chalk.cyan(run.summary.modelId.slice(0, 33).padEnd(35))}${chalk.yellow(run.summary.puzzleId.slice(0, 23).padEnd(25))}${statusText}${chalk.gray(timeAgo)}`,
    );
  }

  if (runs.length > limit) {
    console.log(chalk.gray(`\n  ... and ${runs.length - limit} more runs`));
  }

  console.log(chalk.gray("\n  Options:"));
  console.log(chalk.gray("    --run <runId>     Watch a specific run"));
  console.log(
    chalk.gray("    --speed <ms>      Animation speed (default: 1500)"),
  );
  console.log(chalk.gray("    -i, --interactive Step through with keyboard"));
  console.log(
    chalk.gray(
      "    -g, --grid <n>    Watch multiple runs in grid (e.g., -g 4)",
    ),
  );
  console.log(chalk.gray("    --columns <n>     Grid columns (default: 3)\n"));
}

// ========================================
// Static Visualization (fallback for non-connections)
// ========================================

function renderStaticVisualization(
  runInfo: RunInfo,
  steps: StepRecord[],
): void {
  const summary = runInfo.summary;

  console.log("");
  console.log(chalk.cyan.bold("═".repeat(80)));
  console.log(chalk.cyan.bold("  🎯 NYT Arena Run Visualization"));
  console.log(chalk.cyan.bold("═".repeat(80)));
  console.log("");

  console.log(chalk.white.bold("  Run Details:"));
  console.log(chalk.gray(`    Run ID:     ${chalk.white(summary.runId)}`));
  console.log(chalk.gray(`    Model:      ${chalk.cyan(summary.modelId)}`));
  console.log(chalk.gray(`    Puzzle:     ${chalk.yellow(summary.puzzleId)}`));
  console.log(chalk.gray(`    Task:       ${chalk.magenta(summary.task)}`));
  console.log("");

  const statusFn = statusColors[summary.status] || chalk.gray;
  console.log(
    chalk.white.bold("  Result: ") +
      statusFn(` ${summary.status.toUpperCase()} `),
  );
  console.log("");

  console.log(chalk.white.bold("  Statistics:"));
  console.log(chalk.gray(`    Steps:      ${summary.stepsTaken}`));
  console.log(
    chalk.gray(`    Tokens:     ${summary.usage.totalTokens.toLocaleString()}`),
  );
  console.log(
    chalk.gray(
      `    Latency:    ${(summary.latencyMsTotal / 1000).toFixed(2)}s`,
    ),
  );
  console.log("");

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step) continue;

    console.log(chalk.blue.bold("─".repeat(80)));
    console.log(
      chalk.blue.bold(`  📍 Step ${i + 1}/${steps.length}`) +
        chalk.gray(` (${step.latencyMs.toFixed(0)}ms)`),
    );

    const action = step.parsedAction as any;
    if (action) {
      console.log(chalk.gray(`     Action: ${JSON.stringify(action)}`));
    }

    const feedback = step.envFeedback as any;
    if (feedback) {
      console.log(
        chalk.gray(
          `     Feedback: ${feedback.message || JSON.stringify(feedback)}`,
        ),
      );
    }
    console.log("");
  }

  console.log(chalk.cyan.bold("═".repeat(80)));
}

// ========================================
// Main Visualize Function
// ========================================

export async function visualizeRun(options: {
  runsDir: string;
  runId?: string;
  modelId?: string;
  puzzleId?: string;
  listRuns?: boolean;
  limit?: number;
  speed?: number;
  interactive?: boolean;
  grid?: number;
  columns?: number;
}): Promise<void> {
  const {
    runsDir,
    runId,
    modelId,
    puzzleId,
    listRuns: shouldList,
    limit = 10,
    speed = 1500,
    interactive = false,
    grid = 0,
    columns = 3,
  } = options;

  // List runs mode
  if (shouldList) {
    await listRuns(runsDir, limit);
    return;
  }

  // Multi-game grid mode
  if (grid > 0) {
    let runs = await findAllRuns(runsDir);

    // Apply filters
    if (modelId) {
      runs = runs.filter((r) =>
        r.summary.modelId.toLowerCase().includes(modelId.toLowerCase()),
      );
    }
    if (puzzleId) {
      runs = runs.filter((r) =>
        r.summary.puzzleId.toLowerCase().includes(puzzleId.toLowerCase()),
      );
    }

    // Only connections for grid view
    runs = runs.filter((r) => r.summary.task === "connections");

    if (runs.length === 0) {
      console.log(chalk.yellow("\nNo matching Connections runs found.\n"));
      return;
    }

    // Take the requested number
    const selectedRuns = runs.slice(0, grid);

    // Load all steps
    const games: MultiGameState[] = [];
    for (const run of selectedRuns) {
      const steps = await loadSteps(run.path);
      if (steps.length > 0) {
        games.push({
          runInfo: run,
          steps,
          gameState: initializeGameState(steps),
          currentStepIndex: -1,
        });
      }
    }

    if (games.length === 0) {
      console.log(chalk.yellow("\nNo valid runs with steps found.\n"));
      return;
    }

    await runMultiGameVisualization(games, speed, interactive, columns);
    return;
  }

  // Single game mode - find the run
  let runInfo: RunInfo | null = null;

  if (runId) {
    runInfo = await findRunById(runsDir, runId);
    if (!runInfo) {
      console.log(chalk.red(`\nRun not found: ${runId}\n`));
      return;
    }
  } else if (modelId) {
    const runs = await findRunsByModel(runsDir, modelId);
    if (runs.length === 0) {
      console.log(chalk.red(`\nNo runs found for model: ${modelId}\n`));
      return;
    }
    runInfo = runs[0] ?? null;
    if (runs.length > 1) {
      console.log(
        chalk.gray(
          `Found ${runs.length} runs for model "${modelId}", showing most recent.\n`,
        ),
      );
    }
  } else if (puzzleId) {
    const runs = await findRunsByPuzzle(runsDir, puzzleId);
    if (runs.length === 0) {
      console.log(chalk.red(`\nNo runs found for puzzle: ${puzzleId}\n`));
      return;
    }
    runInfo = runs[0] ?? null;
    if (runs.length > 1) {
      console.log(
        chalk.gray(
          `Found ${runs.length} runs for puzzle "${puzzleId}", showing most recent.\n`,
        ),
      );
    }
  } else {
    runInfo = await findLatestRun(runsDir);
    if (!runInfo) {
      console.log(chalk.yellow("\nNo runs found. Run a benchmark first.\n"));
      console.log(
        chalk.gray("  Use: bun run cli run -s suites/connections-test.json\n"),
      );
      return;
    }
  }

  // Load steps
  const steps = await loadSteps(runInfo!.path);

  if (steps.length === 0) {
    console.log(chalk.yellow("\nNo steps found for this run.\n"));
    return;
  }

  // Use appropriate visualization
  if (runInfo!.summary.task === "connections") {
    await runSingleGameVisualization(runInfo!, steps, speed, interactive);
  } else {
    renderStaticVisualization(runInfo!, steps);
  }
}

// ========================================
// Export types for CLI
// ========================================

export type { RunInfo };
