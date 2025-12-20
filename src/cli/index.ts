import { Command } from "commander";
import chalk from "chalk";
import { join } from "path";
import pino from "pino";

import { SuiteConfigSchema, type SuiteConfig } from "../schemas/config.js";
import type {
  ConnectionsPuzzle,
  CrosswordPuzzle,
  Manifest,
} from "../schemas/puzzles.js";
import { visualizeRun } from "../visualizer/index.js";

// ========================================
// Logger
// ========================================

const logger = pino({
  name: "cli",
  level: process.env.LOG_LEVEL || "warn",
});

// ========================================
// CLI Setup
// ========================================

const program = new Command();

program
  .name("nyt-arena")
  .description("NYT Arena - LLM Benchmark for Crosswords + Connections")
  .version("1.0.0");

// ========================================
// Run Command
// ========================================

program
  .command("run")
  .description("Run a benchmark suite")
  .requiredOption("-s, --suite <path>", "Path to suite configuration file")
  .option("-o, --output <dir>", "Output directory for runs", "runs")
  .option("--dry-run", "Show what would be run without executing")
  .option("--no-dashboard", "Run without interactive dashboard")
  .action(async (options) => {
    try {
      console.log(chalk.blue.bold("\n🎯 NYT Arena Benchmark Runner\n"));

      // Load suite config
      const suitePath = options.suite;
      console.log(chalk.gray(`Loading suite config from: ${suitePath}`));

      const suiteFile = Bun.file(suitePath);
      if (!(await suiteFile.exists())) {
        console.error(chalk.red(`Suite config not found: ${suitePath}`));
        process.exit(1);
      }

      const rawConfig = await suiteFile.json();
      const config = SuiteConfigSchema.parse(rawConfig);

      console.log(chalk.green(`✓ Loaded suite: ${config.name}`));
      console.log(chalk.gray(`  Models: ${config.models.join(", ")}`));
      console.log(chalk.gray(`  Task: ${config.puzzles.type}`));
      console.log(chalk.gray(`  Max steps: ${config.maxSteps}`));
      console.log(chalk.gray(`  Repeats: ${config.repeats}`));

      // Load puzzles
      const puzzles = await loadPuzzles(config);
      console.log(chalk.green(`✓ Loaded ${puzzles.length} puzzles`));

      if (options.dryRun) {
        const totalRuns =
          config.models.length * puzzles.length * config.repeats;
        console.log(
          chalk.yellow(`\nDry run mode - would execute ${totalRuns} runs`),
        );
        console.log(
          chalk.gray(
            `  ${config.models.length} models × ${puzzles.length} puzzles × ${config.repeats} repeats`,
          ),
        );
        return;
      }

      // Check for API key
      if (!process.env.OPENROUTER_API_KEY) {
        console.error(
          chalk.red("\n✗ OPENROUTER_API_KEY environment variable not set"),
        );
        console.error(
          chalk.gray("  Set it with: export OPENROUTER_API_KEY=your_key_here"),
        );
        process.exit(1);
      }

      let results: any[];

      if (options.dashboard !== false) {
        // Run with dashboard
        console.log(
          chalk.blue("\n🚀 Starting benchmark with live dashboard...\n"),
        );

        // Clear screen for dashboard
        console.clear();

        const { runDashboard } = await import("../dashboard/App.js");
        results = await runDashboard({
          config,
          puzzles,
          runsDir: options.output,
        });

        // Dashboard handles its own output
      } else {
        // Run without dashboard
        console.log(chalk.blue("\n🚀 Starting benchmark...\n"));

        const { createConcurrentRunner } = await import(
          "../runner/concurrent-runner.js"
        );
        const runner = createConcurrentRunner(config, options.output);

        // Simple event logging
        runner.on("event", (event: any) => {
          if (event.type === "run_complete") {
            const statusIcon =
              event.status === "success"
                ? chalk.green("✓")
                : event.status === "fail"
                  ? chalk.red("✗")
                  : chalk.yellow("⏱");
            console.log(
              `${statusIcon} ${event.modelId} - ${event.puzzleId} (${event.status})`,
            );
          }
        });

        results = await runner.runSuite(puzzles);

        // Print summary
        printSummary(results);
      }

      console.log(chalk.green(`\n✓ Results saved to: ${options.output}/\n`));
    } catch (error) {
      console.error(chalk.red("\nError:"), error);
      process.exit(1);
    }
  });

