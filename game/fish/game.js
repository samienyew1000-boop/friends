"use strict";

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

const RISKS = {
  low: {
    odds: [1.2, 1.5, 2, 3, 5],
    // Probability that a throw wins on each pole (rest = miss).
    landProbs: [0.24, 0.14, 0.09, 0.05, 0.025],
  },
  medium: {
    odds: [1.5, 3, 4, 5, 10],
    landProbs: [0.18, 0.07, 0.05, 0.035, 0.01],
  },
  high: {
    odds: [2, 5, 8, 15, 25],
    landProbs: [0.11, 0.042, 0.024, 0.011, 0.0055],
  },
};

// Vertical stagger of poles (arc arrangement like the original).
const POLE_LIFTS = [0, 42, 72, 46, 6];

const POLE_COUNT = 5;
const RINGS_TO_DOUBLE = 5;
const GOLDEN_RING_CHANCE = 0.06;
const BUY_BONUS_MULTIPLIER = 50;
const BONUS_PRIZES = [1, 2, 3, 5, 8, 10, 15, 25, 50];
const RINGS_PER_THROW = 6;
const THROW_DURATION = 1500;
const RING_COLORS = ["#3ee06f", "#ff2f9e", "#ff8c1a", "#2fd3c8", "#a06bff", "#f4ef5a"];
const MIN_BET = 1;
const MAX_BET = 6000;
const START_BALANCE = 10000;

const BALANCE_KEY = "fish-balance";
const MY_BETS_KEY = "fish-my-bets";

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

let balance = loadBalance();
let risk = "low";
let bet = 6;
let autoBet = false;
let autoTimer = null;
let bonusOpen = false;

// Per-pole ring stacks and doubled state (reset when risk changes).
let stacks = new Array(POLE_COUNT).fill(0);
let stackColors = Array.from({ length: POLE_COUNT }, () => []);
let doubled = new Array(POLE_COUNT).fill(false);

let myBets = loadMyBets();
let playerFeed = [];
let sideTab = "players";

/* ------------------------------------------------------------------ */
/* DOM                                                                 */
/* ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);

const seaEl = $("sea");
const polesEl = $("poles");
const balanceEl = $("balance");
const clockEl = $("clock");
const betInput = $("bet");
const btnLeft = $("bet-left");
const btnRight = $("bet-right");
const winMsgEl = $("win-msg");
const winAmountEl = $("win-amount");
const sideRowsEl = $("side-rows");
const sidePanelEl = $("side-panel");
const bonusModalEl = $("bonus-modal");
const bonusGridEl = $("bonus-grid");
const bonusResultEl = $("bonus-result");
const bonusCloseEl = $("bonus-close");

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

function loadBalance() {
  if (window.HabeshaWallet) {
    return window.HabeshaWallet.get();
  }
  const raw = Number(localStorage.getItem(BALANCE_KEY));
  return Number.isFinite(raw) && raw >= 1 ? raw : START_BALANCE;
}

function saveBalance() {
  if (window.HabeshaWallet) {
    window.HabeshaWallet.set(balance);
  }
  localStorage.setItem(BALANCE_KEY, String(balance));
}

function loadMyBets() {
  try {
    const list = JSON.parse(localStorage.getItem(MY_BETS_KEY) || "[]");
    return Array.isArray(list) ? list.slice(0, 40) : [];
  } catch {
    return [];
  }
}

function saveMyBets() {
  localStorage.setItem(MY_BETS_KEY, JSON.stringify(myBets.slice(0, 40)));
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function fmt(n) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderBalance() {
  balanceEl.textContent = fmt(balance);
}

function currentOdd(i) {
  const base = RISKS[risk].odds[i];
  return doubled[i] ? base * 2 : base;
}

function buildPoles() {
  polesEl.replaceChildren();
  for (let i = 0; i < POLE_COUNT; i++) {
    const pole = document.createElement("div");
    pole.className = "fish-pole";
    pole.dataset.index = String(i);
    pole.style.setProperty("--lift", POLE_LIFTS[i] + "px");
    pole.innerHTML = `
      <div class="fish-pole-stack"></div>
      <div class="fish-pole-stick"></div>
      <div class="fish-pole-base"></div>
      <div class="fish-pole-odd"></div>
    `;
    polesEl.appendChild(pole);
  }
  renderPoles();
}

function renderPoles() {
  const poles = polesEl.children;
  for (let i = 0; i < POLE_COUNT; i++) {
    const pole = poles[i];
    pole.classList.toggle("is-doubled", doubled[i]);
    pole.querySelector(".fish-pole-odd").textContent = "x" + currentOdd(i);

    const stack = pole.querySelector(".fish-pole-stack");
    stack.replaceChildren();
    for (let r = 0; r < stacks[i]; r++) {
      const ring = document.createElement("span");
      ring.className = "fish-stack-ring";
      ring.style.setProperty("--ring-color", stackColors[i][r] || RING_COLORS[0]);
      ring.style.bottom = r * 9 + "px";
      stack.appendChild(ring);
    }
  }
}

function showWin(amount) {
  winAmountEl.textContent = fmt(amount) + " Fun";
  winMsgEl.hidden = false;
  clearTimeout(showWin._t);
  showWin._t = setTimeout(() => (winMsgEl.hidden = true), 1800);
}

function renderSideRows() {
  const rows = sideTab === "players" ? playerFeed : myBets;
  sideRowsEl.replaceChildren(
    ...rows.slice(0, 40).map((r) => {
      const div = document.createElement("div");
      div.className = "fish-side-row";
      const winClass = r.win > 0 ? "win" : "lose";
      div.innerHTML = `
        <span>${r.player}</span>
        <span>${r.bet}</span>
        <span>${r.win > 0 ? "x" + r.odd : "-"}</span>
        <span class="${winClass}">${r.win > 0 ? fmt(r.win) : "0.00"}</span>
        <span>${r.time}</span>
      `;
      return div;
    })
  );
}

function nowTime() {
  return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/* ------------------------------------------------------------------ */
