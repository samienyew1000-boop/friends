"use strict";

// --- Audio Synthesizer (Zero external dependencies) ---
let audioCtx = null;
let soundEnabled = true;

function initAudio() {
  if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioCtx();
    } catch (e) {
      console.warn("AudioContext error:", e);
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

function playTone(freq, type = "sine", duration = 0.1, gainVal = 0.15) {
  if (!soundEnabled || !audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}

function sfxBall() {
  playTone(380 + Math.random() * 80, "sine", 0.08, 0.12);
}

function sfxHit() {
  playTone(660, "triangle", 0.12, 0.2);
  setTimeout(() => playTone(880, "triangle", 0.15, 0.2), 70);
}

function sfxWin() {
  const notes = [523.25, 659.25, 783.99, 1046.50];
  notes.forEach((freq, idx) => {
    setTimeout(() => playTone(freq, "sine", 0.22, 0.22), idx * 80);
  });
}

function sfxBingo() {
  const notes = [440, 554, 659, 880, 1108, 1318, 1760];
  notes.forEach((freq, idx) => {
    setTimeout(() => playTone(freq, "triangle", 0.35, 0.25), idx * 90);
  });
}

// --- Configuration & Constants ---
const BET_STEPS = [1, 2, 4, 6, 8, 10, 15, 20, 25, 50, 100, 200, 400];
const DRAW_BALLS_COUNT = 30;
const MAX_EXTRA_BALLS = 10;
const STARTING_BALANCE = 10000;
const STORAGE_BAL_KEY = "bingo-star-balance";

// 12 Paytable Patterns (indices in 3 rows x 5 columns: 0..14)
// Row 0: 0,1,2,3,4 | Row 1: 5,6,7,8,9 | Row 2: 10,11,12,13,14
const PATTERNS = [
  { id: "x2", name: "Line", odd: 2, cells: [0, 1, 2, 3, 4], isLine: true },
  { id: "x3", name: "Peak", odd: 3, cells: [10, 6, 2, 8, 14] },
  { id: "x5", name: "Pyramid", odd: 5, cells: [2, 6, 7, 8, 10, 11, 12, 13, 14] },
  { id: "x10", name: "Cross", odd: 10, cells: [2, 5, 6, 7, 8, 9, 12] },
  { id: "x20", name: "Corners", odd: 20, cells: [0, 4, 10, 14] },
  { id: "x40", name: "Double T", odd: 40, cells: [0, 2, 4, 6, 7, 8, 10, 12, 14] },
  { id: "x100", name: "2 Lines", odd: 100, cells: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], isDoubleLine: true },
  { id: "x250", name: "Perimeter", odd: 250, cells: [0, 1, 2, 3, 4, 5, 9, 10, 11, 12, 13, 14] },
  { id: "x500", name: "Big X", odd: 500, cells: [0, 2, 4, 6, 8, 10, 12, 14] },
  { id: "x800", name: "1 to Go", odd: 800, cells: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] },
  { id: "bonus", name: "Bonus", odd: 0, isBonus: true, cells: [1, 3, 6, 8, 11, 13] },
  { id: "bingo", name: "BINGO", odd: 2000, isBingo: true, cells: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] }
];

// Helper to get element by ID
const $ = (id) => document.getElementById(id);

// --- Game State ---
let balance = typeof window.HabeshaWallet !== "undefined" ? window.HabeshaWallet.get() : (Number(localStorage.getItem(STORAGE_BAL_KEY)) || STARTING_BALANCE);
let betStepIdx = 3; // default bet per ticket = 6 ETB
let isTurbo = false;
let isAutoBet = false;
let isBusy = false;
let roundId = 1473481140 + Math.floor(Math.random() * 8000);

// Auto Bet Settings & State (as shown in modal)
let autoSettings = {
  rounds: 10,
  roundsLeft: 0,
  betAmount: 6,
  ticketCount: 4,
  buyExtra: false,
  turbo: false,
  lossLimit: 240,
  sessionStartBalance: 0
};

// Tickets State (4 tickets)
let tickets = [
  { id: 0, active: true, numbers: [] },
  { id: 1, active: true, numbers: [] },
  { id: 2, active: true, numbers: [] },
  { id: 3, active: true, numbers: [] }
];

let drawnBalls = [];
let ballPool = [];
let extrasDrawnCount = 0;
let roundWonAmount = 0;
let pendingBonusActive = false;
let extraBallsAvailable = false;
let currentExtraCost = 0;

