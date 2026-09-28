(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const el = {
    balance: document.getElementById("balance"),
    betInput: document.getElementById("bet-input"),
    btnGo: document.getElementById("btn-go"),
    btnCashout: document.getElementById("btn-cashout"),
    cashoutAmount: document.getElementById("cashout-amount"),
    toast: document.getElementById("toast"),
    failChance: document.getElementById("fail-chance"),
    practice: document.getElementById("practice-toggle"),
    autoToggle: document.getElementById("auto-toggle"),
    autoMult: document.getElementById("auto-mult"),
    ticker: document.getElementById("win-ticker"),
    online: document.getElementById("online-count"),
    diffBtns: [...document.querySelectorAll(".diff-btn")],
  };

  const ASSET = "asset/sprites/";
  const IMAGE_KEYS = {
    sidewalk: "sidewalk.png",
    lamp: "lamp.png",
    manhole: "manhole.png",
    chicken: "chicken.png",
    taxi: "taxi.png",
    police: "police.png",
    icecream: "icecream.png",
    icecream2: "icecream2.png",
    firetruck: "firetruck.png",
    delivery: "delivery.png",
    truck: "truck.png",
    car: "car.png",
    banner: "banner.png",
  };

  const images = {};
  const vehicleKeys = ["taxi", "police", "icecream", "firetruck", "delivery", "truck", "car"];

  const DIFFICULTIES = {
    // Reference-style progression: Easy starts at the visible 1.85x tile.
    easy: { steps: 24, survival: 0.96, start: 1.85, growth: 1.07, label: "Easy" },
    medium: { steps: 22, survival: 0.88, start: 1.45, growth: 1.09, label: "Medium" },
    hard: { steps: 20, survival: 0.8, start: 1.2, growth: 1.12, label: "Hard" },
    hardcore: { steps: 15, survival: 0.6, start: 1.05, growth: 1.18, label: "Hardcore" },
  };

  const MIN_BET = 1;
  const MAX_BET = 1000;
  const SIDEWALK_W = 210;
  const LANE_W = 108;
  const ROAD_TOP = 36;
  const ROAD_BOTTOM = 484;
  const CHICKEN_Y = 268;
  const CAR_W = 52;

  function buildLadder(steps, survival, start = 1.85, growth = 1.07) {
    const ladder = [];
    let multiplier = start;
    for (let i = 1; i <= steps; i++) {
      ladder.push(Math.max(1.01, Math.round(multiplier * 100) / 100));
      multiplier *= growth;
    }
    return ladder;
  }

  const state = {
    realBalance: 1000,
    practiceBalance: 5000,
    practice: false,
    bet: 50,
    difficulty: "easy",
    ladder: buildLadder(24, 0.96, 1.85, 1.07),
    phase: "idle",
    step: 0,
    chickenX: 108,
    hopY: 0,
    fallY: 0,
    fallRotation: 0,
    pendingBust: false,
    cameraX: 0,
    cars: [],
    particles: [],
    flash: 0,
    lastTs: 0,
    soundOn: true,
    favorite: false,
  };

  const audio = {
    ctx: null,
    ensure() {
      if (!audio.ctx) audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.ctx.state === "suspended") audio.ctx.resume();
      return audio.ctx;
    },
    beep(freq, dur, type = "square", gain = 0.05) {
      if (!state.soundOn) return;
      const c = audio.ensure();
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(gain, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g);
      g.connect(c.destination);
      o.start();
      o.stop(c.currentTime + dur);
    },
    noise(dur = 0.35) {
      if (!state.soundOn) return;
      const c = audio.ensure();
      const n = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
      const d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = c.createBufferSource();
      const g = c.createGain();
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 900;
      src.buffer = n;
      g.gain.value = 0.18;
      src.connect(f);
      f.connect(g);
      g.connect(c.destination);
      src.start();
    },
  };

  function sfx(kind) {
    if (kind === "click") audio.beep(520, 0.06, "square", 0.03);
    if (kind === "start") {
      audio.beep(330, 0.08, "triangle", 0.05);
      setTimeout(() => audio.beep(440, 0.1, "triangle", 0.05), 80);
    }
    if (kind === "hop") audio.beep(620, 0.09, "square", 0.04);
    if (kind === "safe") audio.beep(880, 0.12, "triangle", 0.05);
    if (kind === "win") {
      audio.beep(523, 0.12, "triangle", 0.06);
      setTimeout(() => audio.beep(659, 0.12, "triangle", 0.06), 90);
      setTimeout(() => audio.beep(784, 0.2, "triangle", 0.07), 180);
    }
    if (kind === "bust") {
      audio.noise(0.4);
      audio.beep(140, 0.35, "sawtooth", 0.07);
    }
  }

  function balance() {
    if (state.practice) return state.practiceBalance;
    return typeof window.HabeshaWallet !== "undefined" ? window.HabeshaWallet.get() : state.realBalance;
  }

  function setBalance(v) {
    if (state.practice) {
      state.practiceBalance = v;
    } else {
      state.realBalance = v;
      if (typeof window.HabeshaWallet !== "undefined") {
        window.HabeshaWallet.set(v);
      }
    }
  }

  function money(n) {
    return (Math.round(n * 100) / 100).toFixed(2);
  }

  function currentMult() {
    return multiplierForStep(state.step);
  }

  function potentialWin() {
    return state.bet * currentMult();
  }

  function laneCenterX(index) {
    return SIDEWALK_W + LANE_W * index + LANE_W / 2;
  }

  function multiplierForStep(step) {
    if (step <= 0) return 1;
    const d = DIFFICULTIES[state.difficulty];
    return Math.max(1.01, Math.round(d.start * Math.pow(d.growth, step - 1) * 100) / 100);
  }

  function showToast(text, type = "") {
    el.toast.hidden = false;
    el.toast.textContent = text;
    el.toast.className = `toast ${type}`;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      el.toast.hidden = true;
    }, 1600);
  }

  function inRound() {
    return state.phase === "playing" || state.phase === "animating";
  }

  function syncUi() {
    el.balance.textContent = money(balance());
    el.betInput.value = String(state.bet);
    el.cashoutAmount.textContent = `${money(potentialWin())} ETB`;
    el.failChance.textContent = `${Math.round((1 - DIFFICULTIES[state.difficulty].survival) * 100)}%`;

    const playing = state.phase === "playing";
    el.btnCashout.disabled = !(playing && state.step > 0);
    el.btnGo.disabled = state.phase === "animating" || (playing && state.step >= state.ladder.length);
    el.btnGo.textContent = playing || state.phase === "animating" ? "ቀጥል" : "ተጫወት";

    const lock = inRound();
    el.betInput.disabled = lock;
    el.autoMult.disabled = lock;
    el.practice.disabled = lock;
    document.getElementById("bet-min").disabled = lock;
    document.getElementById("bet-max").disabled = lock;
    document.querySelectorAll("[data-bet]").forEach((b) => {
      b.disabled = lock;
      b.classList.toggle("is-on", Number(b.dataset.bet) === state.bet);
    });
    el.diffBtns.forEach((btn) => {
      btn.disabled = lock;
      btn.classList.toggle("is-active", btn.dataset.diff === state.difficulty);
    });
  }

  function clampBet(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return state.bet;
    return Math.min(MAX_BET, Math.max(MIN_BET, Math.round(n)));
  }

  function trafficForDifficulty() {
    const d = state.difficulty;
    if (d === "hardcore") return { minCars: 2, extra: 1, speed: [1.8, 2.7] };
    if (d === "hard") return { minCars: 2, extra: 0, speed: [1.35, 2.0] };
    if (d === "medium") return { minCars: 1, extra: 1, speed: [1.05, 1.6] };
    return { minCars: 1, extra: 0, speed: [0.7, 1.15] };
  }

  function spawnCars() {
    state.cars = [];
    const lanes = state.ladder.length;
    const roadH = ROAD_BOTTOM - ROAD_TOP;
    const traffic = trafficForDifficulty();
    for (let i = 0; i < lanes; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      const count = traffic.minCars + (Math.random() < 0.45 ? traffic.extra : 0);
      for (let c = 0; c < count; c++) {
        const key = vehicleKeys[(i + c) % vehicleKeys.length];
        const img = images[key];
        const h = img ? Math.min(118, img.height * (CAR_W / img.width)) : 90;
        const gap = roadH / count;
        state.cars.push({
          lane: i,
          key,
          y: ROAD_TOP + (c + Math.random() * 0.35) * gap,
          dir,
          speed: traffic.speed[0] + Math.random() * (traffic.speed[1] - traffic.speed[0]),
          h,
        });
      }
    }
  }

  function carRect(car) {
    const padX = 10;
    const padY = 12;
    return {
      x: laneCenterX(car.lane) - CAR_W / 2 + padX,
      y: car.y + padY,
      w: CAR_W - padX * 2,
      h: Math.max(20, car.h - padY * 2),
    };
  }

  function chickenRect() {
    const hw = 22;
    const hh = 38;
    return {
      x: state.chickenX - hw,
      y: CHICKEN_Y + state.hopY + state.fallY - hh,
      w: hw * 2,
      h: hh * 2,
    };
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function isResting() {
    return state.phase === "playing" && state.step > 0;
  }

  function occupiedCarLane() {
    return state.step - 1;
  }

  function isIncomingOnRestLane(car) {
    if (!isResting()) return false;
    if (car.lane !== occupiedCarLane()) return false;
    const chick = chickenRect();
    const approaching =
      (car.dir > 0 && car.y <= chick.y + chick.h) ||
      (car.dir < 0 && car.y + car.h >= chick.y);
    return approaching;
  }

  function isHitByCar() {
    if (state.phase !== "animating") return false;
    if (state.chickenX < SIDEWALK_W) return false;
    const chick = chickenRect();
    return state.cars.some((car) => rectsOverlap(chick, carRect(car)));
  }

  function checkCarHit() {
    if (isHitByCar()) bust();
  }

  function burst(x, y, color, n = 16) {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.2;
      const sp = 1.4 + Math.random() * 3.2;
      state.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 0.8,
        life: 36 + Math.random() * 18,
        color,
        size: 3 + Math.random() * 4,
      });
    }
  }

  function resetChicken() {
    state.step = 0;
    state.chickenX = 108;
    state.hopY = 0;
    state.fallY = 0;
    state.fallRotation = 0;
    state.pendingBust = false;
    state.cameraX = 0;
  }

  function startRound() {
    state.bet = clampBet(el.betInput.value);
    if (balance() < state.bet) {
      showToast("በቂ ቀሪ ሂሳብ የለም", "lose");
      sfx("bust");
      return;
    }
    setBalance(balance() - state.bet);
    state.phase = "playing";
    resetChicken();
    state.flash = 0;
    spawnCars();
    sfx("start");
    showToast("ጨዋታ ተጀመረ — ቀጥል ይጫኑ");
    syncUi();
  }

  function maybeAutoCashout() {
    if (!el.autoToggle.checked || state.step <= 0) return false;
    const target = Number(el.autoMult.value);
    if (!Number.isFinite(target)) return false;
    if (currentMult() + 1e-9 >= target) {
      cashOut(true);
      return true;
    }
    return false;
  }

  function tryStep() {
    if (state.phase !== "playing") return;
    if (state.step >= state.ladder.length) return;

    const next = state.step + 1;
    const startX = state.chickenX;
    // The first multiplier is the first manhole to the right of the start.
    const endX = laneCenterX(next - 1);

    state.pendingBust = !state.practice && Math.random() > DIFFICULTIES[state.difficulty].survival;
    state.phase = "animating";
    sfx("hop");
    syncUi();

    const duration = 380;
    const t0 = performance.now();

    function hop(now) {
      if (state.phase !== "animating") return;

      const t = Math.min(1, (now - t0) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      state.chickenX = startX + (endX - startX) * ease;
      state.hopY = -Math.sin(Math.PI * t) * 30;

      // The reference game resolves the shot-down chance while the chicken
      // is crossing, rather than only when a rendered car happens to overlap.
      if (state.pendingBust && t >= 0.58) {
        state.hopY = 0;
        bust();
        return;
      }

      if (isHitByCar()) {
        state.hopY = 0;
        bust();
        return;
      }

      if (t < 1) {
        requestAnimationFrame(hop);
        return;
      }

      state.hopY = 0;
      state.chickenX = endX;
      state.step = next;
      state.phase = "playing";
      burst(state.chickenX, CHICKEN_Y, "#f5c518", 10);
      sfx("safe");

      if (state.step >= state.ladder.length) {
        cashOut(true);
        return;
      }
      if (maybeAutoCashout()) return;
      syncUi();
    }

    requestAnimationFrame(hop);
  }

  function bust() {
    if (state.phase === "bust" || state.phase === "idle" || state.phase === "won") return;
    state.phase = "bust";
    state.pendingBust = false;
    state.hopY = 0;
    state.fallY = 0;
    state.fallRotation = -0.08;
    state.flash = 1;
    burst(state.chickenX, CHICKEN_Y, "#ff6b00", 26);
    sfx("bust");
    showToast("Shot down — bet lost", "lose");
    syncUi();
    setTimeout(() => {
      state.phase = "idle";
      resetChicken();
      syncUi();
    }, 1400);
  }

  function cashOut(auto = false) {
    if (state.phase !== "playing" && !auto) return;
    if (state.step <= 0 && !auto) return;
    const win = potentialWin();
    setBalance(balance() + win);
    state.phase = "won";
    burst(state.chickenX, 250, "#22c55e", 18);
    sfx("win");
    showToast(auto ? `ራስ-ሰር +${money(win)} ETB` : `ካሽ አውት +${money(win)} ETB`, "win");
    syncUi();
    setTimeout(() => {
      state.phase = "idle";
      resetChicken();
      syncUi();
    }, 1100);
  }

  function onGo() {
    audio.ensure();
    if (state.phase === "idle" || state.phase === "bust" || state.phase === "won") {
      startRound();
      return;
    }
    if (state.phase === "playing") tryStep();
  }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawImage(img, x, y, w, h, rot = 0) {
    if (!img) return;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(rot);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function drawManhole(x, y, r, label, mode) {
    ctx.save();
    ctx.globalAlpha = mode === "idle" ? 0.62 : 1;
    if (images.manhole) {
      drawImage(images.manhole, x - r, y - r, r * 2, r * 2);
    } else {
      ctx.fillStyle = mode === "cleared" ? "#d4a017" : mode === "current" ? "#86efac" : "#8b939c";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = mode === "cleared" ? "#211500" : "#f8fafc";
    ctx.font = "bold 13px Noto Sans, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 4;
    ctx.strokeText(label, x, y);
    ctx.fillText(label, x, y);
    ctx.restore();
  }

  function drawChicken(cam) {
    const x = state.chickenX - cam;
    const y = CHICKEN_Y + state.hopY + state.fallY;
    const falling = state.phase === "bust";
    const chickenW = falling ? 88 : 84;
    const chickenH = falling ? 120 : 115;

    ctx.save();
    ctx.globalAlpha = falling ? Math.max(0.4, 1 - state.fallY / 180) : 1;
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(x, CHICKEN_Y + 55, falling ? 30 : 24, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(x, y);
    ctx.rotate(falling ? state.fallRotation : 0);

    if (images.chicken) {
      drawImage(images.chicken, -chickenW / 2, -chickenH / 2, chickenW, chickenH);
    }

    if (falling) {
      ctx.fillStyle = "rgba(239,68,68,0.9)";
      ctx.font = "bold 26px Noto Sans, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("✕", 0, -chickenH * 0.35);
    }
    ctx.restore();
  }

  function drawScene(cam) {
    const w = canvas.width;
    const h = canvas.height;
    const worldW = laneCenterX(state.ladder.length) + 220;

    ctx.fillStyle = "#74716e";
    ctx.fillRect(0, 0, w, h);

    if (images.sidewalk) {
      const sw = SIDEWALK_W;
      ctx.drawImage(images.sidewalk, 0 - cam * 0.15, 0, sw, h);
    } else {
      ctx.fillStyle = "#c5ccd3";
      ctx.fillRect(70 - cam, 0, 120, h);
    }

    if (images.lamp) {
      drawImage(images.lamp, 18 - cam, 40, 70, 170, 0);
    }

    ctx.fillStyle = "#4b5563";
    ctx.fillRect(SIDEWALK_W - 8 - cam, ROAD_TOP - 10, worldW, ROAD_BOTTOM - ROAD_TOP + 20);

    ctx.fillStyle = "#d1d5db";
    ctx.fillRect(SIDEWALK_W - 8 - cam, ROAD_TOP - 10, worldW, 8);
    ctx.fillRect(SIDEWALK_W - 8 - cam, ROAD_BOTTOM + 2, worldW, 8);

    for (let i = 0; i < state.ladder.length; i++) {
      const x = SIDEWALK_W + i * LANE_W - cam;
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.setLineDash([16, 14]);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x + LANE_W, ROAD_TOP + 12);
      ctx.lineTo(x + LANE_W, ROAD_BOTTOM - 8);
      ctx.stroke();
      ctx.setLineDash([]);

      const cx = x + LANE_W / 2;
      const cy = (ROAD_TOP + ROAD_BOTTOM) / 2;
      const cleared = i < state.step;
      const current = i === state.step - 1 && state.step > 0;
      drawManhole(
        cx,
        cy,
        28,
        `${multiplierForStep(i + 1).toFixed(2)}x`,
        cleared ? "cleared" : current ? "current" : "idle"
      );
    }

    const goalX = laneCenterX(state.ladder.length + 0.15) - cam;
    ctx.fillStyle = "#f8fafc";
    ctx.beginPath();
    ctx.ellipse(goalX, 120, 18, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f5c518";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#f5c518";
    ctx.font = "bold 12px Noto Sans, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("GOAL", goalX, 160);
  }

  function drawCars(cam) {
    for (const car of state.cars) {
      const img = images[car.key];
      const x = laneCenterX(car.lane) - CAR_W / 2 - cam;
      const rot = car.dir > 0 ? 0 : Math.PI;
      drawImage(img, x, car.y, CAR_W, car.h, rot);
    }
  }

  function update(dt) {
    const desired = Math.max(0, state.chickenX - canvas.width * 0.32);
    state.cameraX += (desired - state.cameraX) * Math.min(1, dt * 0.008);

    if (state.phase === "bust") {
      state.fallY = Math.min(150, state.fallY + dt * 0.2);
      state.fallRotation -= dt * 0.0022;
    }

    const roadH = ROAD_BOTTOM - ROAD_TOP;
    for (const car of state.cars) {
      if (isIncomingOnRestLane(car)) continue;
      car.y += car.dir * car.speed * dt * 0.085;
      if (car.dir > 0 && car.y > ROAD_BOTTOM) car.y = ROAD_TOP - car.h;
      if (car.dir < 0 && car.y < ROAD_TOP - car.h) car.y = ROAD_BOTTOM;
    }

    checkCarHit();

    state.particles = state.particles.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.life -= 1;
      return p.life > 0;
    });

    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 0.002);
  }

  function render() {
    const cam = state.cameraX;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawScene(cam);
    drawCars(cam);
    drawChicken(cam);

    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life / 50);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x - cam, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255,50,0,${state.flash * 0.4})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function loop(ts) {
    if (!state.lastTs) state.lastTs = ts;
    const dt = Math.min(32, ts - state.lastTs);
    state.lastTs = ts;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function loadImages() {
    return Promise.all(
      Object.entries(IMAGE_KEYS).map(
        ([key, file]) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              images[key] = img;
              resolve();
            };
            img.onerror = resolve;
            img.src = ASSET + file;
          })
      )
    );
  }

  const NAMES = ["Abel K.", "Sara M.", "Yonas T.", "Mimi A.", "Henok B.", "Liya G.", "Coral Unlik"];
  setInterval(() => {
    const name = NAMES[Math.floor(Math.random() * NAMES.length)];
    const amt = (20 + Math.random() * 400).toFixed(2);
    el.ticker.textContent = `${name} +${amt} ETB`;
    const n = Number(el.online.textContent.replace(/\D/g, "")) || 9500;
    el.online.textContent = String(n + Math.floor(Math.random() * 7 - 3));
  }, 4200);

  el.btnGo.addEventListener("click", onGo);
  el.btnCashout.addEventListener("click", () => {
    sfx("click");
    cashOut(false);
  });

  document.getElementById("bet-min").addEventListener("click", () => {
    if (inRound()) return;
    state.bet = MIN_BET;
    sfx("click");
    syncUi();
  });
  document.getElementById("bet-max").addEventListener("click", () => {
    if (inRound()) return;
    state.bet = Math.min(MAX_BET, Math.max(MIN_BET, Math.floor(balance())));
    sfx("click");
    syncUi();
  });
  el.betInput.addEventListener("change", () => {
    state.bet = clampBet(el.betInput.value);
    syncUi();
  });
  document.querySelectorAll("[data-bet]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (inRound()) return;
      state.bet = clampBet(btn.dataset.bet);
      sfx("click");
      syncUi();
    });
  });
  el.diffBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (inRound()) return;
      const d = DIFFICULTIES[btn.dataset.diff];
      state.difficulty = btn.dataset.diff;
      state.ladder = buildLadder(d.steps, d.survival, d.start, d.growth);
      spawnCars();
      sfx("click");
      syncUi();
    });
  });

  el.practice.addEventListener("change", () => {
    state.practice = el.practice.checked;
    showToast(state.practice ? "የልምምድ ሁነታ" : "እውነተኛ ሁነታ");
    syncUi();
  });

  document.getElementById("btn-deposit").addEventListener("click", () => {
    state.realBalance += 500;
    sfx("win");
    showToast("+500 ETB", "win");
    syncUi();
  });

  document.getElementById("btn-sound").addEventListener("click", () => {
    state.soundOn = !state.soundOn;
    document.getElementById("btn-sound").innerHTML = state.soundOn
      ? '<i data-lucide="volume-2"></i>'
      : '<i data-lucide="volume-x"></i>';
    if (window.lucide) window.lucide.createIcons();
    sfx("click");
  });

  document.getElementById("btn-fav").addEventListener("click", () => {
    state.favorite = !state.favorite;
    document.getElementById("btn-fav").classList.toggle("is-on", state.favorite);
    sfx("click");
  });

  document.getElementById("btn-refresh").addEventListener("click", () => {
    if (inRound()) return;
    spawnCars();
    sfx("click");
  });

  document.getElementById("btn-full").addEventListener("click", () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  const help = document.getElementById("help-modal");
  document.getElementById("btn-help").addEventListener("click", () => {
    help.hidden = false;
  });
  document.getElementById("btn-menu").addEventListener("click", () => {
    help.hidden = false;
  });
  document.getElementById("help-close").addEventListener("click", () => {
    help.hidden = true;
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      onGo();
    } else if (e.code === "KeyC") {
      cashOut(false);
    }
  });

  loadImages().then(() => {
    spawnCars();
    syncUi();
    requestAnimationFrame(loop);
    if (window.lucide) window.lucide.createIcons();

    if (window.HabeshaWallet) {
      window.HabeshaWallet.subscribe((newBal) => {
        if (!state.practice) {
          state.realBalance = newBal;
          syncUi();
        }
      });
    }
  });
})();
