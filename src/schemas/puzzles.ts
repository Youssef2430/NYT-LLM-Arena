import { z } from "zod";

// ========================================
// Connections Puzzle Schema
// ========================================

export const ConnectionsGroupSchema = z.object({
  level: z.enum(["yellow", "green", "blue", "purple"]),
  category: z.string(),
  words: z.array(z.string()).min(4).max(4),
});

export const ConnectionsPuzzleSchema = z.object({
  id: z.string(), // e.g., "connections-2023-06-12" or "connections-1"
  source: z.string(), // identifier for upstream source
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format"), // YYYY-MM-DD
  puzzleNumber: z.number().optional(),
  words: z.array(z.string()).min(16).max(16), // all 16 words (shuffled order for presentation)
  groups: z.array(ConnectionsGroupSchema).min(4).max(4),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ConnectionsGroup = z.infer<typeof ConnectionsGroupSchema>;
export type ConnectionsPuzzle = z.infer<typeof ConnectionsPuzzleSchema>;

// ========================================
// Crossword Puzzle Schema
// ========================================

export const CrosswordClueSchema = z.object({
  number: z.number(),
  clue: z.string(),
  length: z.number(),
  cells: z.array(z.number()), // linear indices into the grid
});

export const CrosswordPuzzleSchema = z.object({
  id: z.string(), // e.g., "xword-2018-03-08"
  source: z.string(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format"),
  width: z.number(),
  height: z.number(),
  grid: z.array(z.string()), // "#" for blocks, "." for empty fillable cells
  clues: z.object({
    across: z.array(CrosswordClueSchema),
    down: z.array(CrosswordClueSchema),
  }),
  solution: z.object({
    grid: z.array(z.string()), // "#" and uppercase letters
  }),
  metadata: z
    .object({
      author: z.string().optional(),
      editor: z.string().optional(),
      title: z.string().optional(),
      difficulty: z.string().optional(),
    })
    .optional(),
});

export type CrosswordClue = z.infer<typeof CrosswordClueSchema>;
export type CrosswordPuzzle = z.infer<typeof CrosswordPuzzleSchema>;

// ========================================
// Manifest Schema
// ========================================

export const ManifestEntrySchema = z.object({
  puzzleId: z.string(),
  puzzleType: z.enum(["connections", "crossword"]),
  date: z.string(),
  source: z.string(),
  rawPath: z.string().optional(),
  normalizedPath: z.string(),
  sha256: z.string(),
  ingestedAt: z.string(), // ISO timestamp
});

export const ManifestSchema = z.object({
  version: z.string(),
  updatedAt: z.string(),
  entries: z.array(ManifestEntrySchema),
});

export type ManifestEntry = z.infer<typeof ManifestEntrySchema>;
export type Manifest = z.infer<typeof ManifestSchema>;

// ========================================
// Level mapping helper
// ========================================

export const LEVEL_MAP: Record<number, "yellow" | "green" | "blue" | "purple"> =
  {
    0: "yellow",
    1: "green",
    2: "blue",
    3: "purple",
  };