// Format numbers
function fmt(num) {
  return Number(num).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(num) {
  return Math.floor(num).toLocaleString("en-US").replace(/,/g, " ");
}

function updateBalanceUI() {
  if (typeof window.HabeshaWallet !== "undefined") {
    balance = window.HabeshaWallet.get();
  }
  const balEl = $("userBalanceText");
  if (balEl) balEl.textContent = fmtInt(balance);
}

function syncBalanceSave() {
  if (typeof window.HabeshaWallet !== "undefined") {
    window.HabeshaWallet.set(balance);
  } else {
    localStorage.setItem(STORAGE_BAL_KEY, String(balance));
  }
  updateBalanceUI();
}

// Generate standard 90-ball Latin Ticket (3 rows x 5 cols)
// Column 0: 3 numbers in 1-18
// Column 1: 3 numbers in 19-36
// Column 2: 3 numbers in 37-54
// Column 3: 3 numbers in 55-72
// Column 4: 3 numbers in 73-90
function generateTicketNumbers() {
  const colRanges = [
    [1, 18],
    [19, 36],
    [37, 54],
    [55, 72],
    [73, 90]
  ];
  const cols = [];
  colRanges.forEach(([min, max]) => {
    const rangeList = [];
    for (let i = min; i <= max; i++) rangeList.push(i);
    // Shuffle and pick 3 unique numbers, then sort ascending vertically
    for (let i = rangeList.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rangeList[i], rangeList[j]] = [rangeList[j], rangeList[i]];
    }
    const picked = rangeList.slice(0, 3).sort((a, b) => a - b);
    cols.push(picked);
  });

  // Map into 15 cells (Row 0: cols[0][0], cols[1][0]... Row 1: cols[0][1]...)
  const cells = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) {
      cells.push(cols[c][r]);
    }
  }
  return cells;
}

function rollAllTickets() {
  if (isBusy) return;
  tickets.forEach(t => {
    t.numbers = generateTicketNumbers();
  });
  renderTickets();
}

function rollSingleTicket(tIdx) {
  if (isBusy) return;
  tickets[tIdx].numbers = generateTicketNumbers();
  renderTickets();
}

function toggleTicketActive(tIdx) {
  if (isBusy) return;
  // Ensure at least 1 ticket stays active
  const activeCount = tickets.filter(t => t.active).length;
  if (tickets[tIdx].active && activeCount <= 1) {
    return; // Do not turn off the only remaining ticket
  }
  tickets[tIdx].active = !tickets[tIdx].active;
  updateBetDisplays();
  renderTickets();
}

function getBetPerTicket() {
  return BET_STEPS[betStepIdx] || 6;
}

function getActiveTicketCount() {
  return tickets.filter(t => t.active).length;
}

function getTotalBet() {
  return getBetPerTicket() * getActiveTicketCount();
}

function updateBetDisplays() {
  const betPer = getBetPerTicket();
  const total = getTotalBet();
  if ($("betPerTicketDisplay")) $("betPerTicketDisplay").textContent = String(betPer);
  if ($("midTotalBet")) $("midTotalBet").textContent = String(total);
  if ($("marqueeTotalBet")) $("marqueeTotalBet").textContent = String(total);
}

// --- Render Paytable Patterns Ribbon ---
function renderPaytable() {
  const grid = $("patternsGrid");
  if (!grid) return;
  grid.innerHTML = "";

  PATTERNS.forEach(pat => {
    const chip = document.createElement("div");
    chip.className = "pattern-chip";
    chip.id = `pat-chip-${pat.id}`;

    const tag = document.createElement("span");
    tag.className = "pattern-multiplier-tag";
    tag.textContent = pat.isBonus ? "Bonus" : `x${pat.odd}`;

    const miniCard = document.createElement("div");
    miniCard.className = "pattern-mini-card";

    // 15 mini cells
    for (let i = 0; i < 15; i++) {
      const cell = document.createElement("div");
      cell.className = "pattern-mini-cell" + (pat.cells.includes(i) ? " is-target" : "");
      miniCard.appendChild(cell);
    }

    chip.appendChild(tag);
    chip.appendChild(miniCard);
    grid.appendChild(chip);
  });
}

function clearPaytableHighlights() {
  document.querySelectorAll(".pattern-chip").forEach(el => el.classList.remove("is-won"));
}

function highlightPaytablePattern(patId) {
  const el = $(`pat-chip-${patId}`);
  if (el) el.classList.add("is-won");
}

// --- Ticket Rendering & Evaluation ---
function renderTickets(justHitBall = null) {
  const container = $("ticketsContainer");
  if (!container) return;
  container.innerHTML = "";

  const hitsSet = new Set(drawnBalls);

  tickets.forEach((t, tIdx) => {
    const card = document.createElement("div");
    card.className = "ticket-card" + (t.active ? "" : " is-off");
    card.id = `ticket-card-${tIdx}`;

    // Header
    const header = document.createElement("div");
    header.className = "ticket-header";
    header.id = `ticket-header-${tIdx}`;

    const titleSpan = document.createElement("span");
    titleSpan.textContent = `TICKET ${tIdx + 1}`;
    titleSpan.id = `ticket-title-${tIdx}`;

    const actions = document.createElement("div");
    actions.className = "ticket-header-actions";

    // Refresh single ticket button
    const refreshBtn = document.createElement("button");
    refreshBtn.className = "ticket-tool-btn";
    refreshBtn.innerHTML = "&#8635;";
    refreshBtn.title = "New Numbers";
    refreshBtn.onclick = (e) => {
      e.stopPropagation();
      rollSingleTicket(tIdx);
    };

    // Toggle ticket on/off button
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "ticket-tool-btn";
    toggleBtn.innerHTML = t.active ? "&#10005;" : "&#10003;";
    toggleBtn.title = t.active ? "Turn Off Ticket" : "Turn On Ticket";
    toggleBtn.onclick = (e) => {
      e.stopPropagation();
      toggleTicketActive(tIdx);
    };

    actions.appendChild(refreshBtn);
    actions.appendChild(toggleBtn);
    header.appendChild(titleSpan);
    header.appendChild(actions);
    card.appendChild(header);

    // 3x5 Grid Body
    const gridBody = document.createElement("div");
    gridBody.className = "ticket-grid-body";

    t.numbers.forEach((num, cellIdx) => {
      const cell = document.createElement("div");
      cell.className = "ticket-cell";
      cell.id = `t${tIdx}-c${cellIdx}`;
      const isHit = hitsSet.has(num);
      if (isHit && t.active) {
        cell.classList.add("is-hit");
        if (num === justHitBall) {
          cell.classList.add("just-hit");
        }
      }
      cell.innerHTML = `<span>${num}</span>`;
      gridBody.appendChild(cell);
    });

    card.appendChild(gridBody);
    container.appendChild(card);
  });

  // Evaluate & color winning patterns
  evaluateAndColorTickets();
}

