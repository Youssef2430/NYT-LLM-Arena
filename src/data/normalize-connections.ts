import { createHash } from "crypto";
import { readdir, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import {
  ConnectionsPuzzleSchema,
  LEVEL_MAP,
  type ConnectionsPuzzle,
  type Manifest,
  type ManifestEntry,
} from "../schemas/puzzles";

// ========================================
// Raw data schema (from connections-answers repo)
// ========================================

interface RawConnectionsPuzzle {
  id: number;
  date: string; // YYYY-MM-DD
  answers: Array<{
    level: number; // 0-3
    group: string; // category name
    members: string[]; // 4 words
  }>;
}

// ========================================
// Normalization
// ========================================

function normalizeConnectionsPuzzle(raw: RawConnectionsPuzzle): ConnectionsPuzzle {
  // Extract all words in order (by difficulty level)
  const words: string[] = [];
  const groups = raw.answers.map((answer) => {
    words.push(...answer.members);
    return {
      level: LEVEL_MAP[answer.level] || "yellow",
      category: answer.group,
      words: answer.members,
    };
  });

  return {
    id: `connections-${raw.date}`,
    source: "connections-answers",
    date: raw.date,
    puzzleNumber: raw.id,
    words,
    groups,
    metadata: {},
  };
}

function computeSha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

// ========================================
// Main
// ========================================

async function main() {
  const projectRoot = join(import.meta.dir, "..", "..");
  const rawPath = join(
    projectRoot,
    "data",
    "raw",
    "connections-answers",
    "connections.json"
  );
  const normalizedDir = join(projectRoot, "data", "normalized", "connections");
  const manifestPath = join(projectRoot, "data", "normalized", "manifest.json");

  console.log("Loading raw connections data...");

  const rawFile = Bun.file(rawPath);
  if (!(await rawFile.exists())) {
    console.error(`Raw data file not found: ${rawPath}`);
    process.exit(1);
  }

  const rawData: RawConnectionsPuzzle[] = await rawFile.json();
  console.log(`Found ${rawData.length} puzzles in raw data`);

  // Ensure output directory exists
  await mkdir(normalizedDir, { recursive: true });

  // Load existing manifest or create new one
  let manifest: Manifest;
  const manifestFile = Bun.file(manifestPath);
  if (await manifestFile.exists()) {
    manifest = await manifestFile.json();
    console.log(`Loaded existing manifest with ${manifest.entries.length} entries`);
  } else {
    manifest = {
      version: "1.0.0",
      updatedAt: new Date().toISOString(),
      entries: [],
    };
  }

  // Filter out existing connections entries
  const existingEntries = manifest.entries.filter(
    (e) => e.puzzleType !== "connections"
  );

  const newEntries: ManifestEntry[] = [];
  let normalized = 0;
  let errors = 0;

  for (const raw of rawData) {
    try {
      const puzzle = normalizeConnectionsPuzzle(raw);

      // Validate with zod
      const validated = ConnectionsPuzzleSchema.parse(puzzle);

      // Write normalized file
      const normalizedPath = join(normalizedDir, `${validated.id}.json`);
      const jsonContent = JSON.stringify(validated, null, 2);
      await writeFile(normalizedPath, jsonContent);

      // Create manifest entry
      const entry: ManifestEntry = {
        puzzleId: validated.id,
        puzzleType: "connections",
        date: validated.date,
        source: validated.source,
        rawPath: "data/raw/connections-answers/connections.json",
        normalizedPath: `data/normalized/connections/${validated.id}.json`,
        sha256: computeSha256(jsonContent),
        ingestedAt: new Date().toISOString(),
      };

      newEntries.push(entry);
      normalized++;

      if (normalized % 100 === 0) {
        console.log(`Normalized ${normalized} puzzles...`);
      }
    } catch (error) {
      console.error(`Error normalizing puzzle ${raw.id} (${raw.date}):`, error);
      errors++;
    }
  }

  // Update manifest
  manifest.entries = [...existingEntries, ...newEntries];
  manifest.updatedAt = new Date().toISOString();

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  console.log("\n=== Normalization Complete ===");
  console.log(`Normalized: ${normalized} puzzles`);
  console.log(`Errors: ${errors}`);
  console.log(`Total manifest entries: ${manifest.entries.length}`);
  console.log(`Manifest written to: ${manifestPath}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
