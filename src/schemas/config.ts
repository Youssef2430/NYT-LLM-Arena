import { z } from "zod";

// ========================================
// Suite Configuration Schema
// ========================================

const OpenRouterSettingsSchema = z.object({
  includeUsage: z.boolean().optional().default(true),
  temperature: z.number().optional().default(0),
  maxTokens: z.number().optional().default(1024),
  topP: z.number().optional(),
});

const CrosswordRulesSchema = z.object({
  allowChecks: z.boolean().optional().default(true),
  allowReveals: z.boolean().optional().default(false),
});

export const SuiteConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),

  // Models to evaluate
  models: z.array(z.string()), // OpenRouter model IDs

  // Puzzle selection
  puzzles: z.object({
    type: z.enum(["connections", "crossword"]),
    // Filter options
    ids: z.array(z.string()).optional(), // specific puzzle IDs
    dateRange: z
      .object({
        start: z.string().optional(), // YYYY-MM-DD
        end: z.string().optional(),
      })
      .optional(),
    limit: z.number().optional(), // max puzzles to include
    shuffle: z.boolean().optional().default(false),
    seed: z.number().optional(), // for reproducible shuffling
  }),

  // Repetition
  repeats: z.number().optional().default(1),

  // Budgets
  maxSteps: z.number().optional().default(50),
  runTimeoutMs: z.number().optional().default(300000), // 5 minutes default
  stepTimeoutMs: z.number().optional().default(60000), // 1 minute default

  // Concurrency
  maxConcurrentRuns: z.number().optional().default(5),
  maxConcurrentRequests: z.number().optional().default(10),
  perModelConcurrency: z.record(z.string(), z.number()).optional(),

  // OpenRouter settings
  openRouter: OpenRouterSettingsSchema.optional().default({
    includeUsage: true,
    temperature: 0,
    maxTokens: 1024,
  }),

  // Crossword-specific rules (ignored for connections)
  crosswordRules: CrosswordRulesSchema.optional().default({
    allowChecks: true,
    allowReveals: false,
  }),

  // Step trace storage
  stepsCompression: z
    .enum(["never", "auto", "always"])
    .optional()
    .default("auto"),
  stepsCompressionThresholdBytes: z.number().optional().default(5_000_000),

  // Invalid action handling
  maxInvalidActions: z.number().optional().default(5),
});

export type SuiteConfig = z.infer<typeof SuiteConfigSchema>;

// ========================================
// Run Summary Schema
// ========================================

export const RunStatusSchema = z.enum([
  "success_clean",
  "success_with_reveals",
  "success",
  "fail",
  "timeout",
  "error",
]);

export type RunStatus = z.infer<typeof RunStatusSchema>;

export const ConnectionsRunMetricsSchema = z.object({
  mistakesMade: z.number(),
  groupsFound: z.number(),
});

export const CrosswordRunMetricsSchema = z.object({
  checkedCount: z.number(),
  percentCorrectFilled: z.number(),
  revealedCount: z.number(),
});

export const RunSummarySchema = z.object({
  runId: z.string(),
  suiteName: z.string(),
  startedAt: z.string(), // ISO timestamp
  endedAt: z.string(),

  modelId: z.string(),
  puzzleId: z.string(),
  task: z.enum(["connections", "crossword"]),

  status: RunStatusSchema,
  stepsTaken: z.number(),
  invalidActions: z.number(),

  usage: z.object({
    promptTokens: z.number(),
    completionTokens: z.number(),
    totalTokens: z.number(),
  }),

  latencyMsTotal: z.number(),
  costCreditsTotal: z.number().nullable(),

  // Task-specific metrics
  metrics: z.union([ConnectionsRunMetricsSchema, CrosswordRunMetricsSchema]),
});

export type RunSummary = z.infer<typeof RunSummarySchema>;
export type ConnectionsRunMetrics = z.infer<typeof ConnectionsRunMetricsSchema>;
export type CrosswordRunMetrics = z.infer<typeof CrosswordRunMetricsSchema>;

// ========================================
// Step Record Schema
// ========================================

export const StepRecordSchema = z.object({
  stepIndex: z.number(),
  observation: z.unknown(), // The game state observation
  request: z.object({
    model: z.string(),
    messages: z.array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string(),
      }),
    ),
    params: z.object({
      temperature: z.number().optional(),
      maxTokens: z.number().optional(),
      topP: z.number().optional(),
    }),
    responseFormat: z.unknown().optional(),
  }),
  response: z
    .object({
      raw: z.string().optional(),
      parsed: z.unknown().optional(),
    })
    .optional(),
  parsedAction: z.unknown().nullable(),
  envFeedback: z.unknown(),
  usage: z
    .object({
      promptTokens: z.number(),
      completionTokens: z.number(),
      totalTokens: z.number(),
      cost: z.number().nullable(),
    })
    .nullable(),
  latencyMs: z.number(),
  error: z.string().nullable(),
});

export type StepRecord = z.infer<typeof StepRecordSchema>;

// ========================================
// Models Configuration
// ========================================

export const ModelConfigSchema = z.object({
  id: z.string(), // OpenRouter model ID
  name: z.string().optional(), // Display name
  enabled: z.boolean().optional().default(true),
  // Per-model overrides
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  concurrencyLimit: z.number().optional(),
});

export const ModelsConfigSchema = z.object({
  models: z.array(ModelConfigSchema),
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type ModelsConfig = z.infer<typeof ModelsConfigSchema>;
