import { z } from "zod";

export const CLASS_LIST = [
  "ontological",
  "functional",
  "contextual",
  "structural",
  "temporal",
  "human_interaction",
  "quantitative",
  "dependency",
  "limitation",
  "representational",
  "social_collective",
  "creative_cognitive"
];

export const ANCHOR_CLASSES = new Set(["ontological", "functional", "contextual"]);

export const PuzzleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  answer: z.string().min(2).max(40),
  classes: z.array(z.enum(CLASS_LIST)).length(6),
  clues: z.array(z.string().min(5).max(160)).length(6),
  explanation: z.string().min(10).max(900),
  // Optional: accepted guesses mapping (synonyms -> canonical answer)
  accepted: z.array(z.string().min(2).max(40)).max(25).default([]),
  // Optional: difficulty metadata for future use
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium")
});

export function normalizeWord(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function hasForbiddenNegation(text) {
  // keep it strict (English-focused). Add more languages later if needed.
  const t = text.toLowerCase();
  const forbidden = [
    /\bnot\b/,
    /\bnever\b/,
    /\bno\s+\w+/,
    /\bcannot\b/,
    /\bcan\'t\b/,
    /\bdoesn\'t\b/,
    /\bdoes not\b/,
    /\bisn\'t\b/,
    /\bis not\b/,
    /\baren\'t\b/,
    /\bare not\b/,
    /\bwithout\b/
  ];
  return forbidden.some((re) => re.test(t));
}

export function validatePuzzleQuality(puz) {
  // 1) classes unique
  const uniq = new Set(puz.classes);
  if (uniq.size !== 6) return { ok: false, reason: "Classes must be unique (6 different classes)." };

  // 2) creative max 1
  const creativeCount = puz.classes.filter((c) => c === "creative_cognitive").length;
  if (creativeCount > 1) return { ok: false, reason: "Max 1 creative_cognitive class." };

  // 3) at least 2 anchors among ontological/functional/contextual
  const anchorCount = puz.classes.filter((c) => ANCHOR_CLASSES.has(c)).length;
  if (anchorCount < 2) return { ok: false, reason: "Must include at least 2 anchor classes (ontological/functional/contextual)." };

  // 4) No negations in clues (your rule)
  for (const clue of puz.clues) {
    if (hasForbiddenNegation(clue)) return { ok: false, reason: `Forbidden negation found in clue: "${clue}"` };
  }

  // 5) Clue variety (avoid duplicates)
  const normClues = puz.clues.map((c) => normalizeWord(c));
  if (new Set(normClues).size !== normClues.length) return { ok: false, reason: "Duplicate clues detected." };

  // 6) Answer should not appear verbatim in clues (too easy)
  const ans = normalizeWord(puz.answer);
  for (const clue of normClues) {
    if (clue.includes(ans)) return { ok: false, reason: "Answer appears inside a clue." };
  }

  // 7) accepted list should include answer
  const accepted = new Set([ans, ...puz.accepted.map(normalizeWord)]);
  if (!accepted.has(ans)) return { ok: false, reason: "Accepted list must include the answer." };

  return { ok: true };
}
