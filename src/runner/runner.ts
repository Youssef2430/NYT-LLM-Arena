import { nanoid } from "nanoid";
import pLimit from "p-limit";
import pino from "pino";
import { mkdir, writeFile, rename } from "fs/promises";
import { join, dirname } from "path";
import { createGzip } from "zlib";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

import { ConnectionsEnv } from "../environments/ConnectionsEnv";
import { CrosswordEnv } from "../environments/CrosswordEnv";
import {
  OpenRouterClient,
  createOpenRouterClient,
  type ChatMessage,
} from "../client/openrouter";
import {
  ConnectionsActionSchema,
  ConnectionsActionJsonSchema,
  CrosswordActionSchema,
  CrosswordActionJsonSchema,
  CrosswordActionNoCheckJsonSchema,
  type ConnectionsAction,
  type CrosswordAction,
} from "../schemas/actions";
import type {
  SuiteConfig,
  RunSummary,
  StepRecord,
  RunStatus,
} from "../schemas/config";
import type { ConnectionsPuzzle, CrosswordPuzzle } from "../schemas/puzzles";

// ========================================
// Types
// ========================================

export type Puzzle = ConnectionsPuzzle | CrosswordPuzzle;

export interface RunContext {
  runId: string;
  suiteName: string;
  modelId: string;
  puzzle: Puzzle;
  task: "connections" | "crossword";
  config: SuiteConfig;
  outputDir: string;
}

export interface RunResult {
  summary: RunSummary;
  stepsPath: string;
}

// ========================================
// Logger
// ========================================

const logger = pino({
  name: "runner",
  level: process.env.LOG_LEVEL || "info",
});

// ========================================
// Runner Class
// ========================================

export class BenchmarkRunner {
  private client: OpenRouterClient;
  private runLimiter: ReturnType<typeof pLimit>;
  private requestLimiter: ReturnType<typeof pLimit>;
  private config: SuiteConfig;
  private runsDir: string;

  constructor(config: SuiteConfig, runsDir: string = "runs") {
    this.config = config;
    this.runsDir = runsDir;

    // Create OpenRouter client
    this.client = createOpenRouterClient({
      defaultTemperature: config.openRouter.temperature,
      defaultMaxTokens: config.openRouter.maxTokens,
      defaultTopP: config.openRouter.topP,
      includeUsage: config.openRouter.includeUsage,
    });

    // Create concurrency limiters
    this.runLimiter = pLimit(config.maxConcurrentRuns);
    this.requestLimiter = pLimit(config.maxConcurrentRequests);
  }

  /**
   * Run the full benchmark suite
   */
  async runSuite(puzzles: Puzzle[]): Promise<RunResult[]> {
    const results: RunResult[] = [];
    const startTime = Date.now();

    logger.info(
      {
        suiteName: this.config.name,
        models: this.config.models.length,
        puzzles: puzzles.length,
        repeats: this.config.repeats,
        totalRuns:
          this.config.models.length * puzzles.length * this.config.repeats,
      },
      "Starting benchmark suite"
    );

    // Create all run tasks
    const runTasks: Array<() => Promise<RunResult>> = [];

    for (const modelId of this.config.models) {
      for (const puzzle of puzzles) {
        for (let repeat = 0; repeat < this.config.repeats; repeat++) {
          const task = () =>
            this.runSingleEvaluation(modelId, puzzle, repeat);
          runTasks.push(task);
        }
      }
    }

    // Execute with concurrency control
    const runPromises = runTasks.map((task) => this.runLimiter(task));
    const settledResults = await Promise.allSettled(runPromises);

    for (const result of settledResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        logger.error({ error: result.reason }, "Run failed");
      }
    }

    const duration = Date.now() - startTime;
    logger.info(
      {
        suiteName: this.config.name,
        completedRuns: results.length,
        totalRuns: runTasks.length,
        durationMs: duration,
      },
      "Benchmark suite complete"
    );