function evaluateAndColorTickets() {
  const hitsSet = new Set(drawnBalls);
  const betPer = getBetPerTicket();
  clearPaytableHighlights();

  let anyWin = false;

  tickets.forEach((t, tIdx) => {
    if (!t.active) return;
    const { winningPatterns, winningCells, totalTicketMult, hasBonus } = evaluateTicket(t.numbers, hitsSet);

    const header = $(`ticket-header-${tIdx}`);
    const title = $(`ticket-title-${tIdx}`);

    if (winningPatterns.length > 0 || hasBonus) {
      anyWin = true;
      if (header) header.classList.add("is-winner");
      const ticketWin = Math.round(totalTicketMult * betPer * 100) / 100;
      if (title) {
        if (hasBonus && totalTicketMult === 0) {
          title.textContent = `BONUS HIT!`;
        } else if (hasBonus) {
          title.textContent = `WIN ${fmt(ticketWin)} + BONUS!`;
        } else {
          title.textContent = `WIN ${fmt(ticketWin)} ETB`;
        }
      }

      // Highlight winning patterns in paytable ribbon
      winningPatterns.forEach(p => highlightPaytablePattern(p.id));
      if (hasBonus) highlightPaytablePattern("bonus");

      // Color cells green/gold on ticket
      winningCells.forEach(cellIdx => {
        const cell = $(`t${tIdx}-c${cellIdx}`);
        if (cell) {
          cell.classList.add(totalTicketMult >= 100 ? "is-gold-pattern" : "is-winning-pattern");
        }
      });
    } else {
      if (header) header.classList.remove("is-winner");
      if (title) title.textContent = `TICKET ${tIdx + 1}`;
    }
  });

  return anyWin;
}

function evaluateTicket(nums, hitsSet) {
  const hitIndices = new Set();
  nums.forEach((n, idx) => {
    if (hitsSet.has(n)) hitIndices.add(idx);
  });

  let winningPatterns = [];
  let winningCells = new Set();
  let totalTicketMult = 0;
  let hasBonus = false;

  // Check Bingo (All 15)
  if (hitIndices.size === 15) {
    const bingoPat = PATTERNS.find(p => p.id === "bingo");
    winningPatterns.push(bingoPat);
    bingoPat.cells.forEach(c => winningCells.add(c));
    return { winningPatterns, winningCells, totalTicketMult: 2000, hasBonus: false };
  }

  // Check 14 numbers (x800)
  if (hitIndices.size === 14) {
    const p800 = PATTERNS.find(p => p.id === "x800");
    winningPatterns.push(p800);
    hitIndices.forEach(c => winningCells.add(c));
    totalTicketMult += 800;
  }

  // Check Perimeter / Frame (x250)
  const pFrame = PATTERNS.find(p => p.id === "x250");
  if (pFrame.cells.every(c => hitIndices.has(c))) {
    winningPatterns.push(pFrame);
    pFrame.cells.forEach(c => winningCells.add(c));
    totalTicketMult += pFrame.odd;
  }

  // Check Big X (x500)
  const pX = PATTERNS.find(p => p.id === "x500");
  if (pX.cells.every(c => hitIndices.has(c))) {
    winningPatterns.push(pX);
    pX.cells.forEach(c => winningCells.add(c));
    totalTicketMult += pX.odd;
  }

  // Check 2 Lines (x100) or Single Lines (x2)
  const row0 = [0, 1, 2, 3, 4].every(c => hitIndices.has(c));
  const row1 = [5, 6, 7, 8, 9].every(c => hitIndices.has(c));
  const row2 = [10, 11, 12, 13, 14].every(c => hitIndices.has(c));
  const linesCount = (row0 ? 1 : 0) + (row1 ? 1 : 0) + (row2 ? 1 : 0);

  if (linesCount >= 2) {
    const p2L = PATTERNS.find(p => p.id === "x100");
    winningPatterns.push(p2L);
    if (row0) [0, 1, 2, 3, 4].forEach(c => winningCells.add(c));
    if (row1) [5, 6, 7, 8, 9].forEach(c => winningCells.add(c));
    if (row2) [10, 11, 12, 13, 14].forEach(c => winningCells.add(c));
    totalTicketMult += 100;
  } else if (linesCount === 1) {
    const p1L = PATTERNS.find(p => p.id === "x2");
    winningPatterns.push(p1L);
    if (row0) [0, 1, 2, 3, 4].forEach(c => winningCells.add(c));
    if (row1) [5, 6, 7, 8, 9].forEach(c => winningCells.add(c));
    if (row2) [10, 11, 12, 13, 14].forEach(c => winningCells.add(c));
    totalTicketMult += 2;
  }

  // Check other shapes: Double T (x40), Corners (x20), Cross (x10), Pyramid (x5), Peak (x3)
  const midShapes = [
    PATTERNS.find(p => p.id === "x40"),
    PATTERNS.find(p => p.id === "x20"),
    PATTERNS.find(p => p.id === "x10"),
    PATTERNS.find(p => p.id === "x5"),
    PATTERNS.find(p => p.id === "x3")
  ];

  midShapes.forEach(pat => {
    if (pat && pat.cells.every(c => hitIndices.has(c))) {
      winningPatterns.push(pat);
      pat.cells.forEach(c => winningCells.add(c));
      totalTicketMult += pat.odd;
    }
  });

  // Check Bonus Star pattern
  const pBonus = PATTERNS.find(p => p.id === "bonus");
  if (pBonus.cells.every(c => hitIndices.has(c))) {
    hasBonus = true;
    pBonus.cells.forEach(c => winningCells.add(c));
  }

  return { winningPatterns, winningCells, totalTicketMult, hasBonus };
}

