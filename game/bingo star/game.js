"use strict";

const MIN_BET = 1;
const MAX_BET = 400;
const START_BALANCE = 10000;
const DRAW_COUNT = 30;
const MAX_EXTRA = 14;
const BALANCE_KEY = "bingo-star-balance";
const HISTORY_KEY = "bingo-star-history";

const PATTERNS = [
  { name: "x2", cells: [0, 1, 2, 3, 4], odd: 2 },
  { name: "x3", cells: [5, 6, 7, 8, 9], odd: 3 },
  { name: "x5", cells: [10, 11, 12, 13, 14], odd: 5 },
  { name: "x10", cells: [2, 6, 7, 8, 12], odd: 10 },
  { name: "x20", cells: [0, 4, 10, 14], odd: 20 },
  { name: "x40", cells: [0, 4, 7, 10, 14], odd: 40 },
  { name: "x100", cells: [2, 6, 7, 8, 10, 11, 12, 13, 14], odd: 100 },
  { name: "x250", cells: [0, 1, 2, 3, 4, 5, 9, 10, 11, 12, 13, 14], odd: 250 },
  { name: "x500", cells: [0, 2, 4, 6, 8, 10, 12, 14], odd: 500 },
  { name: "x800", cells: [0, 4, 5, 9, 10, 14], odd: 800 },
  { name: "Bonus", cells: [1, 3, 6, 8, 12], odd: 0, bonus: true },
  { name: "Bingo", cells: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], odd: 2000 },
];

const BONUS_PRIZES = [30, 50, 80, 100, 150, 250, 400, 600, 1000];

const $ = (id) => document.getElementById(id);
const cardsEl = $("cards");
const drawnEl = $("drawn");
const statusEl = $("status");
const drawBtn = $("draw");
const extraWrap = $("extra-wrap");
const betInput = $("bet");
const sideRowsEl = $("side-rows");
const sidePanelEl = $("side-panel");
const bonusModal = $("bonus-modal");
const bonusGrid = $("bonus-grid");
const bonusResult = $("bonus-result");
const bonusClose = $("bonus-close");

let balance = typeof window.HabeshaWallet !== "undefined" ? window.HabeshaWallet.get() : loadNum(BALANCE_KEY, START_BALANCE);
let bet = 6;
let ticketCount = 2;
let tickets = [];
let drawn = [];
let pool = [];
let busy = false;
let turbo = false;
let extrasUsed = 0;
let ballMult = 1;
let sideTab = "players";
let myHistory = loadList(HISTORY_KEY);
let playerFeed = [];
let topFeed = [];
let pendingBonus = false;