    return results;
  }

  /**
   * Run a single model/puzzle evaluation
   */
  private async runSingleEvaluation(
    modelId: string,
    puzzle: Puzzle,
    repeatIndex: number
  ): Promise<RunResult> {
    const runId = nanoid();
    const task = "words" in puzzle ? "connections" : "crossword";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    const outputDir = join(
      this.runsDir,
      this.config.name,
      timestamp,
      modelId.replace(/\//g, "_"),
      puzzle.id,
      runId
    );

    await mkdir(outputDir, { recursive: true });

    const context: RunContext = {
      runId,
      suiteName: this.config.name,
      modelId,
      puzzle,
      task,
      config: this.config,
      outputDir,
    };

    logger.info(
      {
        runId,
        modelId,
        puzzleId: puzzle.id,
        task,
        repeat: repeatIndex,
      },
      "Starting run"
    );

    const startedAt = new Date().toISOString();
    const steps: StepRecord[] = [];
    let status: RunStatus = "error";
    let invalidActions = 0;

    // Initialize environment
    const env =
      task === "connections" ? new ConnectionsEnv() : new CrosswordEnv();

    // Reset environment
    let observation: unknown;
    if (task === "connections") {
      observation = (env as ConnectionsEnv).reset(puzzle as ConnectionsPuzzle);
    } else {
      observation = (env as CrosswordEnv).reset(puzzle as CrosswordPuzzle, {
        allowChecks: this.config.crosswordRules.allowChecks,
        allowReveals: this.config.crosswordRules.allowReveals,
      });
    }

    // Tracking
    let totalLatencyMs = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalCost: number | null = 0;

    const runStartTime = Date.now();
    const runTimeout = this.config.runTimeoutMs;

    try {
      // Main step loop
      for (let stepIndex = 0; stepIndex < this.config.maxSteps; stepIndex++) {
        // Check run timeout
        if (Date.now() - runStartTime > runTimeout) {
          status = "timeout";
          break;
        }

        // Build messages
        const messages = this.buildMessages(task, observation);

        // Get JSON schema for structured output
        const jsonSchema = this.getJsonSchema(task);

        // Make API call with concurrency control
        const stepStartTime = Date.now();
        let response: Awaited<
          ReturnType<typeof this.client.chatCompletionWithRetry>
        >;
        let parsedAction: ConnectionsAction | CrosswordAction | null = null;
        let error: string | null = null;

        try {
          response = await this.requestLimiter(() =>
            this.client.chatCompletionWithRetry(
              {
                model: modelId,
                messages,
                temperature: this.config.openRouter.temperature,
                max_tokens: this.config.openRouter.maxTokens,
                response_format: {
                  type: "json_schema",
                  json_schema: jsonSchema,
                },
              },
              {
                timeoutMs: this.config.stepTimeoutMs,
                maxRetries: 3,
              }
            )
          );

          // Parse action
          try {
            const rawAction = JSON.parse(response.content);
            if (task === "connections") {
              parsedAction = ConnectionsActionSchema.parse(rawAction);
            } else {
              parsedAction = CrosswordActionSchema.parse(rawAction);
            }
          } catch (parseError) {
            error = `Failed to parse action: ${parseError}`;
            invalidActions++;
          }
        } catch (apiError) {
          error = `API error: ${apiError}`;
          response = {
            id: "",
            model: modelId,
            content: "",
            finishReason: "error",
            usage: null,
            latencyMs: Date.now() - stepStartTime,
            raw: {} as any,
          };
        }

        const stepLatencyMs = response.latencyMs;
        totalLatencyMs += stepLatencyMs;

        // Update usage tracking
        if (response.usage) {
          totalPromptTokens += response.usage.promptTokens;
          totalCompletionTokens += response.usage.completionTokens;
          if (response.usage.cost !== null && totalCost !== null) {
            totalCost += response.usage.cost;
          } else {
            totalCost = null;
          }
        }

        // Execute action in environment
        let envFeedback: unknown = null;
        if (parsedAction && !error) {
          try {
            const result =
              task === "connections"
                ? (env as ConnectionsEnv).step(parsedAction as ConnectionsAction)
                : (env as CrosswordEnv).step(parsedAction as CrosswordAction);

            observation = result.observation;
            envFeedback = result.feedback;

            // Check if feedback indicates invalid action
            if ((result.feedback as any).result === "invalid_action") {
              invalidActions++;
              if (invalidActions >= this.config.maxInvalidActions) {
                status = "fail";
                break;
              }
            }
          } catch (envError) {
            error = `Environment error: ${envError}`;
            invalidActions++;
          }
        }

        // Record step
        const stepRecord: StepRecord = {
          stepIndex,
          observation,
          request: {
            model: modelId,
            messages,
            params: {
              temperature: this.config.openRouter.temperature,
              maxTokens: this.config.openRouter.maxTokens,
              topP: this.config.openRouter.topP,
            },
            responseFormat: jsonSchema,
          },
          response: {
            raw: response.content,
            parsed: parsedAction,
          },
          parsedAction,
          envFeedback,
          usage: response.usage
            ? {
                promptTokens: response.usage.promptTokens,
                completionTokens: response.usage.completionTokens,
                totalTokens: response.usage.totalTokens,
                cost: response.usage.cost,
              }
            : null,
          latencyMs: stepLatencyMs,
          error,
        };

        steps.push(stepRecord);

        // Check if done
        const isDone =
          task === "connections"
            ? (env as ConnectionsEnv).isDone()
            : (env as CrosswordEnv).isDone();

        if (isDone) {
          const envStatus =
            task === "connections"
              ? (env as ConnectionsEnv).getStatus()
              : (env as CrosswordEnv).getStatus();

          if (envStatus === "success") {
            status = "success";
          } else if (
            envStatus === "success_clean" ||
            envStatus === "success_with_reveals"
          ) {
            status = envStatus;
          } else if (envStatus === "fail" || envStatus === "gave_up") {
            status = "fail";
          }
          break;
        }
      }

      // Check for timeout after loop
      if (status === "error" && Date.now() - runStartTime > runTimeout) {
        status = "timeout";
      }
    } catch (fatalError) {
      logger.error({ runId, error: fatalError }, "Fatal error during run");
      status = "error";
    }

    const endedAt = new Date().toISOString();

    // Get metrics from environment
    const metrics =
      task === "connections"
        ? (env as ConnectionsEnv).getMetrics()
        : (env as CrosswordEnv).getMetrics();

    // Build summary
    const summary: RunSummary = {
      runId,
      suiteName: this.config.name,
      startedAt,
      endedAt,
      modelId,
      puzzleId: puzzle.id,
      task,
      status,
      stepsTaken: steps.length,
      invalidActions,
      usage: {
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens: totalPromptTokens + totalCompletionTokens,
      },
      latencyMsTotal: totalLatencyMs,
      costCreditsTotal: totalCost,
      metrics,
    };

    // Write steps file
    const stepsPath = await this.writeSteps(outputDir, steps);

    // Write summary (atomic)
    const summaryPath = join(outputDir, "summary.json");
    const summaryTmpPath = join(outputDir, "summary.json.tmp");
    await writeFile(summaryTmpPath, JSON.stringify(summary, null, 2));
    await rename(summaryTmpPath, summaryPath);

    logger.info(
      {
        runId,
        modelId,
        puzzleId: puzzle.id,
        status,
        steps: steps.length,
        latencyMs: totalLatencyMs,
      },
      "Run complete"
    );

    return {
      summary,
      stepsPath,
    };
  }

  /**
   * Build messages for the LLM
   */
  private buildMessages(
    task: "connections" | "crossword",
    observation: unknown
  ): ChatMessage[] {
    const systemMessage =
      task === "connections"
        ? CONNECTIONS_SYSTEM_PROMPT
        : CROSSWORD_SYSTEM_PROMPT;

    return [
      {
        role: "system",
        content: systemMessage,
      },
      {
        role: "user",
        content: `Current game state:\n\n${JSON.stringify(observation, null, 2)}`,
      },
    ];
  }

  /**
   * Get JSON schema for structured output
   */
  private getJsonSchema(
    task: "connections" | "crossword"
  ): { name: string; strict: boolean; schema: Record<string, unknown> } {
    if (task === "connections") {
      return ConnectionsActionJsonSchema;
    }

    if (this.config.crosswordRules.allowChecks) {
      return CrosswordActionJsonSchema;
    }

    return CrosswordActionNoCheckJsonSchema;
  }

  /**
   * Write steps to file (with optional compression)
   */
  private async writeSteps(
    outputDir: string,
    steps: StepRecord[]
  ): Promise<string> {
    const jsonlContent = steps.map((s) => JSON.stringify(s)).join("\n");
    const bytes = Buffer.byteLength(jsonlContent, "utf8");

    const shouldCompress =
      this.config.stepsCompression === "always" ||
      (this.config.stepsCompression === "auto" &&
        bytes > this.config.stepsCompressionThresholdBytes);

    if (shouldCompress) {
      const gzPath = join(outputDir, "steps.jsonl.gz");
      const gzip = createGzip();
      const source = Readable.from([jsonlContent]);
      const destination = createWriteStream(gzPath);
      await pipeline(source, gzip, destination);
      return gzPath;
    }

    const plainPath = join(outputDir, "steps.jsonl");
    await writeFile(plainPath, jsonlContent);
    return plainPath;
  }
}

