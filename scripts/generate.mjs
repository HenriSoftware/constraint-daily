import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { PuzzleSchema, CLASS_LIST, validatePuzzleQuality, normalizeWord } from "./schema.mjs";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY env var.");
  process.exit(1);
}

const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini"; // change any time without code changes
const MAX_TRIES = Number(process.env.GEN_MAX_TRIES || 3);

// Run date in UTC (GitHub Actions schedule is UTC)
const todayUTC = new Date();
const yyyy = todayUTC.getUTCFullYear();
const mm = String(todayUTC.getUTCMonth() + 1).padStart(2, "0");
const dd = String(todayUTC.getUTCDate()).padStart(2, "0");
const dateStr = `${yyyy}-${mm}-${dd}`;

const outDir = path.join(process.cwd(), "daily");
fs.mkdirSync(outDir, { recursive: true });

const fileDated = path.join(outDir, `${dateStr}.json`);
const fileLatest = path.join(outDir, `latest.json`);

function readJSONIfExists(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function writeJSON(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function shuffleTogether(classes, clues) {
  const idx = classes.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return {
    classes: idx.map((i) => classes[i]),
    clues: idx.map((i) => clues[i])
  };
}

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

const SYSTEM_RULES = `
You are generating ONE daily puzzle for a logic game called "Constraint".

Hard rules:
- Output MUST be valid JSON only. No markdown. No comments.
- Exactly 6 clue classes chosen from the allowed list.
- Exactly 1 clue per class (6 clues total).
- All clues must be POSITIVE, descriptive, and directional.
- NO negations: do not use "not", "never", "no ...", "cannot", "without", "isn't", "doesn't", etc.
- Avoid metaphors as the main clue type. Use a balanced mix: factual + functional + contextual; at most 1 creative/cognitive clue.
- At least 2 anchor classes must be included among: ontological, functional, contextual.
- Clues must be precise and helpful; each clue should meaningfully narrow the answer.
- Answer must be a single English word or a common two-word phrase (max 2 words), no proper nouns, no brand names, no profanity.
- Provide an "accepted" list including the answer plus up to 10 very close synonyms/variants that you would accept as correct (optional but recommended).
- Ensure the puzzle is fair for general audiences, no niche trivia.

Allowed classes:
${CLASS_LIST.join(", ")}

JSON schema:
{
  "date": "${dateStr}",
  "answer": string,
  "classes": [6 items from allowed classes],
  "clues": [6 strings aligned with classes],
  "explanation": string,
  "accepted": [optional list of strings],
  "difficulty": "easy" | "medium" | "hard"
}
`.trim();

async function generateOnce() {
  const prompt = `
Generate today's puzzle. Keep the answer in the everyday range (household object or common concept).
Make the clues balanced and concrete.
`.trim();

  // Responses API (recommended for new projects)
  const resp = await client.responses.create({
    model: MODEL,
    input: [
      { role: "developer", content: SYSTEM_RULES },
      { role: "user", content: prompt }
    ],
    // Encourage JSON output
    response_format: { type: "json_object" }
  });

  // Extract JSON text. The SDK returns structured output; safest is to read output_text.
  const text = resp.output_text?.trim();
  if (!text) throw new Error("Empty model output.");

  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    throw new Error("Model did not return valid JSON.");
  }
  return obj;
}

function postProcess(puz) {
  // normalize accepted list
  const accepted = new Set([normalizeWord(puz.answer)]);
  for (const a of puz.accepted || []) accepted.add(normalizeWord(a));
  puz.accepted = Array.from(accepted).slice(0, 25);

  // shuffle order (random each generation, fixed for the day)
  const shuffled = shuffleTogether(puz.classes, puz.clues);
  puz.classes = shuffled.classes;
  puz.clues = shuffled.clues;

  return puz;
}

async function main() {
  // If today's file already exists, do nothing (idempotent)
  if (fs.existsSync(fileDated)) {
    console.log(`Puzzle already exists for ${dateStr}.`);
    const existing = readJSONIfExists(fileDated);
    if (existing) writeJSON(fileLatest, existing);
    return;
  }

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      console.log(`Generating puzzle attempt ${attempt}/${MAX_TRIES}...`);
      const raw = await generateOnce();
      const parsed = PuzzleSchema.parse(raw);
      const puz = postProcess(parsed);
      const quality = validatePuzzleQuality(puz);
      if (!quality.ok) throw new Error(`Quality check failed: ${quality.reason}`);

      writeJSON(fileDated, puz);
      writeJSON(fileLatest, puz);
      console.log("Puzzle generated successfully.");
      return;
    } catch (e) {
      lastError = e;
      console.error(String(e?.message || e));
    }
  }

  // Fallback: keep site working by reusing previous latest.json
  const prev = readJSONIfExists(fileLatest);
  if (prev) {
    console.log("Falling back to previous latest.json to avoid a broken day.");
    writeJSON(fileDated, { ...prev, date: dateStr, fallback: true });
    return;
  }

  throw lastError || new Error("Generation failed without fallback.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
