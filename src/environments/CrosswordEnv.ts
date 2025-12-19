import type { CrosswordPuzzle, CrosswordClue } from "../schemas/puzzles";
import type { CrosswordAction } from "../schemas/actions";

// ========================================
// Types
// ========================================

export interface CrosswordObservation {
  task: "crossword";
  puzzleId: string;
  stateVersion: number;
  width: number;
  height: number;
  fillGrid: string[]; // Current fill state: "#", ".", or letters
  checkedWrongCells: number[]; // Indices of cells known to be wrong after check
  revealedCells: number[]; // Indices of revealed cells (should be empty in default suite)
  clues: {
    across: Array<{
      number: number;
      clue: string;
      length: number;
      currentFill: string; // Current letters filled for this entry
    }>;
    down: Array<{
      number: number;
      clue: string;
      length: number;
      currentFill: string;
    }>;
  };
  history: CrosswordHistoryEntry[];
  rules: string;
  allowedActions: string[];
}

export interface CrosswordHistoryEntry {
  stepIndex: number;
  action: CrosswordAction;
  feedback: CrosswordFeedback;
}

export interface CrosswordFeedback {
  result:
    | "filled"
    | "cleared"
    | "checked"
    | "submitted"
    | "invalid_action"
    | "gave_up";
  message: string;
  // For check_entry
  wrongCells?: number[];
  newlyWrongCells?: number[];
  // For submit_puzzle
  success?: boolean;
  successType?: "success_clean" | "success_with_reveals";
  incorrectCells?: number[];
  // Terminal states
  done: boolean;
  status?: "success_clean" | "success_with_reveals" | "fail" | "gave_up";
}

export interface CrosswordEnvConfig {
  allowChecks: boolean;
  allowReveals: boolean;
}

export interface CrosswordEnvState {
  puzzle: CrosswordPuzzle;
  config: CrosswordEnvConfig;
  fillGrid: string[];
  checkedWrongCells: Set<number>;
  revealedCells: Set<number>;
  history: CrosswordHistoryEntry[];
  stateVersion: number;
  done: boolean;
  status:
    | "in_progress"
    | "success_clean"
    | "success_with_reveals"
    | "fail"
    | "gave_up";
  checksPerformed: number;
}

// ========================================
// CrosswordEnv
// ========================================

export class CrosswordEnv {
  private state: CrosswordEnvState | null = null;
  private clueMap: Map<string, CrosswordClue> = new Map();

  /**
   * Reset the environment with a new puzzle
   */
  reset(
    puzzle: CrosswordPuzzle,
    config: CrosswordEnvConfig = { allowChecks: true, allowReveals: false },
  ): CrosswordObservation {
    // Initialize fill grid with blocks and empty cells
    const fillGrid = puzzle.grid.map((cell) => (cell === "#" ? "#" : "."));

    this.state = {
      puzzle,
      config,
      fillGrid,
      checkedWrongCells: new Set(),
      revealedCells: new Set(),
      history: [],
      stateVersion: 0,
      done: false,
      status: "in_progress",
      checksPerformed: 0,
    };

    // Build clue lookup map
    this.clueMap.clear();
    for (const clue of puzzle.clues.across) {
      this.clueMap.set(`across-${clue.number}`, clue);
    }
    for (const clue of puzzle.clues.down) {
      this.clueMap.set(`down-${clue.number}`, clue);
    }

    return this.getObservation();
  }

  /**
   * Execute an action and return feedback
   */
  step(action: CrosswordAction): {
    observation: CrosswordObservation;
    feedback: CrosswordFeedback;
  } {
    if (!this.state) {
      throw new Error("Environment not initialized. Call reset() first.");
    }

    if (this.state.done) {
      throw new Error("Game is already finished.");
    }

    let feedback: CrosswordFeedback;

    switch (action.action) {
      case "fill_entry":
        feedback = this.handleFillEntry(
          action.direction,
          action.number,
          action.answer,
        );
        break;
      case "clear_entry":
        feedback = this.handleClearEntry(action.direction, action.number);
        break;
      case "check_entry":
        feedback = this.handleCheckEntry(action.direction, action.number);
        break;
      case "submit_puzzle":
        feedback = this.handleSubmitPuzzle();
        break;
      case "give_up":
        feedback = this.handleGiveUp();
        break;
      default:
        feedback = {
          result: "invalid_action",
          message: "Unknown action type.",
          done: false,
        };
    }

    // Record history
    this.state.history.push({
      stepIndex: this.state.history.length,
      action,
      feedback,
    });

    this.state.stateVersion++;

    return {
      observation: this.getObservation(),
      feedback,
    };
  }