function loadNum(key, fallback) {
  const n = Number(localStorage.getItem(key));
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}
function saveBalance() {
  if (typeof window.HabeshaWallet !== "undefined") {
    window.HabeshaWallet.set(balance);
  }
  localStorage.setItem(BALANCE_KEY, String(balance));
}
function loadList(key) {
  try {
    const list = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(list) ? list.slice(0, 40) : [];
  } catch {
    return [];
  }
}
function saveHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(myHistory.slice(0, 40)));
}
function fmt(n) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtBal(n) {
  return Math.floor(n).toLocaleString("en-US").replace(/,/g, " ");
}
function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}
function nowTime() {
  return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeTicket() {
  return shuffle(Array.from({ length: 90 }, (_, i) => i + 1)).slice(0, 15);
}

function regenTickets() {
  tickets = Array.from({ length: 4 }, () => makeTicket());
  renderCards();
}

function renderBalance() {
  $("balance").textContent = fmtBal(balance);
}

function renderCards() {
  const hits = new Set(drawn.map((d) => d.n));
  cardsEl.replaceChildren();
  for (let t = 0; t < 4; t++) {
    const card = document.createElement("div");
    card.className = "bs-card" + (t >= ticketCount ? " is-off" : "");
    const win = t < ticketCount ? bestPattern(tickets[t], hits) : null;
    card.innerHTML = `
      <div class="bs-card-head"><span>TICKET ${t + 1}</span><span>${t < ticketCount ? "ACTIVE" : "OFF"}</span></div>
      <div class="bs-grid"></div>
      <div class="bs-card-win">${win && win.odd ? win.name + " x" + win.odd : win && win.bonus ? "BONUS PATTERN" : ""}</div>
    `;
    const grid = card.querySelector(".bs-grid");
    tickets[t].forEach((n) => {
      const cell = document.createElement("div");
      cell.className = "bs-cell" + (hits.has(n) ? " is-hit" : "");
      cell.textContent = String(n);
      grid.appendChild(cell);
    });
    cardsEl.appendChild(card);
  }
}

function renderDrawn() {
  if (!drawnEl) return;
  const BALL_COLORS = ["blue", "purple", "green", "red", "yellow"];
  drawnEl.replaceChildren(
    ...drawn.map((d) => {
      const b = document.createElement("div");
      b.className = "bs-ball-wrap";

      const img = document.createElement("img");
      const c = d.special || BALL_COLORS[d.n % 5];
      img.src = `assets/balls/${c}.svg`;
      img.style.width = "28px";
      img.style.height = "28px";

      const t = document.createElement("span");
      t.style.position = "absolute";
      t.style.left = "50%";
      t.style.top = "50%";
      t.style.transform = "translate(-50%, -50%)";
      t.style.fontSize = "12px";
      t.style.fontWeight = "900";
      t.style.color = "#111";
      t.textContent = d.n;

      b.style.position = "relative";
      b.style.display = "inline-block";
      b.appendChild(img);
      b.appendChild(t);
      return b;
    })
  );
}

function renderPatterns() {
  const pEl = $("patterns");
  if (!pEl) return;
  pEl.replaceChildren(...PATTERNS.map((p) => {
    const item = document.createElement("div");
    item.className = "bs-pattern-item";

    let cellsHTML = "";
    for (let i = 0; i < 15; i++) {
      const lit = p.cells.includes(i) ? " is-lit" : "";
      cellsHTML += `<div class="bs-pattern-cell${lit}"></div>`;
    }

    item.innerHTML = `
      <div class="bs-pattern-title">${p.bonus ? "Bonus" : "x" + p.odd}</div>
      <div class="bs-pattern-img">${cellsHTML}</div>
    `;
    return item;
  }));
}

function bestPattern(nums, hits) {
  let best = null;
  for (const p of PATTERNS) {
    const ok = p.cells.every((i) => hits.has(nums[i]));
    if (!ok) continue;
    if (p.bonus) best = best && best.odd >= 10 ? best : p;
    else if (!best || p.odd > best.odd) best = p;
  }
  return best;
}

function evaluate() {
  const hits = new Set(drawn.map((d) => d.n));
  let totalOdd = 0;
  let bonus = false;
  for (let t = 0; t < ticketCount; t++) {
    const p = bestPattern(tickets[t], hits);
    if (!p) continue;
    if (p.bonus) bonus = true;
    else totalOdd += p.odd;
  }
  return { totalOdd, bonus };
}

function extraCost() {
  return Math.max(1, Math.round(bet * 0.25 * (extrasUsed + 1)));
}

async function startDraw() {
  if (busy) return;
  const cost = bet * ticketCount;
  if (cost > balance) {
    statusEl.textContent = "NOT ENOUGH BALANCE";
    return;
  }
  balance -= cost;
  saveBalance();
  renderBalance();
  busy = true;
  drawBtn.disabled = true;
  extraWrap.hidden = true;
  extrasUsed = 0;
  ballMult = 1;
  pendingBonus = false;
  drawn = [];
  pool = shuffle(Array.from({ length: 90 }, (_, i) => i + 1));
  renderDrawn();
  renderCards();
  statusEl.textContent = "DRAWING 30 BALLS…";

  const silverAt = Math.random() < 0.12 ? 8 + Math.floor(Math.random() * 18) : -1;
  const goldAt = Math.random() < 0.05 ? 12 + Math.floor(Math.random() * 16) : -1;

  for (let i = 0; i < DRAW_COUNT; i++) {
    const n = pool.pop();
    let special = null;
    if (i === goldAt) {
      special = "gold";
      ballMult = Math.max(ballMult, 5);
    } else if (i === silverAt) {
      special = "silver";
      ballMult = Math.max(ballMult, 2);
    }
    drawn.push({ n, special });
    renderDrawn();
    renderCards();
    if (!turbo) await sleep(70);
  }

  const ev = evaluate();
  if (ev.totalOdd > 0) statusEl.textContent = "PATTERNS HIT · x" + ev.totalOdd + (ballMult > 1 ? " · BALL x" + ballMult : "");
  else statusEl.textContent = "NO PATTERN YET — extra balls?";
  extraWrap.hidden = false;
  busy = false;
}

function buyExtra() {
  if (busy || extrasUsed >= MAX_EXTRA || !pool.length) return;
  const cost = extraCost();
  if (cost > balance) {
    statusEl.textContent = "EXTRA COSTS " + cost;
    return;
  }
  balance -= cost;
  saveBalance();
  renderBalance();
  extrasUsed += 1;
  const n = pool.pop();
  drawn.push({ n, special: null });
  renderDrawn();
  renderCards();
  const ev = evaluate();
  statusEl.textContent = extrasUsed + "/" + MAX_EXTRA + " extra" + (ev.totalOdd ? " · x" + ev.totalOdd : "");
  if (extrasUsed >= MAX_EXTRA) finishRound();
}

function finishRound() {
  extraWrap.hidden = true;
  const ev = evaluate();
  pendingBonus = ev.bonus;
  const win = Math.round(bet * ev.totalOdd * ballMult * 100) / 100;
  if (win > 0) {
    balance += win;
    saveBalance();
    renderBalance();
    statusEl.textContent = "YOU WIN " + fmt(win) + (ballMult > 1 ? " (ball x" + ballMult + ")" : "");
  } else if (!pendingBonus) {
    statusEl.textContent = "NO WIN";
  }
  record("You", bet * ticketCount, win);
  drawBtn.disabled = false;
  if (pendingBonus) openBonus();
}

function openBonus() {
  bonusModal.hidden = false;
  bonusResult.textContent = "";
  bonusClose.hidden = true;
  const prizes = shuffle(BONUS_PRIZES);
  bonusGrid.replaceChildren(
    ...prizes.map((mult) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "bs-star";
      b.textContent = "x" + mult;
      b.addEventListener("click", () => pickBonus(b, mult, prizes), { once: true });
      return b;
    })
  );
}