/* Game logic                                                          */
/* ------------------------------------------------------------------ */

function rollOutcome() {
  const probs = RISKS[risk].landProbs;
  let r = Math.random();
  for (let i = 0; i < POLE_COUNT; i++) {
    if (r < probs[i]) return i;
    r -= probs[i];
  }
  return -1; // miss
}

function recordMyBet(betAmount, odd, win) {
  myBets.unshift({ player: "You", bet: betAmount, odd, win, time: nowTime() });
  myBets = myBets.slice(0, 40);
  saveMyBets();
  if (sideTab === "my") renderSideRows();
}

function throwRings(button) {
  if (bonusOpen || button.disabled) return;
  const stake = bet;
  if (stake < MIN_BET || stake > balance) return;

  balance -= stake;
  saveBalance();
  renderBalance();
  button.disabled = true;

  const poleIndex = rollOutcome();
  const golden = poleIndex >= 0 && Math.random() < GOLDEN_RING_CHANCE;

  animateBurst(button, poleIndex, golden, (winnerColor) => {
    if (poleIndex < 0) {
      recordMyBet(stake, 0, 0);
    } else {
      stacks[poleIndex] += 1;
      stackColors[poleIndex].push(golden ? "gold" : winnerColor);
      let odd = currentOdd(poleIndex);
      let doubledNow = false;

      if (stacks[poleIndex] >= RINGS_TO_DOUBLE && !doubled[poleIndex]) {
        doubled[poleIndex] = true;
        doubledNow = true;
      } else if (doubled[poleIndex] && stacks[poleIndex] > RINGS_TO_DOUBLE) {
        // A win on an already-doubled pole collects the doubled odd and resets it.
        stacks[poleIndex] = 0;
        stackColors[poleIndex] = [];
        doubled[poleIndex] = false;
      }

      const win = Math.round(stake * odd * 100) / 100;
      balance += win;
      saveBalance();
      renderBalance();
      renderPoles();
      showWin(win);
      recordMyBet(stake, odd, win);

      if (golden) {
        setTimeout(() => openBonus(stake, false), 900);
      }
    }
    button.disabled = false;
  });
}

/* ------------------------------------------------------------------ */
/* Burst throw animation: several colored rings fly, most miss,        */
/* the winning one (if any) lands on the pole and stays.               */
/* ------------------------------------------------------------------ */

