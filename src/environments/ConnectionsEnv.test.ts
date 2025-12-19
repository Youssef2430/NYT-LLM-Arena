import { describe, test, expect } from "bun:test";
import { ConnectionsEnv } from "./ConnectionsEnv";
import type { ConnectionsPuzzle } from "../schemas/puzzles";

const samplePuzzle: ConnectionsPuzzle = {
  id: "connections-test",
  source: "test",
  date: "2023-06-12",
  puzzleNumber: 1,
  words: [
    "HAIL",
    "RAIN",
    "SLEET",
    "SNOW",
    "BUCKS",
    "HEAT",
    "JAZZ",
    "NETS",
    "OPTION",
    "RETURN",
    "SHIFT",
    "TAB",
    "KAYAK",
    "LEVEL",
    "MOM",
    "RACECAR",
  ],
  groups: [
    {
      level: "yellow",
      category: "WET WEATHER",
      words: ["HAIL", "RAIN", "SLEET", "SNOW"],
    },
    {
      level: "green",
      category: "NBA TEAMS",
      words: ["BUCKS", "HEAT", "JAZZ", "NETS"],
    },
    {
      level: "blue",
      category: "KEYBOARD KEYS",
      words: ["OPTION", "RETURN", "SHIFT", "TAB"],
    },
    {
      level: "purple",
      category: "PALINDROMES",
      words: ["KAYAK", "LEVEL", "MOM", "RACECAR"],
    },
  ],
};