function pickBonus(picked, mult, prizes) {
  const win = Math.round(bet * mult * 100) / 100;
  balance += win;
  saveBalance();
  renderBalance();
  [...bonusGrid.children].forEach((el) => el.classList.add("is-open"));
  bonusResult.textContent = "BONUS WIN " + fmt(win) + " (x" + mult + ")";
  bonusClose.hidden = false;
  record("You", bet, win);
}

function record(player, stake, win) {
  const row = { player, bet: stake, win, time: nowTime() };
  if (player === "You") {
    myHistory.unshift(row);
    myHistory = myHistory.slice(0, 40);
    saveHistory();
  } else {
    playerFeed.unshift(row);
    playerFeed = playerFeed.slice(0, 40);
    if (win > 80) {
      topFeed.unshift(row);
      topFeed = topFeed.slice(0, 20);
    }
  }
  renderSide();
}

function renderSide() {
  const source = sideTab === "players" ? playerFeed : sideTab === "top" ? topFeed : myHistory;
  sideRowsEl.replaceChildren(
    ...source.slice(0, 40).map((r) => {
      const div = document.createElement("div");
      div.className = "bs-side-row";
      const cls = r.win > 0 ? "win" : "lose";
      div.innerHTML = `
        <span>${r.player}</span>
        <span>${r.bet}</span>
        <span class="${cls}">${r.win > 0 ? fmt(r.win) : "0.00"}</span>
        <span>${r.time}</span>
      `;
      return div;
    })
  );
}