function animateBurst(button, poleIndex, golden, onDone) {
  const seaRect = seaEl.getBoundingClientRect();
  const btnRect = button.getBoundingClientRect();

  const startX = btnRect.left + btnRect.width / 2 - seaRect.left;
  const startY = seaRect.height + 30;

  const shuffledColors = [...RING_COLORS].sort(() => Math.random() - 0.5);
  const winnerSlot = Math.floor(Math.random() * RINGS_PER_THROW);
  let finished = 0;
  let winnerColor = shuffledColors[winnerSlot % shuffledColors.length];

  for (let n = 0; n < RINGS_PER_THROW; n++) {
    const isWinner = poleIndex >= 0 && n === winnerSlot;
    const color = shuffledColors[n % shuffledColors.length];
    if (isWinner) winnerColor = color;

    let endX;
    let endY;
    if (isWinner) {
      const pole = polesEl.children[poleIndex];
      const baseRect = pole.querySelector(".fish-pole-base").getBoundingClientRect();
      endX = baseRect.left + baseRect.width / 2 - seaRect.left;
      endY = baseRect.top - seaRect.top - 4 - stacks[poleIndex] * 9;
    } else {
      // Scatter across the whole scene and sink.
      endX = seaRect.width * (0.08 + Math.random() * 0.84);
      endY = seaRect.height * (0.55 + Math.random() * 0.5);
    }

    const peakX = startX + (endX - startX) * (0.35 + Math.random() * 0.3);
    const peakY = seaRect.height * (0.02 + Math.random() * 0.16) - 40;
    const delay = n * 70 + Math.random() * 60;
    const duration = THROW_DURATION * (0.82 + Math.random() * 0.3);
    const spin = (Math.random() < 0.5 ? -1 : 1) * (240 + Math.random() * 240);

    const ring = document.createElement("div");
    ring.className = "fish-fly-ring" + (isWinner && golden ? " is-gold" : "");
    ring.style.setProperty("--ring-color", color);
    ring.style.opacity = "0";
    seaEl.appendChild(ring);

    const t0 = performance.now() + delay;

    function frame(now) {
      if (now < t0) {
        requestAnimationFrame(frame);
        return;
      }
      const t = Math.min(1, (now - t0) / duration);
      const inv = 1 - t;
      const x = inv * inv * startX + 2 * inv * t * peakX + t * t * endX;
      const y = inv * inv * startY + 2 * inv * t * peakY + t * t * endY;
      const rot = spin * t;
      const scale = 1.2 - t * 0.3;
      ring.style.opacity = isWinner ? "1" : String(Math.min(1, 4 - 4 * t));
      ring.style.transform = `translate(${x - 23}px, ${y - 8}px) rotate(${rot}deg) scale(${scale})`;

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        ring.remove();
        finished += 1;
        if (finished === RINGS_PER_THROW) onDone(winnerColor);
      }
    }
    requestAnimationFrame(frame);
  }
}

/* ------------------------------------------------------------------ */
/* Bonus game                                                          */
/* ------------------------------------------------------------------ */

function openBonus(stake, isBought) {
  bonusOpen = true;
  bonusModalEl.hidden = false;
  bonusResultEl.textContent = isBought ? "" : "You caught a golden ring!";
  bonusCloseEl.hidden = true;

  const prizes = [...BONUS_PRIZES].sort(() => Math.random() - 0.5);
  bonusGridEl.replaceChildren(
    ...prizes.map((mult) => {
      const shell = document.createElement("button");
      shell.type = "button";
      shell.className = "fish-bonus-shell";
      shell.textContent = "x" + mult;
      shell.addEventListener("click", () => pickShell(shell, mult, stake), { once: true });
      return shell;
    })
  );
}

function pickShell(picked, mult, stake) {
  const win = Math.round(stake * mult * 100) / 100;
  balance += win;
  saveBalance();
  renderBalance();

  [...bonusGridEl.children].forEach((shell) => {
    shell.disabled = true;
    shell.classList.add("is-open");
  });
  picked.classList.add("is-picked");

  bonusResultEl.textContent = "BONUS WIN " + fmt(win) + " (x" + mult + ")";
  bonusCloseEl.hidden = false;
  recordMyBet(stake, mult, win);
}

function closeBonus() {
  bonusOpen = false;
  bonusModalEl.hidden = true;
}

function buyBonus() {
  if (bonusOpen) return;
  const cost = bet * BUY_BONUS_MULTIPLIER;
  if (cost > balance) return;
  balance -= cost;
  saveBalance();
  renderBalance();
  openBonus(bet, true);
}