// Calculate total overall winnings across all active tickets
function calculateTotalWinnings() {
  const hitsSet = new Set(drawnBalls);
  const betPer = getBetPerTicket();
  let totalWin = 0;
  let hasBonusStar = false;

  tickets.forEach(t => {
    if (!t.active) return;
    const { totalTicketMult, hasBonus } = evaluateTicket(t.numbers, hitsSet);
    totalWin += Math.round(totalTicketMult * betPer * 100) / 100;
    if (hasBonus) hasBonusStar = true;
  });

  return { totalWin, hasBonusStar };
}

// Check if any active ticket is 1 ball away from completing a high pattern (>= x8 or Bonus/Bingo)
function checkExtraBallsEligibility() {
  const hitsSet = new Set(drawnBalls);
  let eligible = false;

  for (const t of tickets) {
    if (!t.active) continue;
    const hitIndices = new Set();
    t.numbers.forEach((n, idx) => {
      if (hitsSet.has(n)) hitIndices.add(idx);
    });

    // Patterns that qualify for extra balls
    const testPatterns = PATTERNS.filter(p => p.odd >= 10 || p.isBonus || p.isBingo);
    for (const pat of testPatterns) {
      let missingCount = 0;
      for (const c of pat.cells) {
        if (!hitIndices.has(c)) missingCount++;
      }
      if (missingCount === 1) {
        eligible = true;
        break;
      }
    }
    if (eligible) break;
  }
  return eligible;
}

// --- Ball Rack Rendering ---
function renderDrawnBall(num, isExtra = false) {
  const row1 = $("drawnBallsRow1");
  const row2 = $("drawnBallsRow2");
  if (!row1 || !row2) return;

  const ballEl = document.createElement("div");
  ballEl.className = "drawn-ball-item";

  // Color theme by number range
  if (num <= 18) ballEl.classList.add("ball-blue");
  else if (num <= 36) ballEl.classList.add("ball-purple");
  else if (num <= 54) ballEl.classList.add("ball-green");
  else if (num <= 72) ballEl.classList.add("ball-yellow");
  else ballEl.classList.add("ball-purple");

  if (isExtra) {
    ballEl.style.border = "2px solid #f43f5e";
    ballEl.style.boxShadow = "0 0 8px #f43f5e";
  }

  ballEl.textContent = String(num);

  // Add to row 1 (first 15) or row 2 (next 15+)
  const totalCount = (row1.children.length + row2.children.length);
  if (totalCount < 15) {
    row1.appendChild(ballEl);
  } else {
    row2.appendChild(ballEl);
  }
}

function clearDrawnRack() {
  const row1 = $("drawnBallsRow1");
  const row2 = $("drawnBallsRow2");
  if (row1) row1.innerHTML = "";
  if (row2) row2.innerHTML = "";
}

function showBigBallCallout(num) {
  const callout = $("currentBallCallout");
  const calloutNum = $("currentBallNum");
  const spinBtn = $("spinBtn");

  if (spinBtn) spinBtn.classList.add("hidden");
  if (callout) {
    callout.classList.remove("hidden");
    callout.classList.remove("animating");
    void callout.offsetWidth; // trigger reflow for smooth re-animation
    callout.classList.add("animating");
  }
  if (calloutNum) {
    calloutNum.textContent = String(num);
    calloutNum.classList.remove("num-animating");
    void calloutNum.offsetWidth; // trigger reflow
    calloutNum.classList.add("num-animating");
  }
}