function setBet(v) {
  bet = Math.max(MIN_BET, Math.min(MAX_BET, Math.floor(v) || MIN_BET));
  if (betInput) betInput.value = String(bet);
  const tb = $("totalbet-val");
  if (tb) tb.textContent = String(bet * ticketCount);
}

function setTickets(n) {
  if (drawBtn.disabled && extraWrap.hidden === false) return;
  if (busy) return;
  ticketCount = n;
  document.querySelectorAll(".bs-n").forEach((b) => {
    b.classList.toggle("is-on", Number(b.dataset.n) === n);
  });
  renderCards();
}

const FEED_NAMES = ["st***ar", "bi***90", "lu***ky", "go***ld", "nx***21", "al***on"];

function pushFeed() {
  const stake = [2, 6, 12, 24, 60][Math.floor(Math.random() * 5)];
  const hit = Math.random() < 0.38;
  const odd = [2, 2, 5, 10, 12, 25][Math.floor(Math.random() * 6)];
  record(FEED_NAMES[Math.floor(Math.random() * FEED_NAMES.length)], stake, hit ? Math.round(stake * odd * 100) / 100 : 0);
}

function bind() {
  if (drawBtn) drawBtn.addEventListener("click", startDraw);
  const autoBtn = $("auto");
  if (autoBtn) autoBtn.addEventListener("click", startDraw);
  if ($("extra")) $("extra").addEventListener("click", buyExtra);
  if ($("skip")) $("skip").addEventListener("click", finishRound);
  if ($("swap")) $("swap").addEventListener("click", () => {
    if (!busy && extraWrap && extraWrap.hidden) regenTickets();
  });
  if ($("turbo")) $("turbo").addEventListener("click", () => {
    turbo = !turbo;
    $("turbo").classList.toggle("is-on", turbo);
  });
  if ($("minus")) $("minus").addEventListener("click", () => setBet(bet - 1));
  if ($("plus")) $("plus").addEventListener("click", () => setBet(bet + 1));
  if ($("allin")) $("allin").addEventListener("click", () => setBet(Math.floor(balance / ticketCount)));

  document.querySelectorAll(".bs-hot").forEach((b) => {
    b.addEventListener("click", () => setBet(bet + parseInt(b.textContent)));
  });

  if (betInput) betInput.addEventListener("change", () => setBet(Number(betInput.value)));
  document.querySelectorAll(".bs-n").forEach((b) => {
    b.addEventListener("click", () => setTickets(Number(b.dataset.n)));
  });
  if (bonusClose) bonusClose.addEventListener("click", () => {
    bonusModal.hidden = true;
  });
  document.querySelectorAll(".bs-side-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      sideTab = tab.dataset.tab;
      document.querySelectorAll(".bs-side-tab").forEach((t) => t.classList.toggle("is-active", t === tab));
      renderSide();
    });
  });
  $("side-toggle").addEventListener("click", () => sidePanelEl.classList.toggle("is-hidden"));
}

function startClock() {
  const tick = () => {
    $("clock").textContent = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  };
  tick();
  setInterval(tick, 10000);
}

if (window.innerWidth <= 900) sidePanelEl.classList.add("is-hidden");

regenTickets();
renderPatterns();
renderBalance();
if (window.HabeshaWallet) {
  window.HabeshaWallet.subscribe((newBal) => {
    balance = newBal;
    renderBalance();
  });
}
setBet(bet);
renderSide();
bind();
startClock();
for (let i = 0; i < 10; i++) pushFeed();
(function loop() {
  setTimeout(() => { pushFeed(); loop(); }, 2000 + Math.random() * 2500);
})();
