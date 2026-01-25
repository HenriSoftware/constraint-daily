const MAX_ATTEMPTS = 6;

// UI refs
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

const STATE_VERSION = 3; // bump when changing saved-state structure

function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function storageKey(date) {
  return `constraint:${date}`;
}

// Stats storage
const STATS_KEY = "constraint:stats";
function loadStats() {
  return JSON.parse(localStorage.getItem(STATS_KEY) || "null") || { played: 0, wins: 0 };
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

// Modal helpers (exclusive + guaranteed close)
function openModal(el) { el.classList.remove("hidden"); }
function closeModal(el) { el.classList.add("hidden"); }

function closeAllModals() {
  closeModal(howModal);
  closeModal(statsModal);
  document.body.classList.remove("modalOpen");
}
function openExclusive(modalEl) {
  closeAllModals();
  openModal(modalEl);
  document.body.classList.add("modalOpen");
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
    creative_cognitive: "Creative",
  };
  return map[cls] || cls;
}

function revealedCount(saved) {
  if (saved.revealAll || saved.done) return 6;
  return Math.min(6, 1 + (saved.wrongAttempts || 0));
}

function renderClues(puzzle, count) {
  elClues.innerHTML = "";

  for (let i = 0; i < 6; i++) {
    const li = document.createElement("li");

    const row = document.createElement("div");
    row.className = "clueRow" + (i < count ? "" : " locked");

    const text = document.createElement("div");
    text.className = "clueText";
    text.textContent = i < count ? puzzle.clues[i] : "Locked clue";

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
  endText.textContent = win ? "Come back tomorrow for a new puzzle." : `Answer: ${answer}`;
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
  return new Date(dateStr + "T00:00:00Z");
}

(async function init() {
  // 🔧 HARD RESET: prevent “stuck modal” from restored DOM state (mobile/Safari quirks)
  closeAllModals();

  // Modal wiring (exclusive, safe)
  howBtn.addEventListener("click", () => openExclusive(howModal));
  howLink.addEventListener("click", (e) => { e.preventDefault(); openExclusive(howModal); });
  statsBtn.addEventListener("click", () => { updateStatsModal(); openExclusive(statsModal); });

  howClose.addEventListener("click", closeAllModals);
  howOk.addEventListener("click", closeAllModals);
  statsClose.addEventListener("click", closeAllModals);
  statsOk.addEventListener("click", closeAllModals);

  howModal.addEventListener("click", (e) => { if (e.target === howModal) closeAllModals(); });
  statsModal.addEventListener("click", (e) => { if (e.target === statsModal) closeAllModals(); });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllModals();
  });

  // Load puzzle
  const res = await fetch("daily/latest.json", { cache: "no-store" });
  const puzzle = await res.json();

  const date = puzzle.date;
  elDate.textContent = date;

  const accepted = new Set([norm(puzzle.answer), ...(puzzle.accepted || []).map(norm)]);
  const lastCompleted = localStorage.getItem("constraint:last_completed");

  // Load day state
  const key = storageKey(date);
  const saved = JSON.parse(localStorage.getItem(key) || "null") || {
    version: STATE_VERSION,
    attempts: 0,
    wrongAttempts: 0,
    done: false,
    win: false,
    history: [],
    revealAll: false,
    _countedPlayed: false,
  };

  // Migrate old states safely
  if (!saved.version || saved.version < STATE_VERSION) {
    const correctOffset = saved.win ? 1 : 0;
    const approxWrong = Math.max(0, (Number(saved.attempts || 0) - correctOffset));

    saved.attempts = Number(saved.attempts || 0);
    saved.history = Array.isArray(saved.history) ? saved.history : [];
    saved.done = !!saved.done;
    saved.win = !!saved.win;
    saved.revealAll = !!saved.revealAll;

    saved.wrongAttempts = Number.isFinite(saved.wrongAttempts) ? saved.wrongAttempts : approxWrong;
    saved._countedPlayed = !!saved._countedPlayed;

    saved.version = STATE_VERSION;
    localStorage.setItem(key, JSON.stringify(saved));
  }

  // Count "played" once per day
  if (!saved._countedPlayed) {
    const s = loadStats();
    s.played = (s.played || 0) + 1;
    saveStats(s);
    saved._countedPlayed = true;
    localStorage.setItem(key, JSON.stringify(saved));
  }

  function updateUI() {
    const r = revealedCount(saved);
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

  // Reveal all
  revealAllBtn.onclick = () => {
    saved.revealAll = true;
    localStorage.setItem(key, JSON.stringify(saved));
    updateUI();
  };

  updateUI();

  // Auto-open ONLY "How to play" once per browser (never Stats)
  const seenHow = localStorage.getItem("constraint:seen_how");
  if (!seenHow) {
    localStorage.setItem("constraint:seen_how", "1");
    openExclusive(howModal);
  }

  // Guess handler
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
