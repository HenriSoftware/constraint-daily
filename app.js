const MAX_ATTEMPTS = 6;

const elDate = document.getElementById("date");
const elStreak = document.getElementById("streak");
const elClues = document.getElementById("clues");
const elForm = document.getElementById("guessForm");
const elInput = document.getElementById("guessInput");
const elAttempts = document.getElementById("attempts");
const elRevealInfo = document.getElementById("revealInfo");
const elMsg = document.getElementById("msg");
const elHistory = document.getElementById("history");
const endCard = document.getElementById("endCard");
const endTitle = document.getElementById("endTitle");
const endText = document.getElementById("endText");
const elExplanation = document.getElementById("explanation");
const shareBtn = document.getElementById("shareBtn");
const revealAllBtn = document.getElementById("revealAllBtn");

// Modals
const howModal = document.getElementById("howModal");
const statsModal = document.getElementById("statsModal");
const howBtn = document.getElementById("howBtn");
const howLink = document.getElementById("howLink");
const howClose = document.getElementById("howClose");
const howOk = document.getElementById("howOk");
const statsBtn = document.getElementById("statsBtn");
const statsClose = document.getElementById("statsClose");
const statsOk = document.getElementById("statsOk");

// Stats fields
const statStreak = document.getElementById("statStreak");
const statPlayed = document.getElementById("statPlayed");
const statWins = document.getElementById("statWins");
const statWinrate = document.getElementById("statWinrate");

function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function storageKey(date) {
  return `constraint:${date}`;
}

// Global stats
const STATS_KEY = "constraint:stats";
function loadStats() {
  return JSON.parse(localStorage.getItem(STATS_KEY) || "null") || {
    played: 0,
    wins: 0
  };
}
function saveStats(s) {
  localStorage.setItem(STATS_KEY, JSON.stringify(s));
}
function getStreak() {
  return Number(localStorage.getItem("constraint:streak") || "0");
}
function setStreak(n) {
  localStorage.setItem("constraint:streak", String(n));
  elStreak.textContent = `Streak: ${n}`;
}
function setMsg(text, type = "") {
  elMsg.textContent = text;
  elMsg.className = "msg" + (type ? ` ${type}` : "");
}

function openModal(el) {
  el.classList.remove("hidden");
}
function closeModal(el) {
  el.classList.add("hidden");
}

function updateStatsModal() {
  const s = loadStats();
  const streak = getStreak();
  const played = s.played || 0;
  const wins = s.wins || 0;
  const winrate = played > 0 ? Math.round((wins / played) * 100) : 0;

  statStreak.textContent = String(streak);
  statPlayed.textContent = String(played);
  statWins.textContent = String(wins);
  statWinrate.textContent = `${winrate}%`;
}

// Human-friendly class labels
function classLabel(cls) {
  const map = {
    ontological: "Ontological",
    functional: "Functional",
    contextual: "Contextual",
    structural: "Structural",
    temporal: "Temporal",
    human_interaction: "Human",
    quantitative: "Quantitative",
    dependency: "Dependency",
    limitation: "Limitation",
    representational: "Representation",
    social_collective: "Social",
    creative_cognitive: "Creative"
  };
  return map[cls] || cls;
}

/**
 * Reveal logic (your new concept):
 * - Start with 1 clue visible.
 * - Each wrong attempt reveals 1 more clue.
 * - Solving ends game.
 * - Max 6 attempts.
 */
function computeRevealedCount(attempts, revealAllFlag, done) {
  if (revealAllFlag || done) return 6;
  // Start with 1 clue.
  // After 1 wrong attempt -> 2 clues, etc.
  // attempts here counts total submitted attempts (wrong + correct)
  // But we only want wrong attempts to reveal clues.
  // We'll store wrongAttempts separately for precision.
  return 1; // default, overwritten by wrongAttempts in state
}

function renderClues(puzzle, revealedCount) {
  elClues.innerHTML = "";

  for (let i = 0; i < 6; i++) {
    const li = document.createElement("li");

    const row = document.createElement("div");
    row.className = "clueRow" + (i < revealedCount ? "" : " locked");

    const text = document.createElement("div");
    text.className = "clueText";
    text.textContent = i < revealedCount ? puzzle.clues[i] : "Locked clue";

    const badge = document.createElement("span");
    badge.className = "clueClass";
    badge.textContent = classLabel(puzzle.classes[i]);

    row.appendChild(text);
    row.appendChild(badge);
    li.appendChild(row);

    elClues.appendChild(li);
  }
}