function hideBigBallCallout() {
  const callout = $("currentBallCallout");
  const spinBtn = $("spinBtn");
  if (callout) callout.classList.add("hidden");
  if (spinBtn) spinBtn.classList.remove("hidden");
}

function updateFloatingWinBadge(winAmount) {
  const badge = $("floatingTotalWin");
  const val = $("floatingWinVal");
  if (!badge || !val) return;
  if (winAmount > 0) {
    badge.classList.remove("hidden");
    val.textContent = `${fmt(winAmount)} ETB`;
  } else {
    badge.classList.add("hidden");
  }
}

// --- Main Draw Flow ---
async function startRound() {
  if (isBusy) return;
  initAudio();

  const totalCost = getTotalBet();
  if (totalCost > balance) {
    alert("Insufficient balance! Please deposit or lower your bet.");
    if (isAutoBet) toggleAutoBet();
    return;
  }

  // Deduct balance
  balance -= totalCost;
  syncBalanceSave();

  // Reset round state
  isBusy = true;
  roundId++;
  if ($("roundIdText")) $("roundIdText").textContent = String(roundId);

  drawnBalls = [];
  extrasDrawnCount = 0;
  extraBallsAvailable = false;
  roundWonAmount = 0;
  pendingBonusActive = false;

  // UI state for drawing
  clearPaytableHighlights();
  clearDrawnRack();
  updateFloatingWinBadge(0);

  if ($("marqueeBetPrompt")) $("marqueeBetPrompt").classList.add("hidden");
  if ($("marqueeDrawnRack")) $("marqueeDrawnRack").classList.remove("hidden");
  if ($("extraBallsPrompt")) $("extraBallsPrompt").classList.add("hidden");

  if ($("autoBetBtn")) $("autoBetBtn").disabled = true;
  if ($("collectBtn")) $("collectBtn").classList.add("hidden");
  if ($("extraBallBtn")) $("extraBallBtn").classList.add("hidden");
  if ($("spinBtn")) $("spinBtn").disabled = true;

  // Build random 90 pool
  ballPool = [];
  for (let i = 1; i <= 90; i++) ballPool.push(i);
  for (let i = ballPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ballPool[i], ballPool[j]] = [ballPool[j], ballPool[i]];
  }

  // Draw 30 balls at a pleasant, readable bingo tempo
  const delay = isTurbo ? 160 : 480;

  for (let step = 0; step < DRAW_BALLS_COUNT; step++) {
    const nextBall = ballPool.pop();
    drawnBalls.push(nextBall);

    sfxBall();
    showBigBallCallout(nextBall);
    renderDrawnBall(nextBall, false);

    // Check hit on active tickets
    let hadHit = false;
    tickets.forEach(t => {
      if (t.active && t.numbers.includes(nextBall)) hadHit = true;
    });
    if (hadHit) sfxHit();

    renderTickets(nextBall);

    const { totalWin } = calculateTotalWinnings();
    if (totalWin > 0) {
      updateFloatingWinBadge(totalWin);
    }

    await new Promise(r => setTimeout(r, delay));
  }

  // 30 balls completed! Check outcome
  finishInitialDraw();
}

function finishInitialDraw() {
  const { totalWin, hasBonusStar } = calculateTotalWinnings();
  roundWonAmount = totalWin;
  pendingBonusActive = hasBonusStar;

  // Check if extra balls qualify
  const eligibleForExtras = checkExtraBallsEligibility() && (balance >= getBetPerTicket() * 0.5);

  if (eligibleForExtras && extrasDrawnCount < MAX_EXTRA_BALLS) {
    // Offer Extra Balls
    enterExtraBallsMode();
  } else {
    // Conclude round directly
    concludeRound();
  }
}

function enterExtraBallsMode() {
  extraBallsAvailable = true;
  isBusy = false;

  currentExtraCost = Math.max(1, Math.round(getBetPerTicket() * (0.25 + extrasDrawnCount * 0.15)));

  // Show extra balls prompt in rack
  if ($("extraBallsPrompt")) $("extraBallsPrompt").classList.remove("hidden");
  if ($("extraCostVal")) $("extraCostVal").textContent = String(currentExtraCost);

  // Switch right dock buttons
  if ($("autoBetBtn")) $("autoBetBtn").classList.add("hidden");
  if ($("collectBtn")) $("collectBtn").classList.remove("hidden");
  if ($("extraBallBtn")) {
    $("extraBallBtn").classList.remove("hidden");
    $("extraBallBtn").textContent = `EXTRA (${currentExtraCost})`;
  }

  if (roundWonAmount > 0) {
    sfxWin();
  }

  // If in Auto Bet mode, check if player wants automatic extra balls
  if (isAutoBet) {
    const netLoss = (autoSettings.sessionStartBalance - balance) + currentExtraCost;
    if (autoSettings.buyExtra && balance >= currentExtraCost && netLoss <= autoSettings.lossLimit) {
      setTimeout(() => {
        if (isAutoBet && extraBallsAvailable) drawExtraBall();
      }, isTurbo ? 250 : 600);
    } else {
      setTimeout(() => {
        if (isAutoBet && extraBallsAvailable) concludeRound();
      }, isTurbo ? 250 : 600);
    }
  }
}

