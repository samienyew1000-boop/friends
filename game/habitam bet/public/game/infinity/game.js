(function () {
  "use strict";

  const STORAGE = "infinity_demo_v1";
  const START_BALANCE = 10000;

  const MIN_BET = 1;
  const MAX_BET = 1000;

  const TICK_MS = 60;
  const MAX_POINTS = 380;
  const TRAIL_END_RATIO = 0.88;
  const VOLATILITY = 0.20;
  const DIRECTION_FORCE = 0.035;

  const COEFF_MIN = 1.0;
  const COEFF_MAX = 1000.0;

  const $ = (id) => document.getElementById(id);

  const chartArea = $("chart-area");
  const canvas = $("chart");
  const ctx = canvas.getContext("2d");

  const coeffEl = $("coefficient");
  const balanceTextEl = $("balanceText");

  // My Bets top elements
  const myBetTimerEl = $("myBetTimer");
  const myBetStakeEl = $("myBetStake");
  const myBetXStartEl = $("myBetXStart");
  const myBetXEndEl = $("myBetXEnd");

  // Controls
  const betDisplayEl = $("betDisplay");
  const betHiddenInput = $("bet");
  const minusBtn = $("minus");
  const plusBtn = $("plus");
  const allInBtn = $("allin");
  const x2Btn = $("x2");
  const sideBuyBtn = $("sideBuyBtn");
  const sideSellBtn = $("sideSellBtn");
  const placeBetBtn = $("placeBetBtn");

  // History & Options
  const historyToggleBtn = $("historyToggleBtn");
  const historyCountEl = $("historyCount");
  const historyDrawer = $("historyDrawer");
  const closeHistoryBtn = $("closeHistoryBtn");
  const historyListEl = $("historyList");

  const chartOptionsBtn = $("chartOptionsBtn");
  const optionsDropdown = $("optionsDropdown");
  const btnModeLine = $("btnModeLine");
  const btnModeCandles = $("btnModeCandles");

  // State
  let balance = START_BALANCE;
  let currentCoeff = 1.45;
  let logCoeff = Math.log(currentCoeff);
  let velocity = 0;
  let direction = Math.random() < 0.5 ? -1 : 1;
  let directionTime = 1.4 + Math.random() * 2.4;

  let currentBet = 6;
  let selectedSide = "buy"; // "buy" or "sell"
  let tradeDurationSec = 5.0; // default 5s countdown
  let chartMode = "candles"; // Candlestick chart by default
  let selectedTimeframe = 1; // 1-second timeframe/interval

  let activeTrade = null; // currently active countdown trade
  let recentTrades = []; // recently finished trades (to show trail "from where to where it went")
  let history = [];
  let nextBetId = 1;

  let points = [];
  let lastTick = performance.now();

  let cw = 0;
  let ch = 0;
  let dpr = window.devicePixelRatio || 1;

  function money(n) {
    return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function moneyInt(n) {
    return Math.floor(n).toLocaleString("en-US").replace(/,/g, " ");
  }

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE) || "{}");
      if (typeof raw.balance === "number" && raw.balance >= 1) balance = raw.balance;
      if (Array.isArray(raw.history)) history = raw.history.slice(0, 30);
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

  function updateBalanceDisplay() {
    if (window.HabeshaWallet) {
      balance = window.HabeshaWallet.get();
    }
    if (balanceTextEl) balanceTextEl.textContent = moneyInt(balance);
  }

  function setBet(amount) {
    currentBet = Math.max(MIN_BET, Math.min(MAX_BET, Math.round(amount)));
    if (betDisplayEl) betDisplayEl.textContent = String(currentBet);
    if (betHiddenInput) betHiddenInput.value = String(currentBet);
  }

  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    cw = chartArea.clientWidth;
    ch = chartArea.clientHeight;
    canvas.width = Math.max(1, Math.floor(cw * dpr));
    canvas.height = Math.max(1, Math.floor(ch * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function pushPoint(t) {
    points.push({ t, coeff: currentCoeff });
    if (points.length > MAX_POINTS) points.shift();
  }

  function updateCoeff(dtMs) {
    const dt = Math.min(150, Math.max(15, dtMs)) / 1000;
    const ticks = dt * 12;

    directionTime -= dt;
    if (directionTime <= 0) {
      direction = Math.random() < 0.5 ? -1 : 1;
      directionTime = 1.0 + Math.random() * 2.2;
    }

    velocity += (Math.random() - 0.5) * VOLATILITY * Math.sqrt(ticks);
    velocity += direction * DIRECTION_FORCE * ticks;
    velocity *= Math.pow(0.92, ticks);
    velocity = Math.max(-1.4, Math.min(1.4, velocity));

    logCoeff += velocity * dt * 2.4;

    let c = Math.exp(logCoeff);
    if (c < COEFF_MIN) {
      c = COEFF_MIN;
      logCoeff = Math.log(c);
      velocity = Math.abs(velocity) * 0.7;
    } else if (c > COEFF_MAX) {
      c = COEFF_MAX;
      logCoeff = Math.log(c);
      velocity = -Math.abs(velocity) * 0.7;
    }

    currentCoeff = c;
  }

  // Non-linear scale mapping for smooth vertical movement
  function yForCoeff(coeff) {
    const padTop = 45;
    const padBottom = 45;
    // Calculate dynamic local min/max from visible points for better visual zoom
    let minC = currentCoeff;
    let maxC = currentCoeff;
    const len = points.length;
    const lookback = Math.min(len, 120);
    for (let i = len - lookback; i < len; i++) {
      if (points[i]) {
        if (points[i].coeff < minC) minC = points[i].coeff;
        if (points[i].coeff > maxC) maxC = points[i].coeff;
      }
    }
    // Add margin
    minC = Math.max(1.0, minC * 0.85);
    maxC = maxC * 1.18;
    if (maxC - minC < 0.8) maxC = minC + 0.8;

    const norm = (coeff - minC) / (maxC - minC);
    const clamped = Math.max(0, Math.min(1, norm));
    return padTop + (1 - clamped) * (ch - padTop - padBottom);
  }

  function xForIndex(i, count = points.length) {
    if (count <= 1) return (cw * TRAIL_END_RATIO) / 2;
    return (i / (count - 1)) * cw * TRAIL_END_RATIO;
  }

  function getCandles() {
    if (!points.length) return [];
    const intervalMs = selectedTimeframe * 1000; // 1s interval
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
    // Return last 32 visible 1-second candles
    return candles.slice(-32);
  }

  function drawCandles() {
    const candles = getCandles();
    if (!candles.length) return;

    const count = candles.length;
    const candleWidth = Math.max(6, Math.min(14, (cw * TRAIL_END_RATIO) / Math.max(1, count) * 0.70));

    for (let i = 0; i < count; i++) {
      const c = candles[i];
      const x = (i / (count - 1 || 1)) * cw * TRAIL_END_RATIO;
      const bodyTop = yForCoeff(Math.max(c.open, c.close));
      const bodyBottom = yForCoeff(Math.min(c.open, c.close));
      const bodyHeight = Math.max(2, bodyBottom - bodyTop);
      const wickTop = yForCoeff(c.high);
      const wickBottom = yForCoeff(c.low);
      const rising = c.close >= c.open;
      const color = rising ? "#22c55e" : "#ef4444";

      ctx.save();
      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.2, candleWidth * 0.15);
      ctx.beginPath();
      ctx.moveTo(x, wickTop);
      ctx.lineTo(x, wickBottom);
      ctx.stroke();

      // Candle Body
      ctx.fillStyle = color;
      ctx.shadowColor = rising ? "rgba(34, 197, 94, 0.4)" : "rgba(239, 68, 68, 0.4)";
      ctx.shadowBlur = 6;
      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
      ctx.restore();
    }

    // Glow at live candle
    if (candles.length > 0) {
      const lastCandle = candles[candles.length - 1];
      const lastX = ( (count - 1) / (count - 1 || 1) ) * cw * TRAIL_END_RATIO;
      const lastY = yForCoeff(lastCandle.close);
      ctx.save();
      ctx.beginPath();
      ctx.arc(lastX, lastY, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "#38bdf8";
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.restore();
    }
  }

  // --- Chart Drawing ---
  function drawChart() {
    ctx.clearRect(0, 0, cw, ch);

    if (points.length < 2) return;

    // Candlestick chart with 1s timeframe
    drawCandles();

    // Draw active trade & recent trades overlay ("from where to where it went")
    drawTradesOverlay();
  }

  function drawLineWave() {
    const len = points.length;

    // 1. Draw glowing wave path
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(xForIndex(0), yForCoeff(points[0].coeff));

    for (let i = 1; i < len; i++) {
      const prevX = xForIndex(i - 1);
      const prevY = yForCoeff(points[i - 1].coeff);
      const curX = xForIndex(i);
      const curY = yForCoeff(points[i].coeff);
      const midX = (prevX + curX) / 2;
      const midY = (prevY + curY) / 2;
      ctx.quadraticCurveTo(prevX, prevY, midX, midY);
    }
    const lastX = xForIndex(len - 1);
    const lastY = yForCoeff(points[len - 1].coeff);
    ctx.lineTo(lastX, lastY);

    // Glowing stroke
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3.2;
    ctx.shadowColor = "rgba(56, 189, 248, 0.75)";
    ctx.shadowBlur = 12;
    ctx.stroke();

    // 2. Translucent gradient fill beneath the wave
    ctx.lineTo(lastX, ch);
    ctx.lineTo(xForIndex(0), ch);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, ch);
    grad.addColorStop(0, "rgba(14, 165, 233, 0.22)");
    grad.addColorStop(1, "rgba(2, 7, 19, 0)");
    ctx.fillStyle = grad;
    ctx.shadowBlur = 0;
    ctx.fill();
    ctx.restore();

    // 3. Current price head dot
    ctx.save();
    ctx.beginPath();
    ctx.arc(lastX, lastY, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "#38bdf8";
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.restore();
  }

  function drawCandles() {
    const candles = getCandles();
    if (!candles.length) return;
    const candleWidth = Math.max(5, Math.min(16, (cw * TRAIL_END_RATIO) / Math.max(1, candles.length) * 0.65));

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const x = (i / (candles.length - 1 || 1)) * cw * TRAIL_END_RATIO;
      const bodyTop = yForCoeff(Math.max(c.open, c.close));
      const bodyBottom = yForCoeff(Math.min(c.open, c.close));
      const bodyHeight = Math.max(2, bodyBottom - bodyTop);
      const wickTop = yForCoeff(c.high);
      const wickBottom = yForCoeff(c.low);
      const rising = c.close >= c.open;
      const color = rising ? "#22c55e" : "#ef4444";

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, wickTop);
      ctx.lineTo(x, wickBottom);
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
      ctx.restore();
    }
  }

  // --- Trade Markers & Overlay ---
  // Exactly matching screenshot:
  // - Start Dot
  // - Vertical bar/arrow
  // - Floating countdown badge (e.g. 0.8s)
  // - Horizontal dashed line to current/end point
  // - End circle with vertical drop column
  // - Winning trade in GREEN, Losing trade in RED!
  function drawTradesOverlay() {
    const now = performance.now();

    // Combine active trade + recent trades (for display of path from where to where it went)
    const displayTrades = [];
    if (activeTrade) displayTrades.push(activeTrade);
    recentTrades.forEach(t => {
      if (now - t.finishedAt < 7000) { // keep visible for 7 seconds
        displayTrades.push(t);
      }
    });

    displayTrades.forEach(trade => {
      drawSingleTrade(trade, now);
    });
  }

  function drawSingleTrade(trade, now) {
    const candles = getCandles();
    if (!candles.length) return;

    const count = candles.length;
    // Find candle index for start time
    let startIdx = -1;
    for (let i = count - 1; i >= 0; i--) {
      if (candles[i].time <= trade.startTime) {
        startIdx = i;
        break;
      }
    }
    if (startIdx === -1) {
      startIdx = Math.max(0, count - 1 - Math.floor((now - trade.startTime) / 1000));
    }
    const startX = (startIdx / Math.max(1, count - 1)) * cw * TRAIL_END_RATIO;
    const startY = yForCoeff(trade.startCoeff);

    const isRunning = trade.status === "active";
    let endX, endY, isWinning;

    if (isRunning) {
      endX = ((count - 1) / Math.max(1, count - 1)) * cw * TRAIL_END_RATIO;
      endY = yForCoeff(currentCoeff);
      isWinning = trade.side === "buy" ? (currentCoeff >= trade.startCoeff) : (currentCoeff <= trade.startCoeff);
    } else {
      let endIdx = -1;
      for (let i = count - 1; i >= 0; i--) {
        if (candles[i].time <= trade.endTime) {
          endIdx = i;
          break;
        }
      }
      if (endIdx === -1 || endIdx <= startIdx) {
        endIdx = Math.min(count - 1, startIdx + Math.max(1, Math.round(trade.durationSec)));
      }
      endX = (endIdx / Math.max(1, count - 1)) * cw * TRAIL_END_RATIO;
      endY = yForCoeff(trade.endCoeff);
      isWinning = trade.status === "won";
    }

    // Trade Colors: WIN = Green (#22c55e), LOSS = Red (#ef4444)
    const colorMain = isWinning ? "#22c55e" : "#ef4444";
    const colorBg = isWinning ? "rgba(34, 197, 94, 0.18)" : "rgba(239, 68, 68, 0.18)";

    ctx.save();

    // 1. Translucent Vertical Drop Column at Current/End Point (as in screenshot)
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.fillRect(endX - 10, endY, 20, ch - endY);

    // 2. Horizontal Dashed Reference Line from start to end (as in screenshot)
    ctx.beginPath();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = colorMain;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = colorMain;
    ctx.shadowBlur = 8;
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, startY);
    ctx.stroke();
    ctx.setLineDash([]); // reset dash

    // 3. Vertical Connection Line to end price ("from where to where it went")
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = isWinning ? "rgba(34, 197, 94, 0.7)" : "rgba(239, 68, 68, 0.7)";
    ctx.lineWidth = 1.5;
    ctx.moveTo(endX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 4. Start Point: Solid Dot at Entry (as in screenshot)
    ctx.beginPath();
    ctx.arc(startX, startY, 6, 0, Math.PI * 2);
    ctx.fillStyle = colorMain;
    ctx.shadowColor = colorMain;
    ctx.shadowBlur = 10;
    ctx.fill();

    // 5. Vertical Indicator Bar / Arrow at Entry Point (as in screenshot)
    // Points UP for BUY, DOWN for SELL
    const isBuy = trade.side === "buy";
    const arrowHeight = 36;
    const arrowDir = isBuy ? -1 : 1; // negative = up
    const arrowTipY = startY + arrowDir * arrowHeight;

    // Gradient bar
    const barGrad = ctx.createLinearGradient(startX, startY, startX, arrowTipY);
    barGrad.addColorStop(0, colorMain);
    barGrad.addColorStop(1, "rgba(255, 255, 255, 0.8)");

    ctx.fillStyle = barGrad;
    ctx.beginPath();
    ctx.roundRect(startX - 4, isBuy ? arrowTipY : startY, 8, arrowHeight, 4);
    ctx.fill();

    // Arrowhead at tip
    ctx.beginPath();
    if (isBuy) {
      ctx.moveTo(startX, arrowTipY - 6);
      ctx.lineTo(startX - 6, arrowTipY + 2);
      ctx.lineTo(startX + 6, arrowTipY + 2);
    } else {
      ctx.moveTo(startX, arrowTipY + 6);
      ctx.lineTo(startX - 6, arrowTipY - 2);
      ctx.lineTo(startX + 6, arrowTipY - 2);
    }
    ctx.closePath();
    ctx.fillStyle = colorMain;
    ctx.fill();

    // 6. Floating Badge above arrow (Countdown or Result badge)
    let badgeText = "";
    if (isRunning) {
      const remainingSec = Math.max(0, (trade.endTime - now) / 1000);
      badgeText = remainingSec.toFixed(1) + "s";
    } else {
      badgeText = trade.status === "won" ? `WIN +${money(trade.profit)}` : `LOSS -${money(trade.stake)}`;
    }

    ctx.font = "800 12px 'DM Sans', sans-serif";
    const textWidth = ctx.measureText(badgeText).width;
    const badgeW = textWidth + 14;
    const badgeH = 22;
    const badgeX = startX - badgeW / 2;
    const badgeY = isBuy ? (arrowTipY - 32) : (arrowTipY + 12);

    // Badge Background & Border
    ctx.fillStyle = "rgba(4, 11, 24, 0.9)";
    ctx.strokeStyle = colorMain;
    ctx.lineWidth = 1.8;
    ctx.shadowColor = colorMain;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 11);
    ctx.fill();
    ctx.stroke();

    // Badge Text
    ctx.fillStyle = "#ffffff";
    ctx.shadowBlur = 0;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeText, startX, badgeY + badgeH / 2);

    // 7. End Point: Glowing Circle Dot on the Price Wave
    ctx.beginPath();
    ctx.arc(endX, endY, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = colorMain;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = colorMain;
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  // --- Trade Execution & Resolution ---
  function placeTrade() {
    if (activeTrade) return;

    const stake = currentBet;
    if (stake > balance) {
      alert("Insufficient balance to place bet!");
      return;
    }

    // Deduct stake
    balance -= stake;
    save();
    updateBalanceDisplay();

    const now = performance.now();
    activeTrade = {
      id: nextBetId++,
      side: selectedSide,
      stake: stake,
      startCoeff: currentCoeff,
      startTime: now,
      durationSec: tradeDurationSec,
      endTime: now + tradeDurationSec * 1000,
      status: "active",
      endCoeff: null,
      profit: 0
    };

    // Update My Bets top UI
    updateMyBetsTopBar();
    updateButtonsState();
  }

  function checkTradeCountdown(now) {
    if (!activeTrade) return;

    if (now >= activeTrade.endTime) {
      resolveTrade(activeTrade);
    } else {
      updateMyBetsTopBar();
    }
  }

  function resolveTrade(trade) {
    trade.endCoeff = currentCoeff;
    const isWon = trade.side === "buy" ? (trade.endCoeff > trade.startCoeff) : (trade.endCoeff < trade.startCoeff);

    trade.finishedAt = performance.now();

    if (isWon) {
      // Standard binary payout: 1.95x stake (stake + 95% profit)
      const payout = Math.round(trade.stake * 1.95 * 100) / 100;
      const profit = Math.round((payout - trade.stake) * 100) / 100;
      balance += payout;
      trade.status = "won";
      trade.payout = payout;
      trade.profit = profit;
    } else {
      trade.status = "lost";
      trade.payout = 0;
      trade.profit = -trade.stake;
    }

    save();
    updateBalanceDisplay();

    // Push to recent trades to keep visual path on screen
    recentTrades.unshift(trade);
    if (recentTrades.length > 5) recentTrades.pop();

    // Record into history
    history.unshift({
      id: trade.id,
      side: trade.side,
      stake: trade.stake,
      startCoeff: trade.startCoeff,
      endCoeff: trade.endCoeff,
      profit: trade.profit,
      status: trade.status,
      time: Date.now()
    });
    if (history.length > 40) history.pop();
    save();

    // Update history badge count
    if (historyCountEl) historyCountEl.textContent = String(history.length);
    renderHistoryDrawer();

    // Update My Bets display to show result
    activeTrade = null;
    showFinishedTradeInMyBets(trade);
    updateButtonsState();
  }

  function updateMyBetsTopBar() {
    if (!activeTrade) return;

    const now = performance.now();
    const remaining = Math.max(0, (activeTrade.endTime - now) / 1000);

    if (myBetTimerEl) {
      myBetTimerEl.innerHTML = `<span class="timer-badge active">(${remaining.toFixed(1)})</span>`;
    }
    if (myBetStakeEl) {
      myBetStakeEl.textContent = String(activeTrade.stake);
    }
    if (myBetXStartEl) {
      myBetXStartEl.textContent = activeTrade.startCoeff.toFixed(2) + "x";
    }
    if (myBetXEndEl) {
      myBetXEndEl.textContent = "-";
      myBetXEndEl.className = "mb-td";
    }
  }

  function showFinishedTradeInMyBets(trade) {
    if (myBetTimerEl) {
      const isWon = trade.status === "won";
      const sign = isWon ? "+" : "";
      myBetTimerEl.innerHTML = `<span class="timer-badge ${isWon ? 'win' : 'lose'}">${isWon ? 'WIN' : 'LOSS'} (${sign}${money(trade.profit)})</span>`;
    }
    if (myBetStakeEl) {
      myBetStakeEl.textContent = String(trade.stake);
    }
    if (myBetXStartEl) {
      myBetXStartEl.textContent = trade.startCoeff.toFixed(2) + "x";
    }
    if (myBetXEndEl) {
      const isWon = trade.status === "won";
      myBetXEndEl.textContent = trade.endCoeff.toFixed(2) + "x";
      myBetXEndEl.className = "mb-td " + (isWon ? "win" : "lose");
    }
  }

  function updateButtonsState() {
    const isBusy = activeTrade !== null;
    if (placeBetBtn) {
      placeBetBtn.disabled = isBusy;
      if (isBusy) {
        placeBetBtn.textContent = "IN TRADE...";
      } else {
        placeBetBtn.textContent = "PLACE BET";
      }
    }
  }

  function renderHistoryDrawer() {
    if (!historyListEl) return;
    historyListEl.innerHTML = "";

    if (!history.length) {
      historyListEl.innerHTML = "<div style='color:#64748b; text-align:center; padding:20px;'>No trades recorded yet</div>";
      return;
    }

    history.forEach(item => {
      const row = document.createElement("div");
      row.className = "history-item-row";

      const isWon = item.status === "won";
      const sign = isWon ? "+" : "";

      row.innerHTML = `
        <div class="history-left">
          <span class="history-side-tag ${item.side}">${item.side.toUpperCase()} ${money(item.stake)} ETB</span>
          <span class="history-coords">${item.startCoeff.toFixed(2)}x &rarr; ${item.endCoeff.toFixed(2)}x</span>
        </div>
        <div class="history-right">
          <span class="history-payout ${isWon ? 'win' : 'lose'}">${sign}${money(item.profit)} ETB</span>
          <span style="font-size:10px; color:#64748b;">${formatTime(item.time)}</span>
        </div>
      `;
      historyListEl.appendChild(row);
    });
  }

  // --- Bindings ---
  function bind() {
    // Minus / Plus Stepper
    if (minusBtn) {
      minusBtn.addEventListener("click", () => {
        setBet(currentBet - 1);
      });
    }
    if (plusBtn) {
      plusBtn.addEventListener("click", () => {
        setBet(currentBet + 1);
      });
    }

    // ALL IN / X2
    if (allInBtn) {
      allInBtn.addEventListener("click", () => {
        setBet(balance);
      });
    }
    if (x2Btn) {
      x2Btn.addEventListener("click", () => {
        setBet(currentBet * 2);
      });
    }

    // Direction Toggle (BUY / SELL)
    if (sideBuyBtn) {
      sideBuyBtn.addEventListener("click", () => {
        selectedSide = "buy";
        sideBuyBtn.classList.add("active");
        sideSellBtn.classList.remove("active");
        placeBetBtn.className = "inf-place-bet-btn buy-mode";
      });
    }
    if (sideSellBtn) {
      sideSellBtn.addEventListener("click", () => {
        selectedSide = "sell";
        sideSellBtn.classList.add("active");
        sideBuyBtn.classList.remove("active");
        placeBetBtn.className = "inf-place-bet-btn sell-mode";
      });
    }

    // Place Bet Button
    if (placeBetBtn) {
      placeBetBtn.addEventListener("click", placeTrade);
    }

    // History Toggle & Close
    if (historyToggleBtn) {
      historyToggleBtn.addEventListener("click", () => {
        historyDrawer.classList.toggle("hidden");
        renderHistoryDrawer();
      });
    }
    if (closeHistoryBtn) {
      closeHistoryBtn.addEventListener("click", () => {
        historyDrawer.classList.add("hidden");
      });
    }

    // Options dropdown
    if (chartOptionsBtn) {
      chartOptionsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        optionsDropdown.classList.toggle("hidden");
      });
    }
    document.addEventListener("click", (e) => {
      if (optionsDropdown && !optionsDropdown.contains(e.target) && e.target !== chartOptionsBtn) {
        optionsDropdown.classList.add("hidden");
      }
    });

    // Chart type buttons (Line / Candles)
    if (btnModeLine) {
      btnModeLine.addEventListener("click", () => {
        chartMode = "line";
        btnModeLine.classList.add("active");
        btnModeCandles.classList.remove("active");
        optionsDropdown.classList.add("hidden");
      });
    }
    if (btnModeCandles) {
      btnModeCandles.addEventListener("click", () => {
        chartMode = "candles";
        btnModeCandles.classList.add("active");
        btnModeLine.classList.remove("active");
        optionsDropdown.classList.add("hidden");
      });
    }

    // Timeframe buttons
    document.querySelectorAll("[data-timeframe]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-timeframe]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        selectedTimeframe = Number(btn.dataset.timeframe) || 1;
        optionsDropdown.classList.add("hidden");
      });
    });

    // Duration buttons (3s, 5s, 10s)
    document.querySelectorAll("[data-dur]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-dur]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        tradeDurationSec = Number(btn.dataset.dur) || 5;
        optionsDropdown.classList.add("hidden");
      });
    });

    window.addEventListener("resize", () => {
      resizeCanvas();
      drawChart();
    });
  }

  function seedPoints() {
    const now = performance.now();
    points = [];
    let t = now - 50 * 1000; // 50 seconds of history for 1s candlesticks
    for (let i = 0; i < MAX_POINTS; i++) {
      updateCoeff(TICK_MS);
      pushPoint(t);
      t += TICK_MS;
    }
  }

  function tick(now) {
    const dt = now - lastTick;
    if (dt >= TICK_MS) {
      lastTick = now;
      updateCoeff(dt);
      pushPoint(now);

      if (coeffEl) {
        coeffEl.textContent = currentCoeff.toFixed(2) + "x";
      }

      checkTradeCountdown(now);
      drawChart();
    }
    requestAnimationFrame(tick);
  }

  // --- Initialize ---
  load();
  setBet(6);
  updateBalanceDisplay();
  if (historyCountEl) historyCountEl.textContent = String(history.length);
  resizeCanvas();
  seedPoints();
  bind();

  if (window.HabeshaWallet) {
    window.HabeshaWallet.subscribe((newBal) => {
      balance = newBal;
      updateBalanceDisplay();
    });
  }

  requestAnimationFrame(tick);
})();