function renderHistory(history) {
  elHistory.innerHTML = "";
  for (const h of history) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${h.g}</span><span>${h.ok ? "✅" : "❌"}</span>`;
    elHistory.appendChild(li);
  }
}

function setEndState(win, answer, explanation, shareText) {
  endCard.classList.remove("hidden");
  endTitle.textContent = win ? "Solved ✅" : "Out of attempts";
  endText.textContent = win
    ? "Come back tomorrow for a new puzzle."
    : `Answer: ${answer}`;

  elExplanation.textContent = explanation || "";

  shareBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setMsg("Copied share text to clipboard.", "good");
    } catch {
      setMsg("Could not copy. Select and copy manually.", "bad");
      alert(shareText);
    }
  };
}

function yyyyMmDdUTC(dateStr) {
  // expects YYYY-MM-DD
  return new Date(dateStr + "T00:00:00Z");
}

(async function init() {
  // Modal wiring
  howBtn.addEventListener("click", () => openModal(howModal));
  howLink.addEventListener("click", (e) => { e.preventDefault(); openModal(howModal); });
  howClose.addEventListener("click", () => closeModal(howModal));
  howOk.addEventListener("click", () => closeModal(howModal));

  statsBtn.addEventListener("click", () => { updateStatsModal(); openModal(statsModal); });
  statsClose.addEventListener("click", () => closeModal(statsModal));
  statsOk.addEventListener("click", () => closeModal(statsModal));

  howModal.addEventListener("click", (e) => { if (e.target === howModal) closeModal(howModal); });
  statsModal.addEventListener("click", (e) => { if (e.target === statsModal) closeModal(statsModal); });

  // Load puzzle
  const res = await fetch("daily/latest.json", { cache: "no-store" });
  const puzzle = await res.json();

  const date = puzzle.date;
  elDate.textContent = date;

  const accepted = new Set([norm(puzzle.answer), ...(puzzle.accepted || []).map(norm)]);
  const lastCompleted = localStorage.getItem("constraint:last_completed");

  // Daily state
  const key = storageKey(date);
  const saved = JSON.parse(localStorage.getItem(key) || "null") || {
    attempts: 0,
    wrongAttempts: 0,
    done: false,
    win: false,
    history: [],
    revealAll: false
  };

  // On first ever view of the day, count "played" once (only if not already stored)
  // Prevent double-counting if user reloads.
  if (!saved._countedPlayed) {
    const s = loadStats();
    s.played = (s.played || 0) + 1;
    saveStats(s);
    saved._countedPlayed = true;
    localStorage.setItem(key, JSON.stringify(saved));
  }

  // Reveal computation: 1 + wrongAttempts (cap 6)
  function revealedCount() {
    if (saved.revealAll || saved.done) return 6;
    return Math.min(6, 1 + (saved.wrongAttempts || 0));
  }

  function updateUI() {
    const r = revealedCount();
    elRevealInfo.textContent = `Revealed: ${r}/6`;
    elAttempts.textContent = `Attempts: ${saved.attempts}/${MAX_ATTEMPTS}`;

    renderClues(puzzle, r);
    renderHistory(saved.history);

    elInput.disabled = saved.done;
    document.getElementById("guessBtn").disabled = saved.done;

    if (saved.done) {
      const grid = saved.history.map((h) => (h.ok ? "🟩" : "🟥")).join("");
      const shareText = `Constraint ${date}\n${grid}\nAttempts: ${saved.attempts}/${MAX_ATTEMPTS}`;
      setEndState(saved.win, puzzle.answer, puzzle.explanation, shareText);
    }
  }

  // Streak display
  elStreak.textContent = `Streak: ${getStreak()}`;

  // Reveal-all button
  revealAllBtn.onclick = () => {
    saved.revealAll = true;
    localStorage.setItem(key, JSON.stringify(saved));
    updateUI();
  };

  updateUI();

  // If first time ever, show how-to-play
  const seenHow = localStorage.getItem("constraint:seen_how");
  if (!seenHow) {
    localStorage.setItem("constraint:seen_how", "1");
    openModal(howModal);
  }

  elForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (saved.done) return;

    const guessRaw = elInput.value;
    const guess = norm(guessRaw);
    elInput.value = "";

    if (!guess) return;

    if (saved.history.some((h) => h.g === guess)) {
      setMsg("You already tried that.", "bad");
      return;
    }

    const ok = accepted.has(guess);
    saved.attempts += 1;
    saved.history.push({ g: guess, ok });

    if (ok) {
      setMsg("Correct!", "good");
      saved.done = true;
      saved.win = true;

      // wins + streak
      const s = loadStats();
      s.wins = (s.wins || 0) + 1;
      saveStats(s);

      // streak increments if last_completed == yesterday, else reset to 1
      const today = yyyyMmDdUTC(date);
      const y = new Date(today);
      y.setUTCDate(y.getUTCDate() - 1);
      const yesterday = y.toISOString().slice(0, 10);

      const currentStreak = getStreak();
      if (lastCompleted === yesterday) setStreak(currentStreak + 1);
      else setStreak(1);

      localStorage.setItem("constraint:last_completed", date);
    } else {
      setMsg("Nope.", "bad");
      saved.wrongAttempts = (saved.wrongAttempts || 0) + 1;

      if (saved.attempts >= MAX_ATTEMPTS) {
        saved.done = true;
        saved.win = false;
        setStreak(0);
        localStorage.setItem("constraint:last_completed", date);
      }
    }

    localStorage.setItem(key, JSON.stringify(saved));
    updateUI();
  });
})();