async function drawExtraBall() {
  if (isBusy || !extraBallsAvailable || ballPool.length === 0) return;

  if (balance < currentExtraCost) {
    alert("Insufficient balance for extra ball!");
    concludeRound();
    return;
  }

  // Deduct cost
  balance -= currentExtraCost;
  syncBalanceSave();

  isBusy = true;
  extrasDrawnCount++;

  const extraBall = ballPool.pop();
  drawnBalls.push(extraBall);

  sfxBall();
  showBigBallCallout(extraBall);
  renderDrawnBall(extraBall, true);

  let hadHit = false;
  tickets.forEach(t => {
    if (t.active && t.numbers.includes(extraBall)) hadHit = true;
  });
  if (hadHit) sfxHit();

  renderTickets(extraBall);

  const { totalWin, hasBonusStar } = calculateTotalWinnings();
  roundWonAmount = totalWin;
  if (hasBonusStar) pendingBonusActive = true;
  updateFloatingWinBadge(roundWonAmount);

  await new Promise(r => setTimeout(r, isTurbo ? 200 : 500));

  // If hit Bingo or max extras reached or out of eligible patterns, conclude
  if (roundWonAmount >= getBetPerTicket() * 2000 || extrasDrawnCount >= MAX_EXTRA_BALLS) {
    concludeRound();
  } else {
    // Update next extra ball cost
    currentExtraCost = Math.max(1, Math.round(getBetPerTicket() * (0.25 + extrasDrawnCount * 0.15)));
    if ($("extraCostVal")) $("extraCostVal").textContent = String(currentExtraCost);
    if ($("extraBallBtn")) $("extraBallBtn").textContent = `EXTRA (${currentExtraCost})`;
    isBusy = false;

    if (isAutoBet) {
      const netLoss = (autoSettings.sessionStartBalance - balance) + currentExtraCost;
      if (autoSettings.buyExtra && balance >= currentExtraCost && netLoss <= autoSettings.lossLimit && extrasDrawnCount < MAX_EXTRA_BALLS) {
        setTimeout(() => {
          if (isAutoBet && extraBallsAvailable) drawExtraBall();
        }, isTurbo ? 250 : 600);
      } else {
        setTimeout(() => {
          if (isAutoBet && extraBallsAvailable) concludeRound();
        }, isTurbo ? 250 : 600);
      }
    }
  }
}

function concludeRound() {
  isBusy = false;
  extraBallsAvailable = false;

  // Deposit winnings if any
  if (roundWonAmount > 0) {
    balance += roundWonAmount;
    syncBalanceSave();
    if (roundWonAmount >= getBetPerTicket() * 200) {
      sfxBingo();
    } else {
      sfxWin();
    }
  }

  // Hide Extra controls, restore Spin and Auto Bet
  if ($("extraBallsPrompt")) $("extraBallsPrompt").classList.add("hidden");
  if ($("collectBtn")) $("collectBtn").classList.add("hidden");
  if ($("extraBallBtn")) $("extraBallBtn").classList.add("hidden");
  if ($("autoBetBtn")) {
    $("autoBetBtn").classList.remove("hidden");
    $("autoBetBtn").disabled = false;
  }
  if ($("spinBtn")) $("spinBtn").disabled = false;

  // If Bonus Star was achieved, launch Bonus modal!
  if (pendingBonusActive) {
    launchBonusModal();
    return;
  }

  // Handle Auto Bet continuation
  if (isAutoBet) {
    autoSettings.roundsLeft--;
    updateAutoBetButtonUI();

    const netLoss = autoSettings.sessionStartBalance - balance;

    if (autoSettings.roundsLeft <= 0) {
      stopAutoBet("Auto Bet session completed.");
    } else if (netLoss >= autoSettings.lossLimit) {
      stopAutoBet(`Loss limit reached (${autoSettings.lossLimit} ETB).`);
      alert(`Auto Bet stopped: Loss limit reached (${fmt(netLoss)} ETB).`);
    } else if (balance < getTotalBet()) {
      stopAutoBet("Insufficient balance for next auto round.");
      alert("Auto Bet stopped: Insufficient balance.");
    } else {
      setTimeout(() => {
        if (isAutoBet && !isBusy) {
          startRound();
        }
      }, isTurbo ? 450 : 1200);
    }
  }
}

