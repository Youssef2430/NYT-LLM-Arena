import type { ConnectionsPuzzle, ConnectionsGroup } from "../schemas/puzzles";
import type { ConnectionsAction } from "../schemas/actions";

// ========================================
// Types
// ========================================

export interface ConnectionsObservation {
  task: "connections";
  puzzleId: string;
  stateVersion: number;
  remainingWords: string[];
  foundGroups: Array<{
    level: "yellow" | "green" | "blue" | "purple";
    category: string;
    words: string[];
  }>;
  mistakesLeft: number;
  history: ConnectionsHistoryEntry[];
  rules: string;
  allowedActions: string[];
}

export interface ConnectionsHistoryEntry {
  stepIndex: number;
  action: ConnectionsAction;
  feedback: ConnectionsFeedback;
}

export interface ConnectionsFeedback {
  result: "correct" | "incorrect" | "invalid_action" | "gave_up";
  oneAway?: boolean;
  message: string;
  foundGroup?: {
    level: "yellow" | "green" | "blue" | "purple";
    category: string;
    words: string[];
  };
  done: boolean;
  status?: "success" | "fail" | "gave_up";
}

export interface ConnectionsEnvState {
  puzzle: ConnectionsPuzzle;
  remainingWords: string[];
  foundGroups: ConnectionsGroup[];
  mistakesLeft: number;
  history: ConnectionsHistoryEntry[];
  stateVersion: number;
  done: boolean;
  status: "in_progress" | "success" | "fail" | "gave_up";
}

// ========================================
// ConnectionsEnv
// ========================================

export class ConnectionsEnv {
  private state: ConnectionsEnvState | null = null;

  /**
   * Reset the environment with a new puzzle
   */
  reset(puzzle: ConnectionsPuzzle): ConnectionsObservation {
    // Shuffle the words for presentation
    const shuffledWords = [...puzzle.words].sort(() => Math.random() - 0.5);

    this.state = {
      puzzle,
      remainingWords: shuffledWords,
      foundGroups: [],
      mistakesLeft: 4,
      history: [],
      stateVersion: 0,
      done: false,
      status: "in_progress",
    };

    return this.getObservation();
  }

