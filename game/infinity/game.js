(function () {
  const STORAGE = "infinity_demo_v1";
  const START_BALANCE = 1000;

  const MIN_BET = 1;
  const MAX_BET = 1000;
  const MAX_WIN = 10000;

  const TICK_MS = 80;
  const MAX_POINTS = 420;
  const TRAIL_END_RATIO = 0.92;
  const TIMEFRAMES = [1, 2, 3, 4, 5];
  const VOLATILITY = 0.18;
  const DIRECTION_FORCE = 0.03;

  const COEFF_MIN = 1;
  const COEFF_MAX = 1000;

  const $ = (id) => document.getElementById(id);

  const chartArea = $("chart-area");
  const canvas = $("chart");
  const ctx = canvas.getContext("2d");

  const coeffEl = $("coefficient");
  const balanceEl = $("balance");
  const clockEl = $("clock");

  const betEl = $("bet");
  const buyBtn = $("buy");
  const sellBtn = $("sell");
  const cashoutBtn = $("cashout");
  const minusBtn = $("minus");
  const plusBtn = $("plus");
  const allInBtn = $("allin");
  const x2Btn = $("x2");

  const myBetsEl = $("my-bets");
  const timeframeButtons = Array.from(document.querySelectorAll("[data-timeframe]"));
  const historyPanel = $("history-panel");
  const historyToggle = $("history-toggle");
  const historyClose = $("history-close");
  const historyList = $("history-bets");

  let balance = START_BALANCE;
  let currentCoeff = 1.45;
  let logCoeff = Math.log(currentCoeff);
  let velocity = 0;
  let direction = Math.random() < 0.5 ? -1 : 1;
  let directionTime = 1.4 + Math.random() * 2.4;

  let activeBets = [];
  let history = [];
  let nextBetId = 1;

  let points = [];
  let selectedTimeframe = 1;
  let gameStart = performance.now();
  let lastTick = performance.now();

  let cw = 0;
  let ch = 0;
  let dpr = window.devicePixelRatio || 1;

  function money(n) {
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE) || "{}");
      if (typeof raw.balance === "number") balance = raw.balance;
      if (Array.isArray(raw.history)) history = raw.history.slice(0, 14);
      if (typeof raw.nextBetId === "number") nextBetId = raw.nextBetId;
    } catch {
      balance = START_BALANCE;
    }
    if (window.HabeshaWallet) {
      balance = window.HabeshaWallet.get();
    }
  }

  function save() {
    if (window.HabeshaWallet) {
      window.HabeshaWallet.set(balance);
    }
    localStorage.setItem(
      STORAGE,
      JSON.stringify({
        balance,
        history,
        nextBetId,
      })
    );
  }

  function clampBet() {
    let v = Number(betEl.value);
    if (!Number.isFinite(v)) v = 10;
    v = Math.max(MIN_BET, Math.min(MAX_BET, Math.round(v)));
    betEl.value = String(v);
    return v;
  }

  function canBetNow() {
    // Disable at extremes (matching the idea from Infinity rules).
    return currentCoeff > 1.01 && currentCoeff < 999.2;
  }

  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    cw = chartArea.clientWidth;
    ch = chartArea.clientHeight;
    canvas.width = Math.max(1, Math.floor(cw * dpr));
    canvas.height = Math.max(1, Math.floor(ch * dpr));
    canvas.style.width = cw + "px";
    canvas.style.height = ch + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function pushPoint(t) {
    points.push({ t, coeff: currentCoeff });
    if (points.length > MAX_POINTS) points.shift();
  }

  function getCandles() {
    if (!points.length) return [];

    const intervalMs = selectedTimeframe * 1000;
    const candles = [];
    let candle = null;

    for (const point of points) {
      const bucket = Math.floor(point.t / intervalMs) * intervalMs;
      if (!candle || candle.time !== bucket) {
        candle = {
          time: bucket,
          open: point.coeff,
          high: point.coeff,
          low: point.coeff,
          close: point.coeff,
        };
        candles.push(candle);
      } else {
        candle.high = Math.max(candle.high, point.coeff);
        candle.low = Math.min(candle.low, point.coeff);
        candle.close = point.coeff;
      }
    }

    return candles.slice(-Math.floor(MAX_POINTS * TICK_MS / 1000 / selectedTimeframe));
  }

  function updateCoeff(dtMs) {
    // Log-space motion keeps the curve smooth while allowing large swings.
    // A persistent direction creates visible rises and falls instead of a flat trail.
    const dt = Math.min(250, Math.max(20, dtMs)) / 1000;
    const ticks = dt * 10;

    directionTime -= dt;
    if (directionTime <= 0) {
      direction = Math.random() < 0.5 ? -1 : 1;
      directionTime = 1.2 + Math.random() * 2.8;
    }

    velocity += (Math.random() - 0.5) * VOLATILITY * Math.sqrt(ticks);
    velocity += direction * DIRECTION_FORCE * ticks;
    velocity *= Math.pow(0.92, ticks);
    velocity = Math.max(-1.25, Math.min(1.25, velocity));

    logCoeff += velocity * dt * 2.3;

    let c = Math.exp(logCoeff);
    if (c < COEFF_MIN) {
      c = COEFF_MIN;
      logCoeff = Math.log(c);
      velocity = Math.abs(velocity) * 0.65;
    } else if (c > COEFF_MAX) {
      c = COEFF_MAX;
      logCoeff = Math.log(c);
      velocity = -Math.abs(velocity) * 0.65;
    }

    currentCoeff = c;
  }

  function indexByTime(t0, items = points) {
    let bestIdx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < items.length; i++) {
      const itemTime = items[i].time ?? items[i].t;
      const d = Math.abs(itemTime - t0);
      if (d < bestDiff) {
        bestDiff = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  function yForCoeff(coeff) {
    const padTop = 34;
    const padBottom = 52;
    // Infinity визуально использует нелинейную (лог) шкалу по Y, поэтому прямое линейное маппирование выглядит “плоско”.
    const safe = Math.max(COEFF_MIN, Math.min(COEFF_MAX, coeff));
    const logMin = Math.log(COEFF_MIN);
    const logMax = Math.log(COEFF_MAX);
    const norm = (Math.log(safe) - logMin) / (logMax - logMin);
    return padTop + (1 - norm) * (ch - padTop - padBottom);
  }

  function xForIndex(i, count = points.length) {
    if (count <= 1) return (cw * TRAIL_END_RATIO) / 2;
    return (i / (count - 1)) * cw * TRAIL_END_RATIO;
  }

  function traceChartLine(ctx2) {
    const first = points[0];
    ctx2.moveTo(xForIndex(0), yForCoeff(first.coeff));

    for (let i = 1; i < points.length; i++) {
      const previous = points[i - 1];
      const current = points[i];
      const previousX = xForIndex(i - 1);
      const previousY = yForCoeff(previous.coeff);
      const currentX = xForIndex(i);
      const currentY = yForCoeff(current.coeff);
      const midpointX = (previousX + currentX) / 2;
      const midpointY = (previousY + currentY) / 2;

      ctx2.quadraticCurveTo(previousX, previousY, midpointX, midpointY);
    }

    const last = points[points.length - 1];
    ctx2.lineTo(xForIndex(points.length - 1), yForCoeff(last.coeff));
  }

  function drawChart() {
    ctx.clearRect(0, 0, cw, ch);

    const candles = getCandles();
    if (!candles.length) return;

    const candleWidth = Math.max(4, Math.min(18, (cw * TRAIL_END_RATIO) / Math.max(1, candles.length) * 0.62));

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      const x = xForIndex(i, candles.length);
      const bodyTop = yForCoeff(Math.max(candle.open, candle.close));
      const bodyBottom = yForCoeff(Math.min(candle.open, candle.close));
      const bodyHeight = Math.max(2, bodyBottom - bodyTop);
      const wickTop = yForCoeff(candle.high);
      const wickBottom = yForCoeff(candle.low);
      const rising = candle.close >= candle.open;
      const color = rising ? "#24d77b" : "#ff526b";

      ctx.save();
      ctx.shadowColor = rising ? "rgba(36, 215, 123, 0.38)" : "rgba(255, 82, 107, 0.38)";
      ctx.shadowBlur = 9;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.2, candleWidth * 0.12);
      ctx.beginPath();
      ctx.moveTo(x, wickTop);
      ctx.lineTo(x, wickBottom);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
      ctx.restore();
    }

    // Active position markers: direction-colored dot + entry label.
    for (const position of activeBets) {
      const idx = indexByTime(position.startTime, candles);
      const x = xForIndex(idx, candles.length);
      const y = yForCoeff(position.startCoeff);
      const color = position.side === "buy" ? "#24d77b" : "#ff526b";

      ctx.beginPath();
      ctx.arc(x, y, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      const text = `${position.side.toUpperCase()} ${position.startCoeff.toFixed(2)}x`;
      ctx.font = "800 14px Segoe UI, Arial, sans-serif";
      const tw = ctx.measureText(text).width;
      const bx = x - tw / 2 - 10;
      const by = y - 34;
      const bw = tw + 20;
      const bh = 22;

      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      roundRect(ctx, bx, by, bw, bh, 10);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "rgba(245, 252, 255, 0.98)";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x - tw / 2, by + bh / 2 + 0.5);
    }
  }

  function roundRect(ctx2, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx2.beginPath();
    ctx2.moveTo(x + rr, y);
    ctx2.arcTo(x + w, y, x + w, y + h, rr);
    ctx2.arcTo(x + w, y + h, x, y + h, rr);
    ctx2.arcTo(x, y + h, x, y, rr);
    ctx2.arcTo(x, y, x + w, y, rr);
    ctx2.closePath();
  }

  function positionProfit(position) {
    const move = currentCoeff - position.startCoeff;
    const direction = position.side === "buy" ? 1 : -1;
    return Math.max(-position.stake, Math.min(MAX_WIN, position.stake * direction * move));
  }

  function renderMyBets() {
    myBetsEl.replaceChildren();
    if (!activeBets.length) {
      const empty = document.createElement("div");
      empty.className = "inf-bet-row empty-position";
      empty.innerHTML = '<span>--</span><span>--</span><span>--</span><span>--</span><span class="pill pending">No position</span>';
      myBetsEl.appendChild(empty);
      return;
    }

    for (const position of activeBets) {
      const profit = positionProfit(position);
      const profitClass = profit >= 0 ? "win" : "lose";
      const sideClass = position.side === "buy" ? "buy-text" : "sell-text";
      const row = document.createElement("div");
      row.className = "inf-bet-row";
      row.innerHTML = `
        <span class="${sideClass}">${position.side.toUpperCase()}</span>
        <span>${money(position.stake)}</span>
        <span>${position.startCoeff.toFixed(2)}x</span>
        <span class="pill ${profitClass}">${profit >= 0 ? "+" : "-"}${money(Math.abs(profit))}</span>
        <span class="pill pending">LIVE</span>
      `;
      myBetsEl.appendChild(row);
    }
  }

  function renderHistory() {
    historyList.replaceChildren();
    for (const h of history.slice(0, 10)) {
      const item = document.createElement("div");
      item.className = "inf-history-item";
      item.innerHTML = `
        <span>${h.side ? h.side.toUpperCase() : "POSITION"} ${money(h.stake)} Birr (${h.startCoeff.toFixed(2)}x)</span>
        <span class="res ${h.result}">${h.payout >= 0 ? "+" : "-"}${money(Math.abs(h.payout))} Birr</span>
      `;
      historyList.appendChild(item);
    }
  }

  function renderAll() {
    balanceEl.textContent = money(balance);
    coeffEl.textContent = currentCoeff.toFixed(2) + "x";
    const amount = clampBet();
    const canOpen = !activeBets.length && canBetNow() && amount <= balance;
    buyBtn.disabled = !canOpen;
    sellBtn.disabled = !canOpen;
    cashoutBtn.disabled = !activeBets.length;
    renderMyBets();
    renderHistory();
  }

  function openPosition(side) {
    const stake = clampBet();
    if (activeBets.length || stake > balance || !canBetNow()) return;

    balance -= stake;
    activeBets = [{
      id: nextBetId++,
      side,
      stake,
      startCoeff: currentCoeff,
      startTime: performance.now(),
    }];
    save();
    renderAll();
  }

  function cashout() {
    if (!activeBets.length) return;

    const position = activeBets[0];
    const profit = positionProfit(position);
    const returned = Math.max(0, position.stake + profit);
    balance += returned;
    history.unshift({
      id: position.id,
      side: position.side,
      stake: position.stake,
      startCoeff: position.startCoeff,
      endCoeff: currentCoeff,
      payout: profit,
      result: profit >= 0 ? "win" : "lose",
    });
    activeBets = [];
    if (history.length > 30) history.length = 30;
    save();
    renderAll();
  }

  function updateClock() {
    clockEl.textContent = formatTime(Date.now());
  }

  function bind() {
    timeframeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const requestedTimeframe = Number(button.dataset.timeframe);
        if (!TIMEFRAMES.includes(requestedTimeframe)) return;
        selectedTimeframe = requestedTimeframe;
        timeframeButtons.forEach((item) => {
          const active = item === button;
          item.classList.toggle("active", active);
          item.setAttribute("aria-pressed", String(active));
        });
        drawChart();
      });
    });

    minusBtn.addEventListener("click", () => {
      betEl.value = String(Math.max(MIN_BET, clampBet() - 1));
      renderAll();
    });
    plusBtn.addEventListener("click", () => {
      betEl.value = String(Math.min(MAX_BET, clampBet() + 1));
      renderAll();
    });

    betEl.addEventListener("change", () => renderAll());

    allInBtn.addEventListener("click", () => {
      const v = Math.floor(balance);
      betEl.value = String(Math.max(MIN_BET, Math.min(MAX_BET, v)));
      renderAll();
    });

    x2Btn.addEventListener("click", () => {
      const v = Math.min(MAX_BET, clampBet() * 2);
      betEl.value = String(Math.max(MIN_BET, v));
      renderAll();
    });

    buyBtn.addEventListener("click", () => openPosition("buy"));
    sellBtn.addEventListener("click", () => openPosition("sell"));
    cashoutBtn.addEventListener("click", cashout);

    historyToggle.addEventListener("click", () => {
      historyPanel.classList.toggle("open");
      if (historyPanel.classList.contains("open")) renderHistory();
    });
    historyClose.addEventListener("click", () => historyPanel.classList.remove("open"));

    window.addEventListener("resize", () => {
      resizeCanvas();
      renderAll();
    });
  }

  function seedPoints() {
    // Fill so the first draw looks continuous.
    const now = performance.now();
    points = [];
    let t = now - 120 * TICK_MS;
    for (let i = 0; i < MAX_POINTS; i++) {
      updateCoeff(TICK_MS);
      currentCoeff = Math.min(COEFF_MAX, Math.max(COEFF_MIN, currentCoeff));
      pushPoint(t);
      t += TICK_MS;
    }
    points = points.slice(-MAX_POINTS);
  }

  function tick(now) {
    const dt = now - lastTick;
    if (dt >= TICK_MS) {
      lastTick = now;
      updateCoeff(dt);
      pushPoint(now);
      renderAll();
      drawChart();
    }
    requestAnimationFrame(tick);
  }

  load();
  betEl.value = String(Math.min(MAX_BET, Math.max(MIN_BET, Number(betEl.value) || 10)));
  resizeCanvas();
  seedPoints();
  bind();
  updateClock();
  setInterval(updateClock, 1000);
  renderAll();
  if (window.HabeshaWallet) {
    window.HabeshaWallet.subscribe((newBal) => {
      balance = newBal;
      renderAll();
    });
  }
  drawChart();
  requestAnimationFrame(tick);
})();