// --- Bonus Star Feature Modal ---
function launchBonusModal() {
  const modal = $("bonusModal");
  const grid = $("bonusStarsGrid");
  const summary = $("bonusWinSummary");
  const collectBtn = $("collectBonusBtn");

  if (!modal || !grid) return;

  modal.classList.remove("hidden");
  summary.classList.add("hidden");
  collectBtn.classList.add("hidden");
  grid.innerHTML = "";

  // 9 Bonus star cards with multipliers
  const starMultipliers = [10, 15, 20, 25, 30, 50, 75, 100, 250];
  for (let i = starMultipliers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [starMultipliers[i], starMultipliers[j]] = [starMultipliers[j], starMultipliers[i]];
  }

  let picksLeft = 3;
  let totalBonusMult = 0;

  starMultipliers.forEach((mult, idx) => {
    const starCard = document.createElement("div");
    starCard.className = "bonus-star-card";
    starCard.innerHTML = "&#11088;";

    starCard.onclick = () => {
      if (starCard.classList.contains("revealed") || picksLeft <= 0) return;
      starCard.classList.add("revealed");
      starCard.textContent = `x${mult}`;
      totalBonusMult += mult;
      picksLeft--;
      sfxHit();

      if (picksLeft <= 0) {
        // All picks done
        const betPer = getBetPerTicket();
        const bonusWin = Math.round(totalBonusMult * betPer * 100) / 100;
        balance += bonusWin;
        syncBalanceSave();

        summary.classList.remove("hidden");
        summary.textContent = `BONUS WIN: +${fmt(bonusWin)} ETB (x${totalBonusMult})`;
        collectBtn.classList.remove("hidden");
        sfxBingo();
      }
    };

    grid.appendChild(starCard);
  });

  collectBtn.onclick = () => {
    modal.classList.add("hidden");
    if (isAutoBet) {
      setTimeout(startRound, 1000);
    }
  };
}

// --- Controls Event Handlers ---
function changeBetStep(delta) {
  if (isBusy) return;
  betStepIdx = Math.max(0, Math.min(BET_STEPS.length - 1, betStepIdx + delta));
  updateBetDisplays();
}

function doubleBet() {
  if (isBusy) return;
  const current = getBetPerTicket();
  const nextTarget = current * 2;
  const foundIdx = BET_STEPS.findIndex(b => b >= nextTarget);
  if (foundIdx !== -1) {
    betStepIdx = foundIdx;
  } else {
    betStepIdx = BET_STEPS.length - 1;
  }
  updateBetDisplays();
}

function toggleTurbo() {
  isTurbo = !isTurbo;
  const btn = $("turboBtn");
  if (btn) btn.classList.toggle("active", isTurbo);
}

// --- Auto Bet Modal & Controller ---
function onAutoBetDockClicked() {
  if (isAutoBet) {
    stopAutoBet("Auto Bet stopped by player.");
  } else {
    openAutoBetModal();
  }
}

function openAutoBetModal() {
  const modal = $("autoBetModal");
  if (!modal) return;

  // Initialize with current game settings
  autoSettings.betAmount = getBetPerTicket();
  autoSettings.ticketCount = getActiveTicketCount();
  autoSettings.turbo = isTurbo;

  const valDisplay = $("autoBetValDisplay");
  if (valDisplay) valDisplay.textContent = String(autoSettings.betAmount);

  // Sync ticket count selection
  document.querySelectorAll("#autoTicketsRow .autobet-sq-btn").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.tickets) === autoSettings.ticketCount);
  });

  // Sync rounds selection
  document.querySelectorAll("#autoRoundsRow .autobet-pill-btn").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.rounds) === autoSettings.rounds);
  });

  // Sync toggles
  const extraToggle = $("autoBuyExtraToggle");
  if (extraToggle) extraToggle.checked = autoSettings.buyExtra;

  const turboToggle = $("autoTurboToggle");
  if (turboToggle) turboToggle.checked = autoSettings.turbo;

  // Sync loss limit default
  updateAutoLossLimitDefault();

  modal.classList.remove("hidden");
}

function closeAutoBetModal() {
  const modal = $("autoBetModal");
  if (modal) modal.classList.add("hidden");
}

function updateAutoLossLimitDefault() {
  const totalStakePerRound = autoSettings.betAmount * autoSettings.ticketCount;
  autoSettings.lossLimit = totalStakePerRound * autoSettings.rounds;
  const input = $("autoLossLimitInput");
  if (input) input.value = String(autoSettings.lossLimit);
}

function startAutoBetSession() {
  closeAutoBetModal();

  // 1. Apply bet to main game
  const betIdx = BET_STEPS.indexOf(autoSettings.betAmount);
  if (betIdx !== -1) {
    betStepIdx = betIdx;
  }

  // 2. Apply tickets count to main game (activate first N tickets)
  tickets.forEach((t, i) => {
    t.active = i < autoSettings.ticketCount;
  });
  updateBetDisplays();
  renderTickets();

  // 3. Apply turbo toggle
  const turboToggle = $("autoTurboToggle");
  isTurbo = turboToggle ? turboToggle.checked : false;
  const turboBtn = $("turboBtn");
  if (turboBtn) turboBtn.classList.toggle("active", isTurbo);

  // 4. Apply extra ball setting
  const extraToggle = $("autoBuyExtraToggle");
  autoSettings.buyExtra = extraToggle ? extraToggle.checked : false;

  // 5. Apply loss limit
  const lossInput = $("autoLossLimitInput");
  autoSettings.lossLimit = lossInput ? Math.max(1, Number(lossInput.value) || 240) : 240;

  // 6. Init session counters
  autoSettings.roundsLeft = autoSettings.rounds;
  autoSettings.sessionStartBalance = balance;
  isAutoBet = true;

  updateAutoBetButtonUI();

  // 7. Start first round!
  if (!isBusy) {
    startRound();
  }
}