  /**
   * Execute an action and return feedback
   */
  step(action: ConnectionsAction): {
    observation: ConnectionsObservation;
    feedback: ConnectionsFeedback;
  } {
    if (!this.state) {
      throw new Error("Environment not initialized. Call reset() first.");
    }

    if (this.state.done) {
      throw new Error("Game is already finished.");
    }

    let feedback: ConnectionsFeedback;

    if (action.action === "give_up") {
      feedback = this.handleGiveUp();
    } else if (action.action === "submit_group") {
      feedback = this.handleSubmitGroup(action.words);
    } else {
      // This shouldn't happen with proper schema validation
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
   * Handle give_up action
   */
  private handleGiveUp(): ConnectionsFeedback {
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
   * Handle submit_group action
   */
  private handleSubmitGroup(submittedWords: string[]): ConnectionsFeedback {
    if (!this.state) throw new Error("State not initialized");

    // Normalize words for comparison (uppercase, trimmed)
    const normalizedSubmitted = submittedWords.map((w) =>
      w.toUpperCase().trim()
    );
    const normalizedRemaining = this.state.remainingWords.map((w) =>
      w.toUpperCase().trim()
    );

    // Validate that exactly 4 words are submitted
    if (normalizedSubmitted.length !== 4) {
      return {
        result: "invalid_action",
        message: "You must submit exactly 4 words.",
        done: false,
      };
    }

    // Check for duplicates
    const uniqueWords = new Set(normalizedSubmitted);
    if (uniqueWords.size !== 4) {
      return {
        result: "invalid_action",
        message: "All 4 words must be different.",
        done: false,
      };
    }

    // Check all words are in remaining words
    for (const word of normalizedSubmitted) {
      if (!normalizedRemaining.includes(word)) {
        return {
          result: "invalid_action",
          message: `Word "${word}" is not in the remaining words.`,
          done: false,
        };
      }
    }

    // Check if this matches any group
    for (const group of this.state.puzzle.groups) {
      const normalizedGroup = group.words.map((w) => w.toUpperCase().trim());
      const matches = normalizedSubmitted.filter((w) =>
        normalizedGroup.includes(w)
      );

      if (matches.length === 4) {
        // Correct group found!
        this.state.foundGroups.push(group);

        // Remove words from remaining (case-insensitive)
        this.state.remainingWords = this.state.remainingWords.filter(
          (w) => !normalizedGroup.includes(w.toUpperCase().trim())
        );

        // Check for victory
        if (this.state.foundGroups.length === 4) {
          this.state.done = true;
          this.state.status = "success";

          return {
            result: "correct",
            message: `Correct! Category: "${group.category}". You found all 4 groups!`,
            foundGroup: {
              level: group.level,
              category: group.category,
              words: group.words,
            },
            done: true,
            status: "success",
          };
        }

        return {
          result: "correct",
          message: `Correct! Category: "${group.category}".`,
          foundGroup: {
            level: group.level,
            category: group.category,
            words: group.words,
          },
          done: false,
        };
      }
    }

    // Check for "one away" (3 words match a group)
    let isOneAway = false;
    for (const group of this.state.puzzle.groups) {
      // Skip already found groups
      if (this.state.foundGroups.some((fg) => fg.category === group.category)) {
        continue;
      }

      const normalizedGroup = group.words.map((w) => w.toUpperCase().trim());
      const matches = normalizedSubmitted.filter((w) =>
        normalizedGroup.includes(w)
      );

      if (matches.length === 3) {
        isOneAway = true;
        break;
      }
    }

    // Decrement mistakes
    this.state.mistakesLeft--;

    // Check for game over
    if (this.state.mistakesLeft <= 0) {
      this.state.done = true;
      this.state.status = "fail";

      return {
        result: "incorrect",
        oneAway: isOneAway,
        message: isOneAway
          ? "One away! But no mistakes remaining. Game over."
          : "Incorrect. No mistakes remaining. Game over.",
        done: true,
        status: "fail",
      };
    }

    return {
      result: "incorrect",
      oneAway: isOneAway,
      message: isOneAway
        ? `One away! ${this.state.mistakesLeft} mistakes remaining.`
        : `Incorrect. ${this.state.mistakesLeft} mistakes remaining.`,
      done: false,
    };
  }

  /**
   * Get the current observation
   */
  getObservation(): ConnectionsObservation {
    if (!this.state) {
      throw new Error("Environment not initialized. Call reset() first.");
    }

    return {
      task: "connections",
      puzzleId: this.state.puzzle.id,
      stateVersion: this.state.stateVersion,
      remainingWords: [...this.state.remainingWords],
      foundGroups: this.state.foundGroups.map((g) => ({
        level: g.level,
        category: g.category,
        words: [...g.words],
      })),
      mistakesLeft: this.state.mistakesLeft,
      history: this.state.history.map((h) => ({ ...h })),
      rules: CONNECTIONS_RULES,
      allowedActions: ["submit_group", "give_up"],
    };
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
  getStatus(): "in_progress" | "success" | "fail" | "gave_up" {
    return this.state?.status ?? "in_progress";
  }

  /**
   * Get metrics for the run summary
   */
  getMetrics(): { mistakesMade: number; groupsFound: number } {
    if (!this.state) {
      return { mistakesMade: 0, groupsFound: 0 };
    }

    return {
      mistakesMade: 4 - this.state.mistakesLeft,
      groupsFound: this.state.foundGroups.length,
    };
  }
}

// ========================================
// Rules text for prompting
// ========================================

const CONNECTIONS_RULES = `
CONNECTIONS GAME RULES:
- You are given 16 words that belong to 4 groups of 4 words each.
- Your goal is to identify all 4 groups correctly.
- Each group has a category that connects the 4 words.
- You have 4 mistakes allowed. If you make 4 incorrect guesses, you lose.
- When you submit a guess, you will be told if it is correct or incorrect.
- If you are "one away", it means 3 of your 4 words belong to the same group.
- Groups are color-coded by difficulty: yellow (easiest), green, blue, purple (hardest).

AVAILABLE ACTIONS:
1. submit_group: Submit 4 words as a group guess
   Format: { "task": "connections", "action": "submit_group", "words": ["WORD1", "WORD2", "WORD3", "WORD4"] }

2. give_up: End the game early
   Format: { "task": "connections", "action": "give_up" }

STRATEGY TIPS:
- Look for common themes, categories, or word associations.
- Words can be tricky - they might relate to multiple categories but only fit one.
- Start with groups you're most confident about.
- Pay attention to "one away" feedback to refine your guesses.
`.trim();
