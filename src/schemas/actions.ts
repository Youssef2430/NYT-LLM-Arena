import { z } from "zod";

// ========================================
// Connections Actions
// ========================================

export const ConnectionsSubmitGroupActionSchema = z.object({
  task: z.literal("connections"),
  action: z.literal("submit_group"),
  words: z.array(z.string()).length(4),
});

export const ConnectionsGiveUpActionSchema = z.object({
  task: z.literal("connections"),
  action: z.literal("give_up"),
});

export const ConnectionsActionSchema = z.discriminatedUnion("action", [
  ConnectionsSubmitGroupActionSchema,
  ConnectionsGiveUpActionSchema,
]);

export type ConnectionsSubmitGroupAction = z.infer<
  typeof ConnectionsSubmitGroupActionSchema
>;
export type ConnectionsGiveUpAction = z.infer<
  typeof ConnectionsGiveUpActionSchema
>;
export type ConnectionsAction = z.infer<typeof ConnectionsActionSchema>;

// ========================================
// Crossword Actions
// ========================================

export const CrosswordFillEntryActionSchema = z.object({
  task: z.literal("crossword"),
  action: z.literal("fill_entry"),
  direction: z.enum(["across", "down"]),
  number: z.number(),
  answer: z.string(),
});

export const CrosswordClearEntryActionSchema = z.object({
  task: z.literal("crossword"),
  action: z.literal("clear_entry"),
  direction: z.enum(["across", "down"]),
  number: z.number(),
});

export const CrosswordCheckEntryActionSchema = z.object({
  task: z.literal("crossword"),
  action: z.literal("check_entry"),
  direction: z.enum(["across", "down"]),
  number: z.number(),
});

export const CrosswordSubmitPuzzleActionSchema = z.object({
  task: z.literal("crossword"),
  action: z.literal("submit_puzzle"),
});

export const CrosswordGiveUpActionSchema = z.object({
  task: z.literal("crossword"),
  action: z.literal("give_up"),
});

// Full crossword action schema (all actions)
export const CrosswordActionSchema = z.discriminatedUnion("action", [
  CrosswordFillEntryActionSchema,
  CrosswordClearEntryActionSchema,
  CrosswordCheckEntryActionSchema,
  CrosswordSubmitPuzzleActionSchema,
  CrosswordGiveUpActionSchema,
]);

// Crossword action schema without checks (for no-check suite)
export const CrosswordActionNoCheckSchema = z.discriminatedUnion("action", [
  CrosswordFillEntryActionSchema,
  CrosswordClearEntryActionSchema,
  CrosswordSubmitPuzzleActionSchema,
  CrosswordGiveUpActionSchema,
]);

export type CrosswordFillEntryAction = z.infer<
  typeof CrosswordFillEntryActionSchema
>;
export type CrosswordClearEntryAction = z.infer<
  typeof CrosswordClearEntryActionSchema
>;
export type CrosswordCheckEntryAction = z.infer<
  typeof CrosswordCheckEntryActionSchema
>;
export type CrosswordSubmitPuzzleAction = z.infer<
  typeof CrosswordSubmitPuzzleActionSchema
>;
export type CrosswordGiveUpAction = z.infer<typeof CrosswordGiveUpActionSchema>;
export type CrosswordAction = z.infer<typeof CrosswordActionSchema>;

// ========================================
// JSON Schema exports for OpenRouter structured outputs
// ========================================

export const ConnectionsActionJsonSchema = {
  name: "connections_action",
  strict: true,
  schema: {
    type: "object",
    properties: {
      task: { type: "string", enum: ["connections"] },
      action: { type: "string", enum: ["submit_group", "give_up"] },
      words: {
        type: "array",
        items: { type: "string" },
        minItems: 4,
        maxItems: 4,
        description:
          "Required for submit_group action. Array of exactly 4 words to submit as a group.",
      },
    },
    required: ["task", "action"],
    additionalProperties: false,
  },
};

export const CrosswordActionJsonSchema = {
  name: "crossword_action",
  strict: true,
  schema: {
    type: "object",
    properties: {
      task: { type: "string", enum: ["crossword"] },
      action: {
        type: "string",
        enum: [
          "fill_entry",
          "clear_entry",
          "check_entry",
          "submit_puzzle",
          "give_up",
        ],
      },
      direction: {
        type: "string",
        enum: ["across", "down"],
        description: "Required for fill_entry, clear_entry, check_entry.",
      },
      number: {
        type: "number",
        description:
          "The clue number. Required for fill_entry, clear_entry, check_entry.",
      },
      answer: {
        type: "string",
        description:
          "The answer to fill in (uppercase letters only). Required for fill_entry.",
      },
    },
    required: ["task", "action"],
    additionalProperties: false,
  },
};

export const CrosswordActionNoCheckJsonSchema = {
  name: "crossword_action",
  strict: true,
  schema: {
    type: "object",
    properties: {
      task: { type: "string", enum: ["crossword"] },
      action: {
        type: "string",
        enum: ["fill_entry", "clear_entry", "submit_puzzle", "give_up"],
      },
      direction: {
        type: "string",
        enum: ["across", "down"],
        description: "Required for fill_entry, clear_entry.",
      },
      number: {
        type: "number",
        description: "The clue number. Required for fill_entry, clear_entry.",
      },
      answer: {
        type: "string",
        description:
          "The answer to fill in (uppercase letters only). Required for fill_entry.",
      },
    },
    required: ["task", "action"],
    additionalProperties: false,
  },
};