describe("ConnectionsEnv", () => {
  test("should initialize correctly", () => {
    const env = new ConnectionsEnv();
    const observation = env.reset(samplePuzzle);

    expect(observation.task).toBe("connections");
    expect(observation.puzzleId).toBe("connections-test");
    expect(observation.remainingWords.length).toBe(16);
    expect(observation.foundGroups.length).toBe(0);
    expect(observation.mistakesLeft).toBe(4);
    expect(observation.history.length).toBe(0);
    expect(env.isDone()).toBe(false);
  });

  test("should accept a correct group", () => {
    const env = new ConnectionsEnv();
    env.reset(samplePuzzle);

    const { feedback, observation } = env.step({
      task: "connections",
      action: "submit_group",
      words: ["HAIL", "RAIN", "SLEET", "SNOW"],
    });

    expect(feedback.result).toBe("correct");
    expect(feedback.foundGroup?.category).toBe("WET WEATHER");
    expect(observation.remainingWords.length).toBe(12);
    expect(observation.foundGroups.length).toBe(1);
    expect(observation.mistakesLeft).toBe(4);
    expect(env.isDone()).toBe(false);
  });

  test("should reject an incorrect group and decrement mistakes", () => {
    const env = new ConnectionsEnv();
    env.reset(samplePuzzle);

    const { feedback, observation } = env.step({
      task: "connections",
      action: "submit_group",
      words: ["HAIL", "RAIN", "BUCKS", "HEAT"],
    });

    expect(feedback.result).toBe("incorrect");
    expect(observation.remainingWords.length).toBe(16);
    expect(observation.foundGroups.length).toBe(0);
    expect(observation.mistakesLeft).toBe(3);
    expect(env.isDone()).toBe(false);
  });

  test("should detect one-away guess", () => {
    const env = new ConnectionsEnv();
    env.reset(samplePuzzle);

    const { feedback } = env.step({
      task: "connections",
      action: "submit_group",
      words: ["HAIL", "RAIN", "SLEET", "BUCKS"],
    });

    expect(feedback.result).toBe("incorrect");
    expect(feedback.oneAway).toBe(true);
  });

  test("should handle give up action", () => {
    const env = new ConnectionsEnv();
    env.reset(samplePuzzle);

    const { feedback } = env.step({
      task: "connections",
      action: "give_up",
    });

    expect(feedback.result).toBe("gave_up");
    expect(feedback.done).toBe(true);
    expect(env.isDone()).toBe(true);
    expect(env.getStatus()).toBe("gave_up");
  });

  test("should fail after 4 mistakes", () => {
    const env = new ConnectionsEnv();
    env.reset(samplePuzzle);

    // Make 4 wrong guesses
    const wrongGuess = {
      task: "connections" as const,
      action: "submit_group" as const,
      words: ["HAIL", "BUCKS", "OPTION", "KAYAK"],
    };

    for (let i = 0; i < 3; i++) {
      const { feedback } = env.step(wrongGuess);
      expect(feedback.result).toBe("incorrect");
      expect(env.isDone()).toBe(false);
    }

    // Fourth mistake should end the game
    const { feedback } = env.step(wrongGuess);
    expect(feedback.result).toBe("incorrect");
    expect(feedback.done).toBe(true);
    expect(feedback.status).toBe("fail");
    expect(env.isDone()).toBe(true);
    expect(env.getStatus()).toBe("fail");
  });

  test("should win after finding all 4 groups", () => {
    const env = new ConnectionsEnv();
    env.reset(samplePuzzle);

    const groups = [
      ["HAIL", "RAIN", "SLEET", "SNOW"],
      ["BUCKS", "HEAT", "JAZZ", "NETS"],
      ["OPTION", "RETURN", "SHIFT", "TAB"],
      ["KAYAK", "LEVEL", "MOM", "RACECAR"],
    ];

    for (let i = 0; i < 3; i++) {
      const { feedback } = env.step({
        task: "connections",
        action: "submit_group",
        words: groups[i]!,
      });
      expect(feedback.result).toBe("correct");
      expect(env.isDone()).toBe(false);
    }

    // Last group should win
    const { feedback } = env.step({
      task: "connections",
      action: "submit_group",
      words: groups[3]!,
    });

    expect(feedback.result).toBe("correct");
    expect(feedback.done).toBe(true);
    expect(feedback.status).toBe("success");
    expect(env.isDone()).toBe(true);
    expect(env.getStatus()).toBe("success");
  });

  test("should reject invalid actions", () => {
    const env = new ConnectionsEnv();
    env.reset(samplePuzzle);

    // Submit wrong number of words
    const { feedback: feedback1 } = env.step({
      task: "connections",
      action: "submit_group",
      words: ["HAIL", "RAIN", "SLEET"] as any,
    });
    expect(feedback1.result).toBe("invalid_action");

    // Submit word not in remaining words
    const { feedback: feedback2 } = env.step({
      task: "connections",
      action: "submit_group",
      words: ["HAIL", "RAIN", "SLEET", "NOTAWORD"],
    });
    expect(feedback2.result).toBe("invalid_action");

    // Submit duplicate words
    const { feedback: feedback3 } = env.step({
      task: "connections",
      action: "submit_group",
      words: ["HAIL", "HAIL", "RAIN", "SLEET"],
    });
    expect(feedback3.result).toBe("invalid_action");
  });

  test("should be case insensitive", () => {
    const env = new ConnectionsEnv();
    env.reset(samplePuzzle);

    const { feedback } = env.step({
      task: "connections",
      action: "submit_group",
      words: ["hail", "Rain", "SLEET", "snow"],
    });

    expect(feedback.result).toBe("correct");
  });

  test("should track metrics correctly", () => {
    const env = new ConnectionsEnv();
    env.reset(samplePuzzle);

    // Make one mistake
    env.step({
      task: "connections",
      action: "submit_group",
      words: ["HAIL", "BUCKS", "OPTION", "KAYAK"],
    });

    // Find two groups
    env.step({
      task: "connections",
      action: "submit_group",
      words: ["HAIL", "RAIN", "SLEET", "SNOW"],
    });

    env.step({
      task: "connections",
      action: "submit_group",
      words: ["BUCKS", "HEAT", "JAZZ", "NETS"],
    });

    const metrics = env.getMetrics();
    expect(metrics.mistakesMade).toBe(1);
    expect(metrics.groupsFound).toBe(2);
  });
});
