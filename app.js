/* =========================================================
   Constraint — App v100
   Robust daily logic game:
   - fetch daily/latest.json (no-store)
   - reveal 1 clue initially, +1 per wrong guess
   - modals with hard close paths (click outside, ESC, touch)
   - local stats + streak
   - countdown to next puzzle (UTC)
   - cache-bust via index.html query string
   ========================================================= */

(() => {
  "use strict";

  /* -------------------------
     Constants + config
     ------------------------- */

  const MAX_ATTEMPTS = 6;
  const CLUE_COUNT = 6;
  const APP_STATE_VERSION = 100;

  // Storage keys (global)
  const KEY_STATS = "constraint:stats";
  const KEY_STREAK = "constraint:streak";
  const KEY_LAST_COMPLETED = "constraint:last_completed";
  const KEY_SEEN_HOW = "constraint:seen_how";

  // Per-day key prefix
  const dayKey = (dateStr) => `constraint:${dateStr}`;

  /* -------------------------
     DOM refs
     ------------------------- */

  const $ = (id) => document.getElementById(id);

  const pillDate = $("pillDate");
  const pillCountdown = $("pillCountdown");
  const pillStreak = $("pillStreak");

  const topDate = $("topDate");
  const chipRevealed = $("chipRevealed");
  const chipAttempts = $("chipAttempts");
  const microStatus = $("microStatus");

  const clueList = $("clueList");

  const btnHow = $("btnHow");
  const btnStats = $("btnStats");
  const linkHow = $("linkHow");

  const btnRevealAll = $("btnRevealAll");

  const guessForm = $("guessForm");
  const guessInput = $("guessInput");
  const btnGuess = $("btnGuess");

  const statusMsg = $("statusMsg");
  const statusHint = $("statusHint");
  const guessHistory = $("guessHistory");

  const endCard = $("endCard");
  const endTitle = $("endTitle");
  const endText = $("endText");
  const explanationEl = $("explanation");

  const btnShare = $("btnShare");
  const btnCopyAnswer = $("btnCopyAnswer");

  const btnResetToday = $("btnResetToday");

  // Modals
  const backdrop = $("backdrop");
  const modalHow = $("modalHow");
  const modalStats = $("modalStats");
  const closeHow = $("closeHow");
  const okHow = $("okHow");
  const closeStats = $("closeStats");
  const okStats = $("okStats");

  // Stats modal fields
  const statStreak = $("statStreak");
  const statPlayed = $("statPlayed");
  const statWins = $("statWins");
  const statWinRate = $("statWinRate");

  // Toast
  const toastHost = $("toastHost");

  /* -------------------------
     Helpers
     ------------------------- */

  const now = () => new Date();

  function norm(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function safeJsonParse(s, fallback) {
    try {
      const v = JSON.parse(s);
      return v ?? fallback;
    } catch {
      return fallback;
    }
  }

  function setText(el, text) {
    if (el) el.textContent = text;
  }

  function pad2(n) {
    const x = Number(n) || 0;
    return x < 10 ? `0${x}` : `${x}`;
  }

  // UTC date string: YYYY-MM-DD
  function utcDateString(d) {
    const y = d.getUTCFullYear();
    const m = pad2(d.getUTCMonth() + 1);
    const day = pad2(d.getUTCDate());
    return `${y}-${m}-${day}`;
  }

  // Parse YYYY-MM-DD into UTC Date (midnight)
  function parseUtcMidnight(dateStr) {
    return new Date(`${dateStr}T00:00:00Z`);
  }

  function secondsUntilNextUtcMidnight() {
    const d = now();
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0));
    return Math.max(0, Math.floor((next.getTime() - d.getTime()) / 1000));
  }

  function formatHMS(totalSeconds) {
    const s = Math.max(0, totalSeconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${pad2(m)}m`;
    return `${m}m ${pad2(sec)}s`;
  }

  function toast(message, kind = "info", ms = 2200) {
    const wrap = document.createElement("div");
    wrap.className = "toast";

    const text = document.createElement("div");
    text.className = "toastText";
    text.textContent = message;

    const btn = document.createElement("button");
    btn.className = "toastClose";
    btn.type = "button";
    btn.setAttribute("aria-label", "Close toast");
    btn.textContent = "✕";

    btn.addEventListener("click", () => wrap.remove());
    wrap.appendChild(text);
    wrap.appendChild(btn);

    toastHost.appendChild(wrap);

    if (kind === "good") text.style.color = "var(--good)";
    if (kind === "bad") text.style.color = "var(--bad)";
    if (kind === "warn") text.style.color = "var(--warn)";

    setTimeout(() => {
      if (wrap.isConnected) wrap.remove();
    }, ms);
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied to clipboard.", "good");
      return true;
    } catch {
      // fallback: prompt
      try {
        window.prompt("Copy this:", text);
        return true;
      } catch {
        toast("Could not copy.", "bad");
        return false;
      }
    }
  }

  function isDebug() {
    return new URLSearchParams(location.search).get("debug") === "1";
  }

  /* -------------------------
     Storage: stats + streak
     ------------------------- */

  function loadStats() {
    const s = safeJsonParse(localStorage.getItem(KEY_STATS), { played: 0, wins: 0, version: APP_STATE_VERSION });
    if (!s || typeof s !== "object") return { played: 0, wins: 0, version: APP_STATE_VERSION };
    if (!Number.isFinite(s.played)) s.played = 0;
    if (!Number.isFinite(s.wins)) s.wins = 0;
    s.version = APP_STATE_VERSION;
    return s;
  }

  function saveStats(s) {
    localStorage.setItem(KEY_STATS, JSON.stringify(s));
  }

  function getStreak() {
    const n = Number(localStorage.getItem(KEY_STREAK) || "0");
    return Number.isFinite(n) ? n : 0;
  }

  function setStreak(n) {
    const v = Math.max(0, Number(n) || 0);
    localStorage.setItem(KEY_STREAK, String(v));
    setText(pillStreak, `Streak: ${v}`);
  }

  function getLastCompleted() {
    return localStorage.getItem(KEY_LAST_COMPLETED) || "";
  }

  function setLastCompleted(dateStr) {
    localStorage.setItem(KEY_LAST_COMPLETED, dateStr);
  }

  /* -------------------------
     Modal system (robust)
     ------------------------- */

  let activeModal = null;
  let lastFocused = null;

  function showBackdrop() {
    backdrop.classList.remove("hidden");
    backdrop.setAttribute("aria-hidden", "false");
    document.body.classList.add("modalOpen");
  }

  function hideBackdrop() {
    backdrop.classList.add("hidden");
    backdrop.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modalOpen");
  }

  function closeModal() {
    if (!activeModal) return;

    activeModal.classList.add("hidden");
    activeModal = null;

    hideBackdrop();

    // restore focus safely
    if (lastFocused && typeof lastFocused.focus === "function") {
      try { lastFocused.focus(); } catch {}
    }
    lastFocused = null;
  }

  function openModal(modalEl) {
    // ensure single modal
    closeModal();

    lastFocused = document.activeElement;
    activeModal = modalEl;

    showBackdrop();
    modalEl.classList.remove("hidden");

    // focus first focusable element inside modal
    const focusable = modalEl.querySelector("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
    if (focusable && typeof focusable.focus === "function") {
      try { focusable.focus(); } catch {}
    }
  }

  // Close actions: click outside via backdrop, ESC, pointer/touch
  function wireModalClose() {
    // backdrop closes
    const closeAny = () => closeModal();

    backdrop.addEventListener("click", closeAny);
    backdrop.addEventListener("pointerdown", closeAny);
    backdrop.addEventListener("touchstart", closeAny, { passive: true });

    // click outside modal card closes (on modal container)
    [modalHow, modalStats].forEach((m) => {
      m.addEventListener("click", (e) => {
        if (e.target === m) closeAny();
      });
      m.addEventListener("pointerdown", (e) => {
        if (e.target === m) closeAny();
      });
      m.addEventListener("touchstart", (e) => {
        if (e.target === m) closeAny();
      }, { passive: true });
    });

    // ESC closes
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAny();

      // focus trap basic (Tab stays inside modal)
      if (e.key === "Tab" && activeModal) {
        const focusables = activeModal.querySelectorAll(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
        );
        const list = Array.from(focusables).filter(el => !el.hasAttribute("disabled"));
        if (list.length === 0) return;

        const first = list[0];
        const last = list[list.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    // explicit close buttons (use pointerdown to be more reliable on mobile)
    [closeHow, okHow, closeStats, okStats].forEach((btn) => {
      btn.addEventListener("click", closeAny);
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        closeAny();
      });
      btn.addEventListener("touchstart", () => closeAny(), { passive: true });
    });
  }

  /* -------------------------
     Rendering
     ------------------------- */

  function setStatus(text, kind = "") {
    statusMsg.textContent = text;
    statusMsg.className = "statusMsg" + (kind ? ` ${kind}` : "");
  }

  function setHint(text) {
    statusHint.textContent = text || "";
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
    return map[cls] || (cls ? String(cls) : "Class");
  }

  function renderClues(puzzle, revealedCount) {
    clueList.innerHTML = "";

    for (let i = 0; i < CLUE_COUNT; i++) {
      const li = document.createElement("li");
      li.className = "clueItem";

      const row = document.createElement("div");
      row.className = "clueRow" + (i < revealedCount ? "" : " clueLocked");

      const text = document.createElement("div");
      text.className = "clueText";
      text.textContent = i < revealedCount ? puzzle.clues[i] : "Locked clue";

      const badge = document.createElement("span");
      badge.className = "clueBadge";
      badge.textContent = classLabel(puzzle.classes[i]);

      row.appendChild(text);
      row.appendChild(badge);
      li.appendChild(row);
      clueList.appendChild(li);
    }
  }

  function renderHistory(state) {
    guessHistory.innerHTML = "";

    for (let i = 0; i < state.history.length; i++) {
      const h = state.history[i];

      const li = document.createElement("li");
      li.className = "historyItem";

      const left = document.createElement("div");
      left.className = "historyLeft";

      const guess = document.createElement("div");
      guess.className = "historyGuess";
      guess.textContent = h.g;

      const meta = document.createElement("div");
      meta.className = "historyMeta";
      meta.textContent = `Attempt ${i + 1}`;

      left.appendChild(guess);
      left.appendChild(meta);

      const right = document.createElement("div");
      const ok = !!h.ok;
      right.className = "historyRight " + (ok ? "good" : "bad");
      right.textContent = ok ? "✅" : "❌";

      li.appendChild(left);
      li.appendChild(right);
      guessHistory.appendChild(li);
    }
  }

  function revealedCountFromState(state) {
    if (state.revealAll || state.done) return CLUE_COUNT;
    return Math.min(CLUE_COUNT, 1 + (state.wrongAttempts || 0));
  }

  function setEndCardVisible(puzzle, state) {
    if (!state.done) {
      endCard.classList.add("hidden");
      return;
    }

    endCard.classList.remove("hidden");

    const win = !!state.win;
    endTitle.textContent = win ? "Solved ✅" : "Out of attempts";
    endText.textContent = win
      ? "Come back tomorrow for a new puzzle."
      : `Answer: ${puzzle.answer}`;

    explanationEl.textContent = puzzle.explanation || "";
  }

  function updateChips(state) {
    const r = revealedCountFromState(state);
    chipRevealed.textContent = `Revealed: ${r}/6`;
    chipAttempts.textContent = `Attempts: ${state.attempts}/${MAX_ATTEMPTS}`;
  }

  function updatePills(dateStr) {
    pillDate.textContent = dateStr;
    pillStreak.textContent = `Streak: ${getStreak()}`;
  }

  function updateCountdown() {
    const sec = secondsUntilNextUtcMidnight();
    pillCountdown.textContent = `Next: ${formatHMS(sec)}`;
  }

  /* -------------------------
     State management
     ------------------------- */

  function defaultDayState() {
    return {
      version: APP_STATE_VERSION,
      attempts: 0,
      wrongAttempts: 0,
      done: false,
      win: false,
      revealAll: false,
      history: [],
      countedPlayed: false,
    };
  }

  function migrateDayState(s) {
    const st = s && typeof s === "object" ? s : defaultDayState();

    // normalize
    st.version = APP_STATE_VERSION;
    st.attempts = Number(st.attempts || 0);
    st.wrongAttempts = Number(st.wrongAttempts || 0);
    st.done = !!st.done;
    st.win = !!st.win;
    st.revealAll = !!st.revealAll;
    st.countedPlayed = !!st.countedPlayed;
    st.history = Array.isArray(st.history) ? st.history : [];

    // Ensure attempts matches history length if needed
    if (st.history.length > st.attempts) st.attempts = st.history.length;

    // If wrongAttempts missing, estimate from history
    if (!Number.isFinite(st.wrongAttempts) || st.wrongAttempts < 0) {
      st.wrongAttempts = st.history.filter((x) => !x.ok).length;
    }

    // cap values
    st.attempts = Math.min(MAX_ATTEMPTS, Math.max(0, st.attempts));
    st.wrongAttempts = Math.min(CLUE_COUNT, Math.max(0, st.wrongAttempts));

    return st;
  }

  function loadDayState(dateStr) {
    const raw = localStorage.getItem(dayKey(dateStr));
    const parsed = safeJsonParse(raw, null);
    return migrateDayState(parsed);
  }

  function saveDayState(dateStr, state) {
    localStorage.setItem(dayKey(dateStr), JSON.stringify(state));
  }

  /* -------------------------
     Game logic
     ------------------------- */

  function buildAcceptedSet(puzzle) {
    const set = new Set();
    set.add(norm(puzzle.answer));
    if (Array.isArray(puzzle.accepted)) {
      for (const a of puzzle.accepted) set.add(norm(a));
    }
    return set;
  }

  function computeYesterday(dateStr) {
    const d = parseUtcMidnight(dateStr);
    d.setUTCDate(d.getUTCDate() - 1);
    return utcDateString(d);
  }

  function updateStatsModal() {
    const s = loadStats();
    const streak = getStreak();
    const played = s.played || 0;
    const wins = s.wins || 0;
    const rate = played > 0 ? Math.round((wins / played) * 100) : 0;

    statStreak.textContent = String(streak);
    statPlayed.textContent = String(played);
    statWins.textContent = String(wins);
    statWinRate.textContent = `${rate}%`;
  }

  function shareText(puzzle, state) {
    const squares = state.history.map(h => (h.ok ? "🟩" : "🟥")).join("");
    return `Constraint ${puzzle.date}\n${squares}\nAttempts: ${state.attempts}/${MAX_ATTEMPTS}`;
  }

  /* -------------------------
     Boot
     ------------------------- */

  async function fetchLatestPuzzle() {
    const res = await fetch("daily/latest.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load puzzle: ${res.status}`);
    const puzzle = await res.json();

    // Minimal validation
    if (!puzzle || typeof puzzle !== "object") throw new Error("Puzzle JSON invalid.");
    if (!puzzle.date) throw new Error("Puzzle missing date.");
    if (!puzzle.answer) throw new Error("Puzzle missing answer.");
    if (!Array.isArray(puzzle.clues) || puzzle.clues.length < 6) throw new Error("Puzzle missing clues.");
    if (!Array.isArray(puzzle.classes) || puzzle.classes.length < 6) throw new Error("Puzzle missing classes.");

    // normalize arrays to length 6
    puzzle.clues = puzzle.clues.slice(0, 6);
    puzzle.classes = puzzle.classes.slice(0, 6);

    return puzzle;
  }

  async function main() {
    // Wire modal close system once
    wireModalClose();

    // Make sure nothing is “stuck open” on load
    closeModal();

    // Debug tools visibility
    if (isDebug()) btnResetToday.classList.remove("hidden");

    // Countdown timer
    updateCountdown();
    setInterval(updateCountdown, 1000);

    let puzzle;
    try {
      puzzle = await fetchLatestPuzzle();
    } catch (e) {
      setStatus("Failed to load today's puzzle.", "bad");
      setHint("Check your network or try again.");
      toast(String(e && e.message ? e.message : e), "bad", 4000);
      return;
    }

    // Header + top
    updatePills(puzzle.date);
    setText(topDate, puzzle.date);
    setText(pillDate, puzzle.date);

    // Load state
    let state = loadDayState(puzzle.date);

    // Count "played" once per day state
    if (!state.countedPlayed) {
      const s = loadStats();
      s.played = (s.played || 0) + 1;
      saveStats(s);
      state.countedPlayed = true;
      saveDayState(puzzle.date, state);
    }

    // Build accepted guesses
    const accepted = buildAcceptedSet(puzzle);

    // Render initial
    updateChips(state);
    renderClues(puzzle, revealedCountFromState(state));
    renderHistory(state);
    setEndCardVisible(puzzle, state);

    // Input lock
    const syncInputLock = () => {
      const locked = !!state.done;
      guessInput.disabled = locked;
      btnGuess.disabled = locked;
    };
    syncInputLock();

    // Initial message
    if (state.done) {
      setStatus(state.win ? "Already solved for today." : "Already finished for today.", "");
      setHint("Come back tomorrow for a new puzzle.");
    } else {
      setStatus("Make a guess.", "");
      setHint("");
    }

    // Reveal all button
    btnRevealAll.addEventListener("click", () => {
      state.revealAll = true;
      saveDayState(puzzle.date, state);
      renderClues(puzzle, revealedCountFromState(state));
      updateChips(state);
      toast("All clues revealed.", "warn");
    });

    // Share / copy answer
    btnShare.addEventListener("click", () => {
      copyToClipboard(shareText(puzzle, state));
    });

    btnCopyAnswer.addEventListener("click", () => {
      copyToClipboard(puzzle.answer);
    });

    // How to play
    const openHow = () => openModal(modalHow);
    btnHow.addEventListener("click", openHow);
    linkHow.addEventListener("click", (e) => { e.preventDefault(); openHow(); });

    // Stats
    const openStats = () => {
      updateStatsModal();
      openModal(modalStats);
    };
    btnStats.addEventListener("click", openStats);

    // Show how-to-play only once (never stats)
    if (!localStorage.getItem(KEY_SEEN_HOW)) {
      localStorage.setItem(KEY_SEEN_HOW, "1");
      openHow();
    }

    // Debug reset today (only when ?debug=1)
    btnResetToday.addEventListener("click", () => {
      localStorage.removeItem(dayKey(puzzle.date));
      toast("Reset today state. Reloading…", "warn", 1200);
      setTimeout(() => location.reload(), 600);
    });

    // Guess submit
    guessForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (state.done) return;

      const raw = guessInput.value;
      const g = norm(raw);
      guessInput.value = "";

      if (!g) return;

      // duplicate guard
      if (state.history.some(x => x.g === g)) {
        setStatus("You already tried that.", "bad");
        setHint("Try a different word or phrase.");
        return;
      }

      const ok = accepted.has(g);

      state.attempts += 1;
      state.history.push({ g, ok });

      if (!ok) state.wrongAttempts += 1;

      // cap
      state.attempts = Math.min(MAX_ATTEMPTS, state.attempts);
      state.wrongAttempts = Math.min(CLUE_COUNT, state.wrongAttempts);

      // update reveal
      updateChips(state);
      renderClues(puzzle, revealedCountFromState(state));
      renderHistory(state);

      if (ok) {
        state.done = true;
        state.win = true;

        // stats win
        const s = loadStats();
        s.wins = (s.wins || 0) + 1;
        saveStats(s);

        // streak logic
        const last = getLastCompleted();
        const yesterday = computeYesterday(puzzle.date);
        const current = getStreak();

        if (last === yesterday) setStreak(current + 1);
        else setStreak(1);

        setLastCompleted(puzzle.date);

        saveDayState(puzzle.date, state);

        setStatus("Correct!", "good");
        setHint("Nice. See you tomorrow.");

        setEndCardVisible(puzzle, state);
        syncInputLock();
        toast("Solved.", "good");

        return;
      }

      // not ok
      saveDayState(puzzle.date, state);

      const r = revealedCountFromState(state);
      setStatus("Nope.", "bad");

      if (state.attempts >= MAX_ATTEMPTS) {
        // fail
        state.done = true;
        state.win = false;

        // streak reset
        setStreak(0);
        setLastCompleted(puzzle.date);

        saveDayState(puzzle.date, state);

        setHint(`Answer: ${puzzle.answer}`);
        setEndCardVisible(puzzle, state);
        syncInputLock();
        toast("Out of attempts.", "bad", 2600);
        return;
      }

      // still playing
      setHint(`Revealed ${r}/6 clues.`);
    });
  }

  // Run
  main();
})();