function stopAutoBet(msg = "") {
  isAutoBet = false;
  autoSettings.roundsLeft = 0;
  updateAutoBetButtonUI();
  if (msg) console.log(msg);
}

function updateAutoBetButtonUI() {
  const btn = $("autoBetBtn");
  if (!btn) return;
  if (isAutoBet && autoSettings.roundsLeft > 0) {
    btn.textContent = `STOP (${autoSettings.roundsLeft})`;
    btn.style.background = "linear-gradient(180deg, #dc2626 0%, #991b1b 100%)";
    btn.style.borderColor = "#f87171";
  } else {
    btn.textContent = "AUTO BET";
    btn.style.background = "";
    btn.style.borderColor = "";
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  const btn = $("soundToggleBtn");
  if (btn) {
    btn.innerHTML = soundEnabled ? "&#128266;" : "&#128263;";
  }
}

// --- Setup & Initialization ---
function init() {
  updateBalanceUI();
  if (window.HabeshaWallet) {
    window.HabeshaWallet.subscribe((newBal) => {
      balance = newBal;
      updateBalanceUI();
    });
  }

  // Pre-generate 4 tickets
  rollAllTickets();
  renderPaytable();
  updateBetDisplays();

  // Bind Buttons
  const spinBtn = $("spinBtn");
  if (spinBtn) spinBtn.addEventListener("click", startRound);

  const stepMinus = $("stepMinus");
  if (stepMinus) stepMinus.addEventListener("click", () => changeBetStep(-1));

  const stepPlus = $("stepPlus");
  if (stepPlus) stepPlus.addEventListener("click", () => changeBetStep(1));

  const doubleBetBtn = $("doubleBetBtn");
  if (doubleBetBtn) doubleBetBtn.addEventListener("click", doubleBet);

  const newTicketsBtn = $("newTicketsBtn");
  if (newTicketsBtn) newTicketsBtn.addEventListener("click", rollAllTickets);

  const turboBtn = $("turboBtn");
  if (turboBtn) turboBtn.addEventListener("click", toggleTurbo);

  const autoBetBtn = $("autoBetBtn");
  if (autoBetBtn) autoBetBtn.addEventListener("click", onAutoBetDockClicked);

  // Auto Bet Modal Bindings
  const closeAutoBtn = $("closeAutoBetBtn");
  if (closeAutoBtn) closeAutoBtn.addEventListener("click", closeAutoBetModal);

  const cancelAutoBtn = $("cancelAutoBetBtn");
  if (cancelAutoBtn) cancelAutoBtn.addEventListener("click", closeAutoBetModal);

  const startAutoBtn = $("startAutoBetBtn");
  if (startAutoBtn) startAutoBtn.addEventListener("click", startAutoBetSession);

  // Rounds buttons
  document.querySelectorAll("#autoRoundsRow .autobet-pill-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#autoRoundsRow .autobet-pill-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      autoSettings.rounds = Number(btn.dataset.rounds) || 10;
      updateAutoLossLimitDefault();
    });
  });

  // Stepper inside modal
  const autoMinus = $("autoBetMinus");
  if (autoMinus) autoMinus.addEventListener("click", () => {
    const curIdx = BET_STEPS.indexOf(autoSettings.betAmount);
    if (curIdx > 0) {
      autoSettings.betAmount = BET_STEPS[curIdx - 1];
      const valDisplay = $("autoBetValDisplay");
      if (valDisplay) valDisplay.textContent = String(autoSettings.betAmount);
      updateAutoLossLimitDefault();
    }
  });

  const autoPlus = $("autoBetPlus");
  if (autoPlus) autoPlus.addEventListener("click", () => {
    const curIdx = BET_STEPS.indexOf(autoSettings.betAmount);
    if (curIdx !== -1 && curIdx < BET_STEPS.length - 1) {
      autoSettings.betAmount = BET_STEPS[curIdx + 1];
      const valDisplay = $("autoBetValDisplay");
      if (valDisplay) valDisplay.textContent = String(autoSettings.betAmount);
      updateAutoLossLimitDefault();
    }
  });

  // Ticket count buttons in modal
  document.querySelectorAll("#autoTicketsRow .autobet-sq-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#autoTicketsRow .autobet-sq-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      autoSettings.ticketCount = Number(btn.dataset.tickets) || 4;
      updateAutoLossLimitDefault();
    });
  });

  // Loss limit input change
  const lossInput = $("autoLossLimitInput");
  if (lossInput) lossInput.addEventListener("change", () => {
    autoSettings.lossLimit = Math.max(1, Number(lossInput.value) || 240);
  });

  const collectBtn = $("collectBtn");
  if (collectBtn) collectBtn.addEventListener("click", concludeRound);

  const extraBallBtn = $("extraBallBtn");
  if (extraBallBtn) extraBallBtn.addEventListener("click", drawExtraBall);

  const soundBtn = $("soundToggleBtn");
  if (soundBtn) soundBtn.addEventListener("click", toggleSound);
}

// Initialize on DOMContentLoaded or immediate
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