// ========================================
// Normalize Command
// ========================================

program
  .command("normalize")
  .description("Normalize raw puzzle data")
  .option(
    "-t, --type <type>",
    "Puzzle type (connections or crossword)",
    "connections",
  )
  .action(async (options) => {
    try {
      console.log(chalk.blue.bold("\n📦 NYT Arena Data Normalizer\n"));

      if (options.type === "connections") {
        console.log(chalk.gray("Running connections normalization..."));
        // Import and run the normalize script
        await import("../data/normalize-connections.js");
      } else if (options.type === "crossword") {
        console.log(
          chalk.yellow("Crossword normalization not yet implemented"),
        );
        console.log(
          chalk.gray("The crossword data source may need to be updated."),
        );
      } else {
        console.error(chalk.red(`Unknown puzzle type: ${options.type}`));
        process.exit(1);
      }

      console.log(chalk.green("\n✓ Normalization complete\n"));
    } catch (error) {
      console.error(chalk.red("\nError:"), error);
      process.exit(1);
    }
  });

// ========================================
// List Command
// ========================================

program
  .command("list")
  .description("List available puzzles")
  .option("-t, --type <type>", "Puzzle type (connections or crossword)")
  .option("-l, --limit <n>", "Limit number of results", "10")
  .action(async (options) => {
    try {
      console.log(chalk.blue.bold("\n📋 Available Puzzles\n"));

      const manifestPath = join(
        process.cwd(),
        "data",
        "normalized",
        "manifest.json",
      );
      const manifestFile = Bun.file(manifestPath);

      if (!(await manifestFile.exists())) {
        console.log(chalk.yellow("No manifest found. Run 'normalize' first."));
        return;
      }

      const manifest: Manifest = await manifestFile.json();
      let entries = manifest.entries;

      if (options.type) {
        entries = entries.filter((e) => e.puzzleType === options.type);
      }

      const limit = parseInt(options.limit, 10);
      const displayEntries = entries.slice(0, limit);

      console.log(
        chalk.gray(
          `Showing ${displayEntries.length} of ${entries.length} puzzles\n`,
        ),
      );

      for (const entry of displayEntries) {
        const typeColor =
          entry.puzzleType === "connections" ? chalk.cyan : chalk.magenta;
        console.log(
          `  ${typeColor(entry.puzzleType.padEnd(12))} ${chalk.white(entry.puzzleId)} ${chalk.gray(`(${entry.date})`)}`,
        );
      }

      if (entries.length > limit) {
        console.log(chalk.gray(`\n  ... and ${entries.length - limit} more`));
      }

      console.log();
    } catch (error) {
      console.error(chalk.red("\nError:"), error);
      process.exit(1);
    }
  });

// ========================================
// Models Command
// ========================================