  /**
   * Handle fill_entry action
   */
  private handleFillEntry(
    direction: "across" | "down",
    number: number,
    answer: string,
  ): CrosswordFeedback {
    if (!this.state) throw new Error("State not initialized");

    const clue = this.clueMap.get(`${direction}-${number}`);

    if (!clue) {
      return {
        result: "invalid_action",
        message: `No ${direction} clue with number ${number} exists.`,
        done: false,
      };
    }

    // Normalize answer
    const normalizedAnswer = answer.toUpperCase().replace(/[^A-Z]/g, "");

    if (normalizedAnswer.length !== clue.length) {
      return {
        result: "invalid_action",
        message: `Answer length (${normalizedAnswer.length}) does not match entry length (${clue.length}).`,
        done: false,
      };
    }

    if (!/^[A-Z]+$/.test(normalizedAnswer)) {
      return {
        result: "invalid_action",
        message: "Answer must contain only letters A-Z.",
        done: false,
      };
    }

    // Fill the cells
    for (let i = 0; i < clue.cells.length; i++) {
      const cellIndex = clue.cells[i]!;
      this.state.fillGrid[cellIndex] = normalizedAnswer[i]!;
      // Clear any "wrong" marking when cell is modified
      this.state.checkedWrongCells.delete(cellIndex);
    }

    return {
      result: "filled",
      message: `Filled ${direction} ${number} with "${normalizedAnswer}".`,
      done: false,
    };
  }

  /**
   * Handle clear_entry action
   */
  private handleClearEntry(
    direction: "across" | "down",
    number: number,
  ): CrosswordFeedback {
    if (!this.state) throw new Error("State not initialized");

    const clue = this.clueMap.get(`${direction}-${number}`);

    if (!clue) {
      return {
        result: "invalid_action",
        message: `No ${direction} clue with number ${number} exists.`,
        done: false,
      };
    }

    // Clear the cells (but not revealed cells)
    for (const cellIndex of clue.cells) {
      if (!this.state.revealedCells.has(cellIndex)) {
        this.state.fillGrid[cellIndex] = ".";
        this.state.checkedWrongCells.delete(cellIndex);
      }
    }

    return {
      result: "cleared",
      message: `Cleared ${direction} ${number}.`,
      done: false,
    };
  }

  /**
   * Handle check_entry action
   */
  private handleCheckEntry(
    direction: "across" | "down",
    number: number,
  ): CrosswordFeedback {
    if (!this.state) throw new Error("State not initialized");

    if (!this.state.config.allowChecks) {
      return {
        result: "invalid_action",
        message: "Check actions are not allowed in this suite.",
        done: false,
      };
    }

    const clue = this.clueMap.get(`${direction}-${number}`);

    if (!clue) {
      return {
        result: "invalid_action",
        message: `No ${direction} clue with number ${number} exists.`,
        done: false,
      };
    }

    // Check if entry is fully filled
    for (const cellIndex of clue.cells) {
      if (this.state.fillGrid[cellIndex] === ".") {
        return {
          result: "invalid_action",
          message: `Cannot check ${direction} ${number}: entry is not fully filled.`,
          done: false,
        };
      }
    }

    // Compare with solution
    const wrongCells: number[] = [];
    const newlyWrongCells: number[] = [];

    for (const cellIndex of clue.cells) {
      const filled = this.state.fillGrid[cellIndex];
      const correct = this.state.puzzle.solution.grid[cellIndex];

      if (filled !== correct) {
        wrongCells.push(cellIndex);
        if (!this.state.checkedWrongCells.has(cellIndex)) {
          newlyWrongCells.push(cellIndex);
          this.state.checkedWrongCells.add(cellIndex);
        }
      }
    }

    this.state.checksPerformed++;

    if (wrongCells.length === 0) {
      return {
        result: "checked",
        message: `${direction} ${number} is correct!`,
        wrongCells: [],
        newlyWrongCells: [],
        done: false,
      };
    }

    return {
      result: "checked",
      message: `${direction} ${number} has ${wrongCells.length} incorrect cell(s).`,
      wrongCells,
      newlyWrongCells,
      done: false,
    };
  }

  /**
   * Handle submit_puzzle action
   */
  private handleSubmitPuzzle(): CrosswordFeedback {
    if (!this.state) throw new Error("State not initialized");

    // Compare entire grid with solution
    const incorrectCells: number[] = [];

    for (let i = 0; i < this.state.fillGrid.length; i++) {
      const filled = this.state.fillGrid[i];
      const correct = this.state.puzzle.solution.grid[i];

      // Skip blocks
      if (correct === "#") continue;

      if (filled !== correct) {
        incorrectCells.push(i);
      }
    }

    if (incorrectCells.length === 0) {
      // Success!
      const hasReveals = this.state.revealedCells.size > 0;
      const successType = hasReveals ? "success_with_reveals" : "success_clean";

      this.state.done = true;
      this.state.status = successType;

      return {
        result: "submitted",
        message: hasReveals
          ? "Puzzle complete! (with reveals)"
          : "Puzzle complete! All answers are correct.",
        success: true,
        successType,
        done: true,
        status: successType,
      };
    }

    // Fail
    this.state.done = true;
    this.state.status = "fail";

    return {
      result: "submitted",
      message: `Puzzle incomplete or incorrect. ${incorrectCells.length} cell(s) are wrong or empty.`,
      success: false,
      incorrectCells,
      done: true,
      status: "fail",
    };
  }

