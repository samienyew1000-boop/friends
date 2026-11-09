(function () {
  const STORAGE = "fast_keno_v1";
  const MIN_BET = 1;
  const MAX_BET = 10000;
  const START_BAL = 5000;
  const BET_MS = 60000;
  const BALL_MS = 380;
  const DRAW_MS = 20 * BALL_MS + 400;
  const RESULT_MS = 4500;
  const CYCLE = BET_MS + DRAW_MS + RESULT_MS;
  const NAMES = ["7****9", "2****1", "8****c", "5****5", "0****f", "1****t", "c****6", "b****7", "a****2", "d****f", "3****8", "9****k"];

  const PAYS = {
    1: { 1: 3.5 },
    2: { 1: 1, 2: 10 },
    3: { 2: 2, 3: 50 },
    4: { 2: 1.5, 3: 10, 4: 80 },
    5: { 2: 1, 3: 3, 4: 30, 5: 150 },
    6: { 3: 2, 4: 15, 5: 60, 6: 500 },
    7: { 0: 1, 3: 2, 4: 4, 5: 20, 6: 80, 7: 1000 },
    8: { 0: 1, 4: 5, 5: 15, 6: 50, 7: 200, 8: 2000 },
    9: { 0: 2, 4: 2, 5: 10, 6: 25, 7: 125, 8: 1000, 9: 5000 },
    10: { 0: 2, 5: 5, 6: 30, 7: 100, 8: 300, 9: 2000, 10: 10000 },
  };

  const $ = (id) => document.getElementById(id);
  const board = $("board");
  const timerEl = $("timer");
  const betAmt = $("bet-amt");
  const betBtn = $("bet-btn");
  const liveList = $("live-list");
  const rightPanel = $("right-panel");
  const cells = [];

  let balance = START_BAL;
  let picks = [];
  let myTicket = null;
  let myHistory = [];
  let leaders = [];
  let results = [];
  let freq = Array(81).fill(0);
  let liveTickets = [];
  let feed = "all";
  let leftTab = "game";
  let rightTab = "results";
  let lastRoundId = -1;
  let lastDrawnShown = 0;
  let overlayShownFor = -1;

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function roundMeta(now = Date.now()) {
    const id = Math.floor(now / CYCLE);
    const t = now % CYCLE;
    let phase = "betting";
    let remain = BET_MS - t;
    if (t >= BET_MS && t < BET_MS + DRAW_MS) {
      phase = "draw";
      remain = BET_MS + DRAW_MS - t;
    } else if (t >= BET_MS + DRAW_MS) {
      phase = "result";
      remain = CYCLE - t;
    }
    return { id, phase, remain, elapsed: t };
  }

  function drawFor(id) {
    const rnd = mulberry32((id * 2654435761) >>> 0);
    const pool = Array.from({ length: 80 }, (_, i) => i + 1);
    for (let i = 0; i < 20; i++) {
      const j = i + Math.floor(rnd() * (80 - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 20);
  }

  function hashFor(id) {
    const nums = drawFor(id).join(",");
    let h = 0x811c9dc5;
    const s = id + "_numbers_" + nums + "_Keno";
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (id.toString(16) + (h >>> 0).toString(16).padStart(8, "0")).toUpperCase();
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE) || "{}");
      if (typeof raw.balance === "number") balance = raw.balance;
      if (Array.isArray(raw.myHistory)) myHistory = raw.myHistory;
      if (Array.isArray(raw.leaders)) leaders = raw.leaders;
      if (Array.isArray(raw.results)) results = raw.results;
      if (Array.isArray(raw.freq) && raw.freq.length === 81) freq = raw.freq;
      if (raw.myTicket) myTicket = raw.myTicket;
    } catch { /* ignore */ }
    if (window.HabeshaWallet) {
      balance = window.HabeshaWallet.get();
    }
  }

  function save() {
    if (window.HabeshaWallet) {
      window.HabeshaWallet.set(balance);
    }
    localStorage.setItem(STORAGE, JSON.stringify({ balance, myHistory, leaders, results, freq, myTicket }));
  }

  function formatMoney(n) {
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function odds(spots, hits) {
    const row = PAYS[spots];
    return row && row[hits] != null ? row[hits] : 0;
  }

  function maxOdds(spots) {
    const row = PAYS[spots];
    if (!row) return 0;
    return Math.max(...Object.values(row));
  }

  function renderBalance() {
    $("balance").textContent = formatMoney(balance);
  }

  function buildBoard() {
    board.replaceChildren();
    for (let n = 1; n <= 80; n++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cell";
      btn.textContent = n;
      btn.dataset.n = String(n);
      btn.onclick = () => togglePick(n);
      board.appendChild(btn);
      cells[n] = btn;
    }
  }

  function hotCold() {
    const ranked = Array.from({ length: 80 }, (_, i) => i + 1).sort((a, b) => freq[b] - freq[a] || a - b);
    const hot = new Set(ranked.slice(0, 10));
    const cold = new Set(ranked.slice(-10));
    cells.forEach((btn, n) => {
      if (!btn) return;
      btn.classList.toggle("hot", hot.has(n));
      btn.classList.toggle("cold", cold.has(n));
    });
  }

  function togglePick(n) {
    const { phase } = roundMeta();
    if (phase !== "betting" || myTicket) return;
    const i = picks.indexOf(n);
    if (i >= 0) picks.splice(i, 1);
    else if (picks.length < 10) picks.push(n);
    picks.sort((a, b) => a - b);
    paintPicks();
    updateTicketCard();
    updateBetBtn();
  }

  function paintPicks() {
    const { phase } = roundMeta();
    const drawn = phase === "betting" ? [] : drawFor(roundMeta().id);
    const shown = phase === "draw" ? Math.min(20, Math.floor((roundMeta().elapsed - BET_MS) / BALL_MS)) : drawn.length;
    const visible = new Set(drawn.slice(0, shown));
    cells.forEach((btn, n) => {
      if (!btn) return;
      const sel = picks.includes(n);
      btn.classList.toggle("sel", sel);
      btn.classList.toggle("drawn", visible.has(n));
      btn.classList.toggle("hit", sel && visible.has(n));
    });
  }

  function updateTicketCard() {
    const { phase } = roundMeta();
    const ticket = $("ticket");
    const empty = $("ticket-empty");
    const sel = $("ticket-sel");
    const draw = $("draw-stage");
    ticket.classList.toggle("has-picks", picks.length > 0 && phase === "betting");
    ticket.classList.toggle("is-draw", phase !== "betting");

    if (phase !== "betting") {
      empty.classList.add("hidden");
      sel.classList.add("hidden");
      draw.classList.remove("hidden");
      return;
    }
    draw.classList.add("hidden");
    if (!picks.length) {
      empty.classList.remove("hidden");
      sel.classList.add("hidden");
      return;
    }
    empty.classList.add("hidden");
    sel.classList.remove("hidden");
    $("picked-count").textContent = picks.length;
    const amt = clampBet();
    $("possible-win").textContent = "Possible win " + formatMoney(amt * maxOdds(picks.length));
    const row = PAYS[picks.length] || {};
    const matches = Object.keys(row).map(Number).sort((a, b) => a - b);
    $("pay-match").innerHTML = "<span>Match</span>" + matches.map((m) => `<span>${m}</span>`).join("");
    $("pay-odds").innerHTML = "<span>Pays</span>" + matches.map((m) => `<span>${row[m]}x</span>`).join("");
    $("picked-row").innerHTML = Array.from({ length: 10 }, (_, i) => {
      const n = picks[i];
      return n ? `<b class="on">${n}</b>` : "<b></b>";
    }).join("");
  }

  function clampBet() {
    let v = Number(betAmt.value);
    if (!Number.isFinite(v)) v = MIN_BET;
    v = Math.min(MAX_BET, Math.max(MIN_BET, Math.round(v)));
    betAmt.value = String(v);
    return v;
  }

  function updateBetBtn() {
    const { phase } = roundMeta();
    betBtn.classList.remove("on", "wait", "ok");
    if (phase !== "betting") {
      betBtn.classList.add("wait");
      return;
    }
    if (myTicket && myTicket.roundId === roundMeta().id) {
      betBtn.classList.add("ok");
      return;
    }
    if (picks.length) betBtn.classList.add("on");
  }

  function placeBet() {
    const { phase, id } = roundMeta();
    if (phase !== "betting" || !picks.length || (myTicket && myTicket.roundId === id)) return;
    const amt = clampBet();
    if (amt > balance) return;
    balance -= amt;
    myTicket = { roundId: id, numbers: [...picks], amount: amt };
    liveTickets.unshift({
      user: "You",
      numbers: [...picks],
      amount: amt,
      mine: true,
      status: "Waiting",
    });
    renderBalance();
    save();
    updateBetBtn();
    renderLive();
  }

  function settleTicket(id, drawn) {
    if (!myTicket || myTicket.roundId !== id) return;
    const hits = myTicket.numbers.filter((n) => drawn.includes(n)).length;
    const mult = odds(myTicket.numbers.length, hits);
    const win = myTicket.amount * mult;
    if (win > 0) {
      balance += win;
      leaders.unshift({ user: "You", win, hits, spots: myTicket.numbers.length });
      if (leaders.length > 20) leaders.pop();
    }
    myHistory.unshift({
      roundId: id,
      numbers: myTicket.numbers,
      drawn,
      hits,
      amount: myTicket.amount,
      payout: win,
    });
    if (myHistory.length > 40) myHistory.pop();
    liveTickets.forEach((t) => {
      if (t.mine && t.status === "Waiting") {
        const h = t.numbers.filter((n) => drawn.includes(n)).length;
        const p = odds(t.numbers.length, h) * t.amount;
        t.status = p > 0 ? "+" + formatMoney(p) : "0.00";
        t.win = p > 0;
        t.drawn = drawn;
      }
    });
    showResult(win, hits, myTicket.numbers.length);
    myTicket = null;
    renderBalance();
    save();
  }

  function showResult(win, hits, spots) {
    const card = $("result-card");
    $("result-overlay").classList.remove("hidden");
    if (win > 0) {
      card.classList.remove("lose");
      $("result-title").textContent = "WIN";
      $("result-detail").textContent = `${hits} / ${spots}  ·  +${formatMoney(win)} ETB`;
    } else {
      card.classList.add("lose");
      $("result-title").textContent = "TRY AGAIN";
      $("result-detail").textContent = `${hits} / ${spots} matched`;
    }
  }

  function seedLive(id) {
    const rnd = mulberry32((id * 97) >>> 0);
    const count = 12 + Math.floor(rnd() * 10);
    liveTickets = [];
    for (let i = 0; i < count; i++) {
      const spots = 1 + Math.floor(rnd() * 10);
      const nums = [];
      while (nums.length < spots) {
        const n = 1 + Math.floor(rnd() * 80);
        if (!nums.includes(n)) nums.push(n);
      }
      nums.sort((a, b) => a - b);
      liveTickets.push({
        user: NAMES[Math.floor(rnd() * NAMES.length)],
        numbers: nums,
        amount: [1, 2, 5, 10, 20, 50, 100, 500][Math.floor(rnd() * 8)],
        mine: false,
        status: "Waiting",
      });
    }
  }

  function settleDemos(drawn) {
    liveTickets.forEach((t) => {
      if (t.mine) return;
      const h = t.numbers.filter((n) => drawn.includes(n)).length;
      const p = odds(t.numbers.length, h) * t.amount;
      t.status = p > 0 ? "+" + formatMoney(p) : "0.00";
      t.win = p > 0;
      t.drawn = drawn;
    });
  }

  function renderLive() {
    const histMode = leftTab === "history";
    let rows = histMode ? myHistory.map((h) => ({
      user: "You",
      numbers: h.numbers,
      amount: h.amount,
      mine: true,
      status: h.payout > 0 ? "+" + formatMoney(h.payout) : "0.00",
      win: h.payout > 0,
      drawn: h.drawn,
    })) : liveTickets;

    if (!histMode && feed === "tickets") rows = rows.filter((r) => r.mine);
    if (!histMode && feed === "bets") rows = rows.filter((r) => r.mine);

    $("count-all").textContent = liveTickets.length;
    $("count-tickets").textContent = liveTickets.filter((t) => t.mine).length;
    $("count-bets").textContent = myHistory.length;

    liveList.innerHTML = rows.map((t) => {
      const drawn = t.drawn || [];
      return `<article class="ticket-row${t.mine ? " mine" : ""}">
        <div class="who"><span>${t.user}</span><span>Bet ${formatMoney(t.amount)}</span></div>
        <div class="nums">${t.numbers.map((n) => `<span class="n${drawn.includes(n) ? " hit" : ""}">${n}</span>`).join("")}</div>
        <div class="st${t.win ? " win" : ""}" style="margin-top:4px;text-align:right">${t.status}</div>
      </article>`;
    }).join("") || `<p style="opacity:.5;padding:12px">No tickets yet</p>`;
  }

  function renderRight() {
    const { id, phase } = roundMeta();
    if (rightTab === "stats") {
      const max = Math.max(1, ...freq.slice(1));
      const order = Array.from({ length: 80 }, (_, i) => i + 1).sort((a, b) => freq[b] - freq[a]);
      rightPanel.innerHTML = `<p style="font-size:.75rem;color:#789588;padding:4px 0 8px">Last 100 rounds</p>` +
        order.map((n) => {
          const pct = (freq[n] / max) * 100;
          return `<div class="stat-row"><span class="num">${n}</span><span class="bar"><i style="width:${pct}%"></i></span><span class="val">${freq[n]}</span></div>`;
        }).join("");
      return;
    }
    if (rightTab === "leaders") {
      rightPanel.innerHTML = leaders.map((l, i) =>
        `<article class="result-row"><div class="meta"><span>#${i + 1} ${l.user}</span><span>${l.hits}/${l.spots}</span></div><div class="combo">+${formatMoney(l.win)} ETB</div></article>`
      ).join("") || `<p style="opacity:.5;padding:12px">No winners yet</p>`;
      return;
    }
    const current = phase === "betting"
      ? `<article class="result-row wait"><div class="meta"><span>${id}</span><span>now</span></div><div class="combo">WAIT</div></article>`
      : "";
    rightPanel.innerHTML = current + results.map((r) =>
      `<article class="result-row"><div class="meta"><span>${r.id}</span><span>${r.time}</span></div><div class="combo">${r.nums.join(" ")}</div></article>`
    ).join("");
  }

  function renderDrawBalls(drawn, count) {
    $("drawn-count").textContent = String(count).padStart(2, "0");
    const hits = new Set(picks);
    $("draw-balls").innerHTML = drawn.slice(0, count).map((n) =>
      `<span class="kball${hits.has(n) ? " hit" : ""}">${n}</span>`
    ).join("");
  }

  function onNewRound(id) {
    lastRoundId = id;
    lastDrawnShown = 0;
    overlayShownFor = -1;
    $("result-overlay").classList.add("hidden");
    $("round-hash").textContent = "ID: " + hashFor(id).slice(0, 10);
    seedLive(id);
    if (myTicket && myTicket.roundId !== id) myTicket = null;
    updateTicketCard();
    updateBetBtn();
    renderLive();
    renderRight();
    paintPicks();
  }

  function finishRound(id) {
    if (results[0] && results[0].id === id) {
      settleTicket(id, drawFor(id));
      return;
    }
    const drawn = drawFor(id);
    drawn.forEach((n) => { freq[n] += 1; });
    const total = freq.slice(1).reduce((s, n) => s + n, 0);
    if (total > 2000) freq = freq.map((n, i) => (i ? Math.max(0, Math.round(n * 0.7)) : 0));
    results.unshift({
      id,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      nums: [...drawn].sort((a, b) => a - b),
    });
    if (results.length > 40) results.pop();
    settleDemos(drawn);
    settleTicket(id, drawn);
    hotCold();
    save();
    renderLive();
    renderRight();
  }

  function tick() {
    const meta = roundMeta();
    if (meta.id !== lastRoundId) onNewRound(meta.id);

    if (meta.phase === "betting") {
      const sec = Math.max(0, Math.ceil(meta.remain / 1000));
      timerEl.textContent = "00:" + String(sec).padStart(2, "0");
      lastDrawnShown = 0;
    } else {
      timerEl.textContent = "00:00";
      updateTicketCard();
      updateBetBtn();
      const drawn = drawFor(meta.id);
      const count = meta.phase === "draw"
        ? Math.min(20, Math.max(0, Math.floor((meta.elapsed - BET_MS) / BALL_MS)))
        : 20;
      if (count !== lastDrawnShown) {
        lastDrawnShown = count;
        renderDrawBalls(drawn, count);
        paintPicks();
      }
      if (meta.phase === "result" && overlayShownFor !== meta.id) {
        overlayShownFor = meta.id;
        finishRound(meta.id);
      }
    }
    requestAnimationFrame(tick);
  }

  function buildPaytable() {
    let html = "<table class='pay-table'><thead><tr><th>Hit \\ Pick</th>";
    for (let p = 1; p <= 10; p++) html += `<th>${p}</th>`;
    html += "</tr></thead><tbody>";
    for (let h = 0; h <= 10; h++) {
      html += `<tr><th>${h}</th>`;
      for (let p = 1; p <= 10; p++) {
        const v = PAYS[p] && PAYS[p][h];
        html += `<td>${v != null ? v + "x" : ""}</td>`;
      }
      html += "</tr>";
    }
    $("full-paytable").innerHTML = html + "</tbody></table>";
  }

  function bind() {
    $("bet-minus").onclick = () => { betAmt.value = Math.max(MIN_BET, clampBet() - 1); updateTicketCard(); };
    $("bet-plus").onclick = () => { betAmt.value = Math.min(MAX_BET, clampBet() + 1); updateTicketCard(); };
    $("bet-x2").onclick = () => { betAmt.value = Math.min(MAX_BET, clampBet() * 2); updateTicketCard(); };
    $("bet-max").onclick = () => { betAmt.value = Math.min(MAX_BET, Math.max(MIN_BET, Math.floor(balance))); updateTicketCard(); };
    betAmt.addEventListener("change", () => { clampBet(); updateTicketCard(); });
    betBtn.onclick = placeBet;
    $("btn-menu").onclick = () => $("menu").classList.remove("hidden");
    $("btn-help").onclick = () => $("menu").classList.remove("hidden");
    $("menu-close").onclick = () => $("menu").classList.add("hidden");
    $("result-close").onclick = () => $("result-overlay").classList.add("hidden");

    document.querySelectorAll("[data-left]").forEach((btn) => {
      btn.onclick = () => {
        leftTab = btn.dataset.left;
        document.querySelectorAll("[data-left]").forEach((b) => b.classList.toggle("on", b === btn));
        renderLive();
      };
    });
    document.querySelectorAll("[data-feed]").forEach((btn) => {
      btn.onclick = () => {
        feed = btn.dataset.feed;
        document.querySelectorAll("[data-feed]").forEach((b) => b.classList.toggle("on", b === btn));
        renderLive();
      };
    });
    document.querySelectorAll("[data-right]").forEach((btn) => {
      btn.onclick = () => {
        rightTab = btn.dataset.right;
        document.querySelectorAll("[data-right]").forEach((b) => b.classList.toggle("on", b === btn));
        renderRight();
      };
    });
    document.querySelectorAll(".m-tab").forEach((btn) => {
      btn.onclick = () => {
        document.querySelectorAll(".m-tab").forEach((b) => b.classList.toggle("active", b === btn));
        const app = document.querySelector(".app");
        app.classList.toggle("show-live", btn.dataset.pane === "live");
        app.classList.toggle("show-results", btn.dataset.pane === "results");
      };
    });
  }

  load();
  if (!results.length) {
    const nowId = roundMeta().id;
    for (let i = 1; i <= 12; i++) {
      const rid = nowId - i;
      const nums = [...drawFor(rid)].sort((a, b) => a - b);
      nums.forEach((n) => { freq[n] += 1; });
      results.push({ id: rid, time: new Date(rid * CYCLE).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }), nums });
    }
  }
  if (myTicket && myTicket.roundId === roundMeta().id) {
    picks = [...myTicket.numbers];
  } else if (myTicket && myTicket.roundId !== roundMeta().id && roundMeta().phase === "betting") {
    myTicket = null;
  }
  buildBoard();
  buildPaytable();
  bind();
  renderBalance();
  if (window.HabeshaWallet) {
    window.HabeshaWallet.subscribe((newBal) => {
      balance = newBal;
      renderBalance();
    });
  }
  hotCold();
  onNewRound(roundMeta().id);
  requestAnimationFrame(tick);
})();