program
  .command("models")
  .description("List available OpenRouter models")
  .option("-f, --filter <query>", "Filter models by name")
  .action(async (options) => {
    try {
      console.log(chalk.blue.bold("\n🤖 OpenRouter Models\n"));

      if (!process.env.OPENROUTER_API_KEY) {
        console.error(
          chalk.red("OPENROUTER_API_KEY environment variable not set"),
        );
        process.exit(1);
      }

      const { createOpenRouterClient } = await import(
        "../client/openrouter.js"
      );
      const client = createOpenRouterClient();
      const models = await client.getModels();

      let filtered = models;
      if (options.filter) {
        const query = options.filter.toLowerCase();
        filtered = models.filter(
          (m) =>
            m.id.toLowerCase().includes(query) ||
            m.name.toLowerCase().includes(query),
        );
      }

      console.log(chalk.gray(`Found ${filtered.length} models\n`));

      for (const model of filtered.slice(0, 20)) {
        console.log(`  ${chalk.cyan(model.id)}`);
        console.log(
          chalk.gray(
            `    Context: ${model.context_length.toLocaleString()} tokens`,
          ),
        );
        console.log(
          chalk.gray(
            `    Pricing: $${model.pricing.prompt}/1K prompt, $${model.pricing.completion}/1K completion`,
          ),
        );
        console.log();
      }

      if (filtered.length > 20) {
        console.log(chalk.gray(`  ... and ${filtered.length - 20} more\n`));
      }
    } catch (error) {
      console.error(chalk.red("\nError:"), error);
      process.exit(1);
    }
  });

// ========================================
// Helper Functions
// ========================================

async function loadPuzzles(
  config: SuiteConfig,
): Promise<(ConnectionsPuzzle | CrosswordPuzzle)[]> {
  const manifestPath = join(
    process.cwd(),
    "data",
    "normalized",
    "manifest.json",
  );
  const manifestFile = Bun.file(manifestPath);

  if (!(await manifestFile.exists())) {
    throw new Error("Manifest not found. Run 'normalize' first.");
  }

  const manifest: Manifest = await manifestFile.json();

  // Filter entries by type
  let entries = manifest.entries.filter(
    (e) => e.puzzleType === config.puzzles.type,
  );

  // Filter by specific IDs
  if (config.puzzles.ids && config.puzzles.ids.length > 0) {
    const idSet = new Set(config.puzzles.ids);
    entries = entries.filter((e) => idSet.has(e.puzzleId));
  }

  // Filter by date range
  if (config.puzzles.dateRange) {
    if (config.puzzles.dateRange.start) {
      entries = entries.filter(
        (e) => e.date >= config.puzzles.dateRange!.start!,
      );
    }
    if (config.puzzles.dateRange.end) {
      entries = entries.filter((e) => e.date <= config.puzzles.dateRange!.end!);
    }
  }

  // Shuffle if requested
  if (config.puzzles.shuffle) {
    // Use seeded random if seed provided
    if (config.puzzles.seed !== undefined) {
      entries = seededShuffle(entries, config.puzzles.seed);
    } else {
      entries = entries.sort(() => Math.random() - 0.5);
    }
  }

  // Apply limit
  if (config.puzzles.limit) {
    entries = entries.slice(0, config.puzzles.limit);
  }

  // Load puzzle files
  const puzzles: (ConnectionsPuzzle | CrosswordPuzzle)[] = [];

  for (const entry of entries) {
    const puzzlePath = join(process.cwd(), entry.normalizedPath);
    const puzzleFile = Bun.file(puzzlePath);

    if (await puzzleFile.exists()) {
      const puzzle = await puzzleFile.json();
      puzzles.push(puzzle);
    } else {
      logger.warn({ path: puzzlePath }, "Puzzle file not found");
    }
  }

  return puzzles;
}

function seededShuffle<T>(array: T[], seed: number): T[] {
  const result = [...array];
  let m = result.length;
  let i: number;

  // Simple seeded random
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  while (m) {
    i = Math.floor(random() * m--);
    const t = result[m]!;
    result[m] = result[i]!;
    result[i] = t;
  }

  return result;
}