// ========================================
// System Prompts
// ========================================

const CONNECTIONS_SYSTEM_PROMPT = `You are an expert puzzle solver playing NYT Connections.

Your task is to identify groups of 4 related words from the 16 given words.
You must respond with a valid JSON action.

IMPORTANT:
- Analyze the words carefully before guessing.
- Look for subtle connections - words can be tricky.
- Pay attention to "one away" feedback if you get it.
- You have only 4 mistakes allowed.

Respond ONLY with a JSON object for your action. Do not include any other text.

Example actions:
- Submit a group: {"task":"connections","action":"submit_group","words":["WORD1","WORD2","WORD3","WORD4"]}
- Give up: {"task":"connections","action":"give_up"}`;

const CROSSWORD_SYSTEM_PROMPT = `You are an expert crossword solver playing an NYT-style crossword puzzle.

Your task is to fill in the crossword grid based on the clues provided.
You must respond with a valid JSON action.

IMPORTANT:
- Read clues carefully and consider crossing letters.
- Answers should be uppercase letters only.
- You can check entries to verify correctness (if allowed).
- Submit only when confident the puzzle is complete.

Respond ONLY with a JSON object for your action. Do not include any other text.

Example actions:
- Fill entry: {"task":"crossword","action":"fill_entry","direction":"across","number":1,"answer":"HELLO"}
- Clear entry: {"task":"crossword","action":"clear_entry","direction":"across","number":1}
- Check entry: {"task":"crossword","action":"check_entry","direction":"across","number":1}
- Submit puzzle: {"task":"crossword","action":"submit_puzzle"}
- Give up: {"task":"crossword","action":"give_up"}`;

// ========================================
// Export factory function
// ========================================

export function createRunner(
  config: SuiteConfig,
  runsDir?: string
): BenchmarkRunner {
  return new BenchmarkRunner(config, runsDir);
}
