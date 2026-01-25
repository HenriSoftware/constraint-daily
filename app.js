const MAX_ATTEMPTS = 6;

const elDate = document.getElementById("date");
const elStreak = document.getElementById("streak");
const elClues = document.getElementById("clues");
const elForm = document.getElementById("guessForm");
const elInput = document.getElementById("guessInput");
const elAttempts = document.getElementById("attempts");
const elMsg = document.getElementById("msg");
const elHistory = document.getElementById("history");
const endCard = document.getElementById("endCard");
const endTitle = document.getElementById("endTitle");
const endText = document.getElementById("endText");
const elExplanation = document.getElementById("explanation");
const shareBtn = document.getElementById("shareBtn");

function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function storageKey(date) {
  return `constraint:${date}`;
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

function renderHistory(items) {
  elHistory.innerHTML = "";
  for (const it of items) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${it}</span><span>${it.ok ? "✅" : "❌"}</span>`;
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

(async function init() {
  const res = await fetch("daily/latest.json", { cache: "no-store" });
  const puzzle = await res.json();

  const date = puzzle.date;
  elDate.textContent = date;

  // render clues
  elClues.innerHTML = "";
  puzzle.clues.forEach((c) => {
    const li = document.createElement("li");
    li.textContent = c;
    elClues.appendChild(li);
  });

  // state per day
  const key = storageKey(date);
  const saved = JSON.parse(localStorage.getItem(key) || "null") || {
    attempts: 0,
    done: false,
    win: false,
    history: []
  };

  const accepted = new Set([norm(puzzle.answer), ...(puzzle.accepted || []).map(norm)]);
  const answerNorm = norm(puzzle.answer);

  function updateUI() {
    elAttempts.textContent = `Attempts: ${saved.attempts}/${MAX_ATTEMPTS}`;
    renderHistory(saved.history.map((h) => ({ ...h, ok: h.ok })));
    elInput.disabled = saved.done;
    document.getElementById("guessBtn").disabled = saved.done;
    if (saved.done) {
      const grid = saved.history.map((h) => (h.ok ? "🟩" : "🟥")).join("");
      const shareText = `Constraint ${date}\n${grid}\nAttempts: ${saved.attempts}/${MAX_ATTEMPTS}`;
      setEndState(saved.win, puzzle.answer, puzzle.explanation, shareText);
    }
  }

  // streak logic: simple daily streak based on last completed day
  const lastCompleted = localStorage.getItem("constraint:last_completed");
  const streak = getStreak();
  elStreak.textContent = `Streak: ${streak}`;

  updateUI();

  elForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (saved.done) return;

    const guess = norm(elInput.value);
    elInput.value = "";
    if (!guess) return;

    if (saved.history.some((h) => h.g === guess)) {
      setMsg("You already tried that.", "bad");
      return;
    }

    const ok = accepted.has(guess);
    saved.attempts += 1;
    saved.history.push({ g: guess, ok });
    setMsg(ok ? "Correct!" : "Nope.", ok ? "good" : "bad");

    if (ok) {
      saved.done = true;
      saved.win = true;

      // update streak
      // streak increments if last_completed == yesterday, else reset to 1
      const today = new Date(date + "T00:00:00Z");
      const y = new Date(today);
      y.setUTCDate(y.getUTCDate() - 1);
      const yesterday = y.toISOString().slice(0, 10);

      if (lastCompleted === yesterday) setStreak(streak + 1);
      else setStreak(1);

      localStorage.setItem("constraint:last_completed", date);
    } else if (saved.attempts >= MAX_ATTEMPTS) {
      saved.done = true;
      saved.win = false;
      setStreak(0);
      localStorage.setItem("constraint:last_completed", date);
    }

    localStorage.setItem(key, JSON.stringify(saved));
    updateUI();
  });
})();