function printSummary(results: any[]) {
  console.log(chalk.blue.bold("\n📊 Results Summary\n"));

  const successCount = results.filter((r) =>
    ["success", "success_clean", "success_with_reveals"].includes(
      r.summary.status,
    ),
  ).length;
  const failCount = results.filter((r) => r.summary.status === "fail").length;
  const timeoutCount = results.filter(
    (r) => r.summary.status === "timeout",
  ).length;
  const errorCount = results.filter((r) => r.summary.status === "error").length;

  console.log(chalk.green(`  ✓ Success: ${successCount}`));
  console.log(chalk.red(`  ✗ Failed: ${failCount}`));
  console.log(chalk.yellow(`  ⏱ Timeout: ${timeoutCount}`));
  console.log(chalk.gray(`  ⚠ Errors: ${errorCount}`));

  const totalCost = results.reduce(
    (sum, r) => sum + (r.summary.costCreditsTotal || 0),
    0,
  );
  const totalTokens = results.reduce(
    (sum, r) => sum + r.summary.usage.totalTokens,
    0,
  );

  console.log(chalk.gray(`\n  Total tokens: ${totalTokens.toLocaleString()}`));
  if (totalCost > 0) {
    console.log(chalk.gray(`  Total cost: $${totalCost.toFixed(4)}`));
  }

  // Per-model breakdown
  const byModel = new Map<
    string,
    { success: number; fail: number; tokens: number; cost: number }
  >();
  for (const result of results) {
    const model = result.summary.modelId;
    const existing = byModel.get(model) || {
      success: 0,
      fail: 0,
      tokens: 0,
      cost: 0,
    };

    if (
      ["success", "success_clean", "success_with_reveals"].includes(
        result.summary.status,
      )
    ) {
      existing.success++;
    } else {
      existing.fail++;
    }
    existing.tokens += result.summary.usage.totalTokens;
    existing.cost += result.summary.costCreditsTotal || 0;

    byModel.set(model, existing);
  }

  console.log(chalk.blue.bold("\n📈 Per-Model Breakdown\n"));
  for (const [model, stats] of byModel) {
    const rate = ((stats.success / (stats.success + stats.fail)) * 100).toFixed(
      0,
    );
    console.log(`  ${chalk.cyan(model)}`);
    console.log(
      chalk.gray(
        `    Success rate: ${rate}% (${stats.success}/${stats.success + stats.fail})`,
      ),
    );
    console.log(
      chalk.gray(
        `    Tokens: ${stats.tokens.toLocaleString()}, Cost: $${stats.cost.toFixed(4)}`,
      ),
    );
  }
}

// ========================================
// Visualize Command
// ========================================

program
  .command("visualize")
  .description(
    "Visualize a run turn-by-turn in the CLI (animated like the real game)",
  )
  .option("-r, --run <runId>", "Specific run ID to visualize")
  .option("-m, --model <modelId>", "Filter by model ID (shows most recent)")
  .option("-p, --puzzle <puzzleId>", "Filter by puzzle ID (shows most recent)")
  .option("-l, --list", "List recent runs")
  .option("-n, --limit <n>", "Limit number of runs to list", "10")
  .option("-s, --speed <ms>", "Animation speed in milliseconds", "1500")
  .option(
    "-i, --interactive",
    "Step through with keyboard (space/enter to advance, q to quit)",
  )
  .option(
    "-g, --grid <n>",
    "Watch multiple games in a grid layout (e.g., -g 6 for 6 games)",
  )
  .option("--columns <n>", "Number of columns in grid view", "3")
  .option("-o, --output <dir>", "Runs directory", "runs")
  .action(async (options) => {
    try {
      await visualizeRun({
        runsDir: options.output,
        runId: options.run,
        modelId: options.model,
        puzzleId: options.puzzle,
        listRuns: options.list,
        limit: parseInt(options.limit, 10),
        speed: parseInt(options.speed, 10),
        interactive: options.interactive,
        grid: options.grid ? parseInt(options.grid, 10) : 0,
        columns: parseInt(options.columns, 10),
      });
    } catch (error) {
      console.error(chalk.red("\nError:"), error);
      process.exit(1);
    }
  });

// ========================================
// Run CLI
// ========================================

program.parse();