/* ------------------------------------------------------------------ */
/* Fake players feed                                                   */
/* ------------------------------------------------------------------ */

const FEED_NAMES = ["al***on", "mi***ke", "sa***ra", "jo***85", "ke***21", "lu***na", "ro***rt", "an***ya", "de***iz", "ha***an"];

function pushFeedRow() {
  const cfg = RISKS[risk];
  const stake = [2, 6, 12, 30, 60, 120, 300][Math.floor(Math.random() * 7)];
  const idx = rollOutcome();
  const odd = idx >= 0 ? cfg.odds[idx] : 0;
  playerFeed.unshift({
    player: FEED_NAMES[Math.floor(Math.random() * FEED_NAMES.length)],
    bet: stake,
    odd,
    win: idx >= 0 ? Math.round(stake * odd * 100) / 100 : 0,
    time: nowTime(),
  });
  playerFeed = playerFeed.slice(0, 40);
  if (sideTab === "players") renderSideRows();
}

function startFeed() {
  for (let i = 0; i < 12; i++) pushFeedRow();
  (function loop() {
    setTimeout(() => {
      pushFeedRow();
      loop();
    }, 1500 + Math.random() * 3000);
  })();
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

function setBet(value) {
  bet = Math.max(MIN_BET, Math.min(MAX_BET, Math.floor(value) || MIN_BET));
  betInput.value = String(bet);
}

function stopAuto() {
  autoBet = false;
  clearInterval(autoTimer);
  autoTimer = null;
  $("auto-bet").classList.remove("is-on");
}

function toggleAuto() {
  if (autoBet) {
    stopAuto();
    return;
  }
  autoBet = true;
  $("auto-bet").classList.add("is-on");
  let side = 0;
  autoTimer = setInterval(() => {
    if (bonusOpen) return;
    if (bet > balance) {
      stopAuto();
      return;
    }
    const button = side === 0 ? btnLeft : btnRight;
    side = 1 - side;
    if (!button.disabled) throwRings(button);
  }, 1900);
}

function setRisk(next) {
  if (risk === next) return;
  risk = next;
  stacks = new Array(POLE_COUNT).fill(0);
  stackColors = Array.from({ length: POLE_COUNT }, () => []);
  doubled = new Array(POLE_COUNT).fill(false);
  document.querySelectorAll(".fish-risk-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.risk === next);
  });
  renderPoles();
}

function bindEvents() {
  $("risk-tabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".fish-risk-tab");
    if (tab) setRisk(tab.dataset.risk);
  });

  btnLeft.addEventListener("click", () => throwRings(btnLeft));
  btnRight.addEventListener("click", () => throwRings(btnRight));

  $("minus").addEventListener("click", () => setBet(bet - (bet > 6 ? 6 : 1)));
  $("plus").addEventListener("click", () => setBet(bet + 6));
  document.querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", () => setBet(bet + Number(btn.dataset.add)));
  });
  $("allin").addEventListener("click", () => setBet(Math.floor(balance)));
  betInput.addEventListener("change", () => setBet(Number(betInput.value)));

  $("auto-bet").addEventListener("click", toggleAuto);
  $("buy-bonus").addEventListener("click", buyBonus);
  bonusCloseEl.addEventListener("click", closeBonus);

  document.querySelectorAll(".fish-side-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      sideTab = tab.dataset.tab;
      document.querySelectorAll(".fish-side-tab").forEach((t) => {
        t.classList.toggle("is-active", t === tab);
      });
      renderSideRows();
    });
  });

  $("side-toggle").addEventListener("click", () => {
    sidePanelEl.classList.toggle("is-hidden");
    $("side-toggle").classList.toggle("is-shifted", sidePanelEl.classList.contains("is-hidden"));
  });
}

function startClock() {
  const tick = () => {
    clockEl.textContent = new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  tick();
  setInterval(tick, 10000);
}

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */

if (window.innerWidth <= 900) {
  sidePanelEl.classList.add("is-hidden");
  $("side-toggle").classList.add("is-shifted");
}

buildPoles();
renderBalance();
if (window.HabeshaWallet) {
  window.HabeshaWallet.subscribe((newBal) => {
    balance = newBal;
    renderBalance();
  });
}
setBet(bet);
renderSideRows();
bindEvents();
startClock();
startFeed();