  /**
   * Handle give_up action
   */
  private handleGiveUp(): CrosswordFeedback {
    if (!this.state) throw new Error("State not initialized");

    this.state.done = true;
    this.state.status = "gave_up";

    return {
      result: "gave_up",
      message: "You gave up. Game over.",
      done: true,
      status: "gave_up",
    };
  }

  /**
   * Get the current observation
   */
  getObservation(): CrosswordObservation {
    if (!this.state) {
      throw new Error("Environment not initialized. Call reset() first.");
    }

    const { puzzle, fillGrid, config } = this.state;

    // Build clue observations with current fill
    const acrossClues = puzzle.clues.across.map((clue) => ({
      number: clue.number,
      clue: clue.clue,
      length: clue.length,
      currentFill: clue.cells.map((i) => fillGrid[i]).join(""),
    }));

    const downClues = puzzle.clues.down.map((clue) => ({
      number: clue.number,
      clue: clue.clue,
      length: clue.length,
      currentFill: clue.cells.map((i) => fillGrid[i]).join(""),
    }));

    // Determine allowed actions
    const allowedActions = [
      "fill_entry",
      "clear_entry",
      "submit_puzzle",
      "give_up",
    ];
    if (config.allowChecks) {
      allowedActions.push("check_entry");
    }

    return {
      task: "crossword",
      puzzleId: this.state.puzzle.id,
      stateVersion: this.state.stateVersion,
      width: puzzle.width,
      height: puzzle.height,
      fillGrid: [...fillGrid],
      checkedWrongCells: Array.from(this.state.checkedWrongCells),
      revealedCells: Array.from(this.state.revealedCells),
      clues: {
        across: acrossClues,
        down: downClues,
      },
      history: this.state.history.map((h) => ({ ...h })),
      rules: this.getRulesText(),
      allowedActions,
    };
  }

  /**
   * Get rules text based on config
   */
  private getRulesText(): string {
    const checkText = this.state?.config.allowChecks
      ? `
3. check_entry: Check if an entry is correct (entry must be fully filled)
   Format: { "task": "crossword", "action": "check_entry", "direction": "across"|"down", "number": <clue_number> }
   Returns which cells are incorrect without revealing the answer.`
      : "";

    return `
CROSSWORD GAME RULES:
- You are solving a crossword puzzle with across and down clues.
- Fill in letters for each clue to complete the puzzle.
- The grid shows "#" for blocked cells, "." for empty cells, and letters for filled cells.
- Your goal is to fill all cells correctly and submit the puzzle.

AVAILABLE ACTIONS:
1. fill_entry: Fill in an answer for a clue
   Format: { "task": "crossword", "action": "fill_entry", "direction": "across"|"down", "number": <clue_number>, "answer": "YOURANSWER" }
   Note: Answer must be uppercase letters only and match the expected length.

2. clear_entry: Clear your answer for a clue
   Format: { "task": "crossword", "action": "clear_entry", "direction": "across"|"down", "number": <clue_number> }
${checkText}

4. submit_puzzle: Submit your completed puzzle for final checking
   Format: { "task": "crossword", "action": "submit_puzzle" }
   Note: This ends the game. You win if all cells are correct, otherwise you lose.

5. give_up: End the game early
   Format: { "task": "crossword", "action": "give_up" }

STRATEGY TIPS:
- Start with clues you're confident about.
- Use crossing letters to help solve harder clues.
- ${this.state?.config.allowChecks ? "Use check_entry to verify entries before submitting." : "There's no way to check entries - only submit when confident."}
- Letters are case-insensitive (will be converted to uppercase).
`.trim();
  }

  /**
   * Check if the game is done
   */
  isDone(): boolean {
    return this.state?.done ?? false;
  }

  /**
   * Get the final status
   */
  getStatus():
    | "in_progress"
    | "success_clean"
    | "success_with_reveals"
    | "fail"
    | "gave_up" {
    return this.state?.status ?? "in_progress";
  }

  /**
   * Get metrics for the run summary
   */
  getMetrics(): {
    checkedCount: number;
    percentCorrectFilled: number;
    revealedCount: number;
  } {
    if (!this.state) {
      return { checkedCount: 0, percentCorrectFilled: 0, revealedCount: 0 };
    }

    const { fillGrid, puzzle } = this.state;
    let correctCount = 0;
    let filledCount = 0;
    let fillableCount = 0;

    for (let i = 0; i < fillGrid.length; i++) {
      if (puzzle.solution.grid[i] === "#") continue;

      fillableCount++;

      if (fillGrid[i] !== ".") {
        filledCount++;
        if (fillGrid[i] === puzzle.solution.grid[i]) {
          correctCount++;
        }
      }
    }

    const percentCorrectFilled =
      filledCount > 0 ? (correctCount / filledCount) * 100 : 0;

    return {
      checkedCount: this.state.checksPerformed,
      percentCorrectFilled: Math.round(percentCorrectFilled * 100) / 100,
      revealedCount: this.state.revealedCells.size,
    };
  }
}
