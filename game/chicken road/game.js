/**
 * Chicken Road - Mobile Edition (Friendes Game)
 * Top-to-bottom traffic, high-speed profit crash, level-based speed scaling.
 */
(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('cr-stage');

  // DOM Elements
  const el = {
    balance: document.getElementById('balance'),
    balancePill: document.getElementById('balance-pill'),
    betInput: document.getElementById('bet-input'),
    betMin: document.getElementById('bet-min'),
    betMax: document.getElementById('bet-max'),
    presetChips: [...document.querySelectorAll('.cr-preset-chip')],
    diffTrigger: document.getElementById('diff-trigger'),
    diffCurrentLabel: document.getElementById('diff-current-label'),
    diffMenu: document.getElementById('diff-menu'),
    diffItems: [...document.querySelectorAll('.cr-diff-item')],
    btnPlay: document.getElementById('btn-play'),
    inplayGroup: document.getElementById('inplay-group'),
    btnCashout: document.getElementById('btn-cashout'),
    cashoutVal: document.getElementById('cashout-val'),
    btnGo: document.getElementById('btn-go'),
    toast: document.getElementById('toast'),
    btnMenu: document.getElementById('btn-menu'),
    menuBackdrop: document.getElementById('menu-backdrop'),
    btnCloseMenu: document.getElementById('btn-close-menu'),
    btnToggleMode: document.getElementById('btn-toggle-mode'),
    menuModeDesc: document.getElementById('menu-mode-desc'),
    soundToggle: document.getElementById('sound-toggle'),
    btnOpenRules: document.getElementById('btn-open-rules'),
    rulesBackdrop: document.getElementById('rules-backdrop'),
    btnCloseRules: document.getElementById('btn-close-rules'),
    tickerPlayer: document.getElementById('ticker-player'),
    tickerAmount: document.getElementById('ticker-amount'),
    onlineCount: document.getElementById('online-count'),
  };

  const ASSET = 'asset/sprites/';
  const IMAGE_KEYS = {
    sidewalk: 'sidewalk.png',
    lamp: 'lamp.png',
    manhole: 'manhole.png',
    chicken: 'chicken.png',
    chickenHop: 'chicken_hop.png',
    chickenBust: 'chicken_bust.png',
    chickenWin: 'chicken_win.png',
    delivery: 'delivery.png',
    car: 'car.png',
    truck: 'truck.png',
    taxi: 'taxi.png',
    police: 'police.png',
    firetruck: 'firetruck.png',
    icecream: 'icecream.png',
  };

  const images = {};
  const vehicleKeys = ['delivery', 'car', 'truck', 'taxi', 'police', 'firetruck', 'icecream'];

  // Difficulties - Hardcore starts at 1.44x matching user screenshot
  const DIFFICULTIES = {
    easy: { steps: 24, survival: 0.96, start: 1.05, growth: 1.07, label: 'Easy', baseSpeed: 105 },
    medium: { steps: 22, survival: 0.88, start: 1.15, growth: 1.10, label: 'Medium', baseSpeed: 155 },
    hard: { steps: 20, survival: 0.80, start: 1.25, growth: 1.14, label: 'Hard', baseSpeed: 215 },
    hardcore: { steps: 15, survival: 0.60, start: 1.44, growth: 1.20, label: 'Hardcore', baseSpeed: 285 },
  };

  const MIN_BET = 1;
  const MAX_BET = 1000;
  const SIDEWALK_W = 138;
  const LANE_W = 108;
  const CHICKEN_BASE_Y = 275;
  const CAR_W = 66;

  function buildLadder(diffKey) {
    const d = DIFFICULTIES[diffKey];
    const ladder = [];
    let mult = d.start;
    for (let i = 1; i <= d.steps; i++) {
      ladder.push(Math.max(1.01, Math.round(mult * 100) / 100));
      mult *= d.growth;
    }
    return ladder;
  }

  const state = {
    bet: 50,
    difficulty: 'hardcore',
    ladder: buildLadder('hardcore'),
    phase: 'idle', // 'idle' | 'playing' | 'hopping' | 'bust' | 'won'
    step: 0,
    chickenX: 78,
    chickenY: CHICKEN_BASE_Y,
    hopY: 0,
    fallY: 0,
    fallRotation: 0,
    cameraX: 0,
    cameraShake: 0,
    cars: [],
    particles: [],
    feathers: [],
    flash: 0,
    lastTs: 0,
    soundOn: true,
    isCrashing: false,
    crashCar: null,
    chickenBreath: 0,
    resetTimeout: null,
    returnReason: null,
    returnStartX: 78,
  };

  // --- Audio Synthesizer Engine ---
  const audio = {
    ctx: null,
    ensure() {
      if (!audio.ctx) audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.ctx.state === 'suspended') audio.ctx.resume();
      return audio.ctx;
    },
    beep(freq, dur, type = 'square', gain = 0.05) {
      if (!state.soundOn) return;
      try {
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
      } catch (e) {}
    },
    screech() {
      if (!state.soundOn) return;
      try {
        const c = audio.ensure();
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(800, c.currentTime);
        o.frequency.linearRampToValueAtTime(320, c.currentTime + 0.35);
        g.gain.setValueAtTime(0.12, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.38);
        o.connect(g);
        g.connect(c.destination);
        o.start();
        o.stop(c.currentTime + 0.38);
      } catch (e) {}
    },
    horn() {
      if (!state.soundOn) return;
      audio.beep(420, 0.12, 'triangle', 0.08);
      setTimeout(() => audio.beep(460, 0.16, 'triangle', 0.08), 50);
    },
    crash() {
      if (!state.soundOn) return;
      try {
        const c = audio.ensure();
        const dur = 0.55;
        const n = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
        const d = n.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        const src = c.createBufferSource();
        const g = c.createGain();
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(1400, c.currentTime);
        f.frequency.linearRampToValueAtTime(120, c.currentTime + dur);
        g.gain.setValueAtTime(0.3, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
        src.buffer = n;
        src.connect(f);
        f.connect(g);
        g.connect(c.destination);
        src.start();
      } catch (e) {}
    },
  };

  function sfx(kind) {
    if (kind === 'click') audio.beep(600, 0.04, 'square', 0.02);
    if (kind === 'hop') {
      audio.beep(520, 0.08, 'triangle', 0.06);
      setTimeout(() => audio.beep(740, 0.09, 'sine', 0.05), 40);
    }
    if (kind === 'safe') {
      audio.beep(659, 0.1, 'triangle', 0.06);
      setTimeout(() => audio.beep(880, 0.16, 'triangle', 0.07), 80);
    }
    if (kind === 'win') {
      audio.beep(523, 0.12, 'sine', 0.07);
      setTimeout(() => audio.beep(659, 0.12, 'sine', 0.08), 80);
      setTimeout(() => audio.beep(784, 0.16, 'sine', 0.09), 160);
      setTimeout(() => audio.beep(1046, 0.28, 'triangle', 0.1), 240);
    }
    if (kind === 'bust') {
      audio.crash();
      audio.beep(160, 0.4, 'sawtooth', 0.08);
    }
    if (kind === 'screech') audio.screech();
    if (kind === 'horn') audio.horn();
  }

  // --- Wallet Helpers ---
  function getWallet() {
    return window.FriendesWallet || window.HabeshaWallet || null;
  }

  function getBalance() {
    const w = getWallet();
    return w ? w.get() : 1000.00;
  }

  function modifyBalance(delta, method = 'stake') {
    const w = getWallet();
    if (w) return w.modify(delta, 'Chicken Road', method);
    return getBalance();
  }

  function money(n) {
    return (Math.round(n * 100) / 100).toFixed(2);
  }

  function laneCenterX(index) {
    return SIDEWALK_W + LANE_W * index + LANE_W / 2;
  }

  function multiplierForStep(step) {
    if (step <= 0) return 1;
    const d = DIFFICULTIES[state.difficulty];
    return Math.max(1.01, Math.round(d.start * Math.pow(d.growth, step - 1) * 100) / 100);
  }

  function currentMult() {
    return multiplierForStep(state.step);
  }

  function potentialWin() {
    return state.bet * currentMult();
  }

  function showToast(text, type = '') {
    if (!el.toast) return;
    el.toast.hidden = false;
    el.toast.textContent = text;
    el.toast.className = 'cr-toast' + (type ? ' is-' + type : '');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      el.toast.hidden = true;
    }, 1700);
  }

  function syncUi() {
    const bal = getBalance();
    el.balance.textContent = money(bal);
    el.betInput.value = String(state.bet);
    el.cashoutVal.textContent = `${money(potentialWin())} ETB`;
    el.diffCurrentLabel.textContent = DIFFICULTIES[state.difficulty].label;

    const inPlay = state.phase === 'playing' || state.phase === 'hopping';
    const isReturning = state.phase === 'returning';
    const isBusy = state.phase === 'hopping' || isReturning || state.phase === 'bust' || state.phase === 'won';

    if (inPlay) {
      // In active play: remove Play button and show Go + Cash Out
      el.btnPlay.classList.add('hidden');
      el.inplayGroup.classList.remove('hidden');
      el.btnCashout.disabled = state.step <= 0 || state.phase === 'hopping';
      el.btnGo.disabled = state.phase === 'hopping' || state.step >= state.ladder.length;
    } else {
      // Idle or returning: Play button is visible
      el.btnPlay.classList.remove('hidden');
      el.inplayGroup.classList.add('hidden');
      el.btnPlay.disabled = isBusy;
      el.btnPlay.textContent = 'Play';
    }

    // Lock inputs while in game or returning
    el.betInput.disabled = inPlay || isBusy;
    el.betMin.disabled = inPlay || isBusy;
    el.betMax.disabled = inPlay || isBusy;
    el.diffTrigger.disabled = inPlay || isBusy;
    el.presetChips.forEach((chip) => {
      chip.disabled = inPlay || isBusy;
      chip.classList.toggle('is-active', Number(chip.dataset.bet) === state.bet);
    });
    el.diffItems.forEach((item) => {
      item.classList.toggle('is-selected', item.dataset.diff === state.difficulty);
    });

    const w = getWallet();
    const mode = w ? w.getMode() : 'real';
    if (el.btnToggleMode) {
      el.btnToggleMode.textContent = mode === 'demo' ? 'Demo Mode' : 'Real Mode';
      el.menuModeDesc.textContent = mode === 'demo' ? 'Practice with 1,000 ETB renewable demo' : 'Play with real Telegram balance';
    }
  }

  function clampBet(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return state.bet;
    return Math.min(MAX_BET, Math.max(MIN_BET, Math.round(n)));
  }

  // --- CAR TRAFFIC SYSTEM ---
  // RULE: Exactly 1 car per lane, ONLY top-to-bottom, speed increases with level/difficulty.
  function spawnCars() {
    state.cars = [];
    const lanes = state.ladder.length;
    const diff = DIFFICULTIES[state.difficulty];
    const roadH = canvas.height || 520;

    for (let i = 0; i < lanes; i++) {
      // Prioritize green delivery truck in early lane matching screenshot
      const key = i === 1 ? 'delivery' : vehicleKeys[(i * 3 + 1) % vehicleKeys.length];
      const img = images[key];
      const carH = img ? Math.round(CAR_W * (img.height / img.width)) : 110;

      // Speed increases with difficulty and with lane index (level increase)
      const laneLevelFactor = 1.0 + i * 0.07;
      const speed = diff.baseSpeed * laneLevelFactor * (0.92 + Math.random() * 0.16);

      // Stagger initial Y positions down the lanes
      const initialY = -carH + ((i * 147) % (roadH + carH));

      state.cars.push({
        lane: i,
        key: key,
        y: initialY,
        dir: 1, // STRICTLY TOP TO BOTTOM
        speed: speed,
        baseSpeed: speed,
        h: carH,
        isCrashing: false,
        yieldTimer: 0,
      });
    }
  }

  function resetChicken() {
    state.step = 0;
    state.phase = 'idle';
    state.chickenX = 78;
    state.chickenY = CHICKEN_BASE_Y;
    state.hopY = 0;
    state.fallY = 0;
    state.fallRotation = 0;
    state.cameraX = 0;
    state.cameraShake = 0;
    state.isCrashing = false;
    state.crashCar = null;
  }

  function handlePlayAction() {
    audio.ensure();
    if (state.phase === 'bust' || state.phase === 'returning') {
      return;
    }
    if (state.phase === 'won') {
      clearTimeout(state.resetTimeout);
      resetChicken();
      spawnCars();
      syncUi();
    }

    if (state.phase === 'idle') {
      startRoundAndHop();
    } else if (state.phase === 'playing') {
      tryHop();
    }
  }

  function startRoundAndHop() {
    state.bet = clampBet(el.betInput.value);
    const bal = getBalance();
    if (bal < state.bet) {
      showToast('Insufficient balance for bet', 'lose');
      sfx('bust');
      return;
    }

    modifyBalance(-state.bet, 'stake');
    resetChicken();
    spawnCars();
    sfx('click');
    state.phase = 'playing';
    // Immediately move / hop across into the first lane!
    tryHop();
  }

  // --- HOP & PROFIT CRASH LOGIC ---
  function tryHop() {
    if (state.phase !== 'playing') return;
    if (state.step >= state.ladder.length) return;

    const nextStep = state.step + 1;
    const targetLane = nextStep - 1;
    const startX = state.chickenX;
    const endX = laneCenterX(targetLane);

    // Calculate win vs loss (system profit generation)
    const diff = DIFFICULTIES[state.difficulty];
    const w = getWallet();
    const adminCfg = w ? w.getAdminConfig() : null;
    const marginRatio = adminCfg && adminCfg.globalMarginEnabled ? (adminCfg.globalMargin || 3.5) / 100 : 0.035;
    const effectiveSurvival = Math.max(0.2, diff.survival - marginRatio);

    const willBust = Math.random() > effectiveSurvival;
    state.phase = 'hopping';
    sfx('hop');
    syncUi();

    // Find car in the target lane
    const laneCar = state.cars.find((c) => c.lane === targetLane);

    if (willBust) {
      // SYSTEM WANTS TO GENERATE PROFIT: CAR QUICKLY ACCELERATES & CRASHES INTO CHICKEN!
      state.isCrashing = true;
      state.crashCar = laneCar;

      if (laneCar) {
        // Position car above the chicken to ensure a dramatic, high-speed impact
        if (laneCar.y > state.chickenY - 160) {
          laneCar.y = state.chickenY - 220;
        }
        // Blazing acceleration rush towards the chicken/target!
        laneCar.speed = 1050;
        laneCar.isCrashing = true;
      }
      setTimeout(() => sfx('screech'), 50);
    } else {
      // Safe step: car in target lane yields and stops above the chicken
      if (laneCar) {
        const stopY = state.chickenY - laneCar.h - 18;
        if (laneCar.y > stopY && laneCar.y < state.chickenY + 50) {
          laneCar.y = stopY;
        }
        sfx('horn');
      }
    }

    const duration = 340;
    const t0 = performance.now();

    function animateHop(now) {
      if (state.phase !== 'hopping') return;

      const t = Math.min(1, (now - t0) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      state.chickenX = startX + (endX - startX) * ease;
      state.hopY = -Math.sin(Math.PI * t) * 34;

      // Check collision with the high-speed crashing car without pausing
      if (state.isCrashing && laneCar) {
        const carBox = {
          x: endX - CAR_W / 2 + 8,
          y: laneCar.y + 12,
          w: CAR_W - 16,
          h: laneCar.h - 24,
        };
        const chickenBox = {
          x: state.chickenX - 22,
          y: state.chickenY + state.hopY - 32,
          w: 44,
          h: 64,
        };

        const overlap =
          chickenBox.x < carBox.x + carBox.w &&
          chickenBox.x + chickenBox.w > carBox.x &&
          chickenBox.y < carBox.y + carBox.h &&
          chickenBox.y + chickenBox.h > carBox.y;

        if (overlap || t >= 0.7) {
          triggerCrashImpact(endX, state.chickenY);
          return;
        }
      }

      if (t < 1) {
        requestAnimationFrame(animateHop);
        return;
      }

      // Safe landing on manhole!
      state.hopY = 0;
      state.chickenX = endX;
      state.step = nextStep;
      state.phase = 'playing';
      burstStars(endX, state.chickenY);
      sfx('safe');

      if (state.step >= state.ladder.length) {
        cashOut();
        return;
      }

      syncUi();
    }

    requestAnimationFrame(animateHop);
  }

  function triggerCrashImpact(impactX, impactY) {
    state.phase = 'bust';
    state.isCrashing = false;
    state.hopY = 0;
    state.fallY = 0;
    state.fallRotation = 0;
    state.flash = 0.8;
    state.cameraShake = 16;

    // Explosive feathers & crash burst
    burstFeathers(impactX, impactY);
    burstSparks(impactX, impactY, '#ff4400', 28);
    sfx('bust');
    showToast('💥 Crashed! Bet lost.', 'lose');
    syncUi();

    // After brief crash impact pause (360ms), return smoothly back to sidewalk right before our eyes!
    clearTimeout(state.resetTimeout);
    state.resetTimeout = setTimeout(() => {
      startReturnTransition('bust');
    }, 360);
  }

  function cashOut() {
    if (state.phase !== 'playing' || state.step <= 0) return;
    const win = potentialWin();
    modifyBalance(win, 'win');
    state.phase = 'won';
    burstStars(state.chickenX, state.chickenY, 32);
    sfx('win');
    showToast(`🎉 Cashed out +${money(win)} ETB!`, 'win');
    syncUi();

    // After celebration pause (450ms), return smoothly back to sidewalk right before our eyes!
    clearTimeout(state.resetTimeout);
    state.resetTimeout = setTimeout(() => {
      startReturnTransition('won');
    }, 450);
  }

  function startReturnTransition(reason) {
    clearTimeout(state.resetTimeout);
    state.phase = 'returning';
    state.returnReason = reason;
    syncUi();

    const startX = state.chickenX;
    const endX = 78;
    const dist = Math.abs(startX - endX);

    if (dist < 10) {
      resetChicken();
      spawnCars();
      syncUi();
      return;
    }

    // Smooth transition time: dynamic based on distance, approx 480-920ms
    const duration = Math.min(920, Math.max(480, dist * 1.5));
    const t0 = performance.now();

    function animateReturn(now) {
      if (state.phase !== 'returning') return;

      const t = Math.min(1, (now - t0) / duration);
      // Cubic ease-out
      const ease = 1 - Math.pow(1 - t, 3);
      state.chickenX = startX + (endX - startX) * ease;

      // Scurrying footsteps / bounce
      state.hopY = -Math.abs(Math.sin(t * Math.PI * 8)) * 9;

      // Dust & sparkle particles while scampering back
      if (Math.random() < 0.28) {
        state.particles.push({
          x: state.chickenX + (Math.random() * 12 - 6),
          y: state.chickenY + 30,
          vx: Math.random() * 1.8 + 0.4,
          vy: -(Math.random() * 1.3),
          life: 18,
          maxLife: 18,
          color: reason === 'bust' ? 'rgba(180, 180, 180, 0.6)' : 'rgba(251, 191, 36, 0.75)',
          size: 2.5 + Math.random() * 2.5,
        });
      }

      if (t < 1) {
        requestAnimationFrame(animateReturn);
      } else {
        state.chickenX = 78;
        state.hopY = 0;
        resetChicken();
        spawnCars();
        syncUi();
      }
    }

    requestAnimationFrame(animateReturn);
  }

  // --- Particles & Effects ---
  function burstStars(x, y, count = 18) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const speed = 1.8 + Math.random() * 3.5;
      state.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.2,
        life: 42 + Math.random() * 20,
        maxLife: 62,
        color: Math.random() < 0.5 ? '#f59e0b' : '#22c55e',
        size: 3 + Math.random() * 4,
      });
    }
  }

  function burstSparks(x, y, color, count = 20) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 5.0;
      state.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        life: 30 + Math.random() * 22,
        maxLife: 52,
        color: color,
        size: 2 + Math.random() * 5,
      });
    }
  }

  function burstFeathers(x, y) {
    for (let i = 0; i < 16; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3.8;
      state.feathers.push({
        x: x + (Math.random() * 20 - 10),
        y: y + (Math.random() * 20 - 10),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2.0,
        rot: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 0.15,
        life: 48 + Math.random() * 25,
        maxLife: 73,
      });
    }
  }

  // --- Canvas Sizing & Rendering ---
  function resizeCanvas() {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener('resize', resizeCanvas);

  function drawImageCentered(img, cx, cy, w, h, rot = 0) {
    if (!img) return;
    ctx.save();
    ctx.translate(cx, cy);
    if (rot) ctx.rotate(rot);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function drawScene(camX) {
    const h = stage.clientHeight || 520;
    const w = stage.clientWidth || 480;
    const worldW = laneCenterX(state.ladder.length) + 300;

    // 1. Dark Asphalt Road Background
    ctx.fillStyle = '#404246';
    ctx.fillRect(0, 0, w, h);

    // 2. Left Sidewalk (Tiles, Bushes, Curbs)
    const swX = 0 - camX;
    if (swX + SIDEWALK_W > -50) {
      if (images.sidewalk) {
        ctx.drawImage(images.sidewalk, swX, 0, SIDEWALK_W, h);
      } else {
        ctx.fillStyle = '#b0b5bc';
        ctx.fillRect(swX + 35, 0, SIDEWALK_W - 35, h);
      }

      // Green bush edge on far left
      ctx.fillStyle = '#1e823d';
      ctx.beginPath();
      ctx.arc(swX + 15, h * 0.2, 32, 0, Math.PI * 2);
      ctx.arc(swX + 22, h * 0.45, 36, 0, Math.PI * 2);
      ctx.arc(swX + 16, h * 0.72, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2db856';
      ctx.beginPath();
      ctx.arc(swX + 26, h * 0.43, 24, 0, Math.PI * 2);
      ctx.arc(swX + 22, h * 0.7, 22, 0, Math.PI * 2);
      ctx.fill();

      // Sidewalk Curbs
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(swX + SIDEWALK_W - 6, 0, 6, h);

      // Street Lamp Glow Pool
      const lampGlow = ctx.createRadialGradient(swX + 88, 140, 10, swX + 88, 140, 125);
      lampGlow.addColorStop(0, 'rgba(254, 240, 138, 0.28)');
      lampGlow.addColorStop(0.5, 'rgba(254, 240, 138, 0.12)');
      lampGlow.addColorStop(1, 'rgba(254, 240, 138, 0)');
      ctx.fillStyle = lampGlow;
      ctx.beginPath();
      ctx.arc(swX + 88, 140, 125, 0, Math.PI * 2);
      ctx.fill();

      // Street Lamp Post
      if (images.lamp) {
        ctx.drawImage(images.lamp, swX + 60, 20, 56, 150);
      }
    }

    // 3. Road Lanes & Manholes
    for (let i = 0; i < state.ladder.length; i++) {
      const laneX = SIDEWALK_W + i * LANE_W - camX;
      if (laneX > w + 100 || laneX + LANE_W < -100) continue;

      // Vertical White Dashed Line (Top to Bottom)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 4;
      ctx.setLineDash([18, 16]);
      ctx.beginPath();
      ctx.moveTo(laneX + LANE_W, 0);
      ctx.lineTo(laneX + LANE_W, h);
      ctx.stroke();
      ctx.setLineDash([]);

      // Manhole Cover in the Lane Center
      const cx = laneX + LANE_W / 2;
      const cy = state.chickenY;
      const isCleared = i < state.step;
      const isCurrent = i === state.step - 1 && state.step > 0;
      const isNextTarget = i === state.step && (state.phase === 'playing' || state.phase === 'hopping');

      drawManhole(cx, cy, multiplierForStep(i + 1), isCleared, isCurrent, isNextTarget);
    }
  }

  function drawManhole(x, y, mult, cleared, current, target) {
    const r = 32;
    ctx.save();

    // Outer subtle shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.arc(x, y + 2, r + 2, 0, Math.PI * 2);
    ctx.fill();

    // Manhole Plate
    if (images.manhole) {
      drawImageCentered(images.manhole, x, y, r * 2.1, r * 2.1);
    } else {
      ctx.fillStyle = cleared ? '#b45309' : '#33373d';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Glowing border for active / cleared states
    if (target) {
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (current) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Inner Embossed Multiplier Pill
    const pillW = 54;
    const pillH = 26;
    ctx.fillStyle = cleared ? 'rgba(34, 197, 94, 0.88)' : current ? 'rgba(245, 158, 11, 0.9)' : 'rgba(24, 26, 30, 0.85)';
    ctx.strokeStyle = cleared ? '#86efac' : current ? '#fde68a' : 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x - pillW / 2, y - pillH / 2, pillW, pillH, 8) : ctx.rect(x - pillW / 2, y - pillH / 2, pillW, pillH);
    ctx.fill();
    ctx.stroke();

    // Multiplier Text
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 13px DM Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${mult.toFixed(2)}x`, x, y);

    ctx.restore();
  }

  function drawCars(camX) {
    const w = stage.clientWidth || 480;
    const h = stage.clientHeight || 520;

    for (const car of state.cars) {
      const carX = laneCenterX(car.lane) - camX;
      if (carX < -80 || carX > w + 80) continue;

      const img = images[car.key];
      // STRICTLY TOP-TO-BOTTOM: rotation is 0
      drawImageCentered(img, carX, car.y, CAR_W, car.h, 0);

      // Subtle shadow under vehicle
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.beginPath();
      ctx.ellipse(carX, car.y + car.h / 2 - 4, CAR_W * 0.45, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawChicken(camX) {
    const x = state.chickenX - camX;
    const y = state.chickenY + state.hopY + state.fallY;
    const isBust = state.phase === 'bust';
    const isHop = state.phase === 'hopping';
    const isWon = state.phase === 'won';
    const isReturning = state.phase === 'returning';

    ctx.save();
    // Shadow under chicken
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(x, state.chickenY + 34, (isBust || (isReturning && state.returnReason === 'bust')) ? 30 : 24, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(x, y);

    if (isReturning) {
      // Facing left towards the sidewalk!
      ctx.scale(-1, 1);
      ctx.rotate(Math.sin(state.chickenBreath * 4) * 0.1);
    } else if (isBust) {
      ctx.rotate(state.fallRotation);
    } else if (state.phase === 'idle') {
      ctx.translate(0, Math.sin(state.chickenBreath) * 2);
    }

    const cw = isBust ? 84 : 80;
    const ch = isBust ? 96 : 94;
    let chkImg = images.chicken;

    if (isReturning) {
      if (state.returnReason === 'bust') {
        chkImg = images.chickenBust || images.chicken;
      } else {
        chkImg = images.chickenWin || images.chicken;
      }
    } else if (isBust && images.chickenBust) {
      chkImg = images.chickenBust;
    } else if (isHop && images.chickenHop) {
      chkImg = images.chickenHop;
    } else if (isWon && images.chickenWin) {
      chkImg = images.chickenWin;
    }

    if (chkImg) {
      ctx.drawImage(chkImg, -cw / 2, -ch / 2, cw, ch);
    }

    ctx.restore();
  }

  // --- Game Loop Update ---
  function update(dt) {
    // Camera follow chicken: instantly 0 when idle (no lingering lag)
    const w = stage.clientWidth || 480;
    const targetCamX = Math.max(0, state.chickenX - w * 0.36);
    if (state.phase === 'idle') {
      state.cameraX = 0;
    } else {
      state.cameraX += (targetCamX - state.cameraX) * Math.min(1, dt * 0.015);
    }

    // Screen Shake decay
    if (state.cameraShake > 0) {
      state.cameraShake = Math.max(0, state.cameraShake - dt * 0.04);
    }

    // Chicken breathing bob
    state.chickenBreath += dt * 0.004;

    // Cars Movement: only the car on the lane where the chicken rests stops; others drive past!
    const roadH = stage.clientHeight || 520;
    const restingLane = (state.phase === 'playing' && state.step > 0) ? state.step - 1 : -1;

    for (const car of state.cars) {
      // If actively crashing into chicken, car rushes without pausing
      const isCrashingCar = state.isCrashing && car === state.crashCar;

      if (car.yieldTimer > 0) {
        car.yieldTimer -= dt;
        continue;
      }

      const isRestingLane = car.lane === restingLane;
      const stopY = state.chickenY - car.h - 18;

      if (isRestingLane && !isCrashingCar) {
        // Car stops right above the chicken while chicken is resting on this lane
        if (car.y >= stopY && car.y < state.chickenY + 30) {
          car.y = stopY;
          continue; // STOPPED ONLY ON THE RESTING LANE!
        }
      }

      // Move downwards
      const moveDist = car.speed * (dt / 1000);
      if (isRestingLane && !isCrashingCar && car.y < stopY && car.y + moveDist >= stopY) {
        car.y = stopY;
      } else {
        car.y += moveDist;
      }

      // Loop back to top when reaching bottom
      if (car.y > roadH + car.h + 20) {
        car.y = -car.h - (Math.random() * 60 + 20);
        car.isCrashing = false;

        // Reset speed to level-appropriate speed
        const laneLevelFactor = 1.0 + car.lane * 0.07;
        const diff = DIFFICULTIES[state.difficulty];
        car.speed = diff.baseSpeed * laneLevelFactor * (0.92 + Math.random() * 0.16);
      }
    }

    // Particles Update
    state.particles = state.particles.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.life -= 1;
      return p.life > 0;
    });

    // Feathers Update
    state.feathers = state.feathers.filter((f) => {
      f.x += f.vx;
      f.y += f.vy;
      f.vy += 0.09;
      f.rot += f.vRot;
      f.life -= 1;
      return f.life > 0;
    });

    // Red Flash decay
    if (state.flash > 0) {
      state.flash = Math.max(0, state.flash - dt * 0.0028);
    }
  }

  function render() {
    const w = stage.clientWidth || 480;
    const h = stage.clientHeight || 520;

    let shakeX = 0;
    let shakeY = 0;
    if (state.cameraShake > 0) {
      shakeX = (Math.random() * 2 - 1) * state.cameraShake;
      shakeY = (Math.random() * 2 - 1) * state.cameraShake;
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);

    const camX = state.cameraX;
    drawScene(camX);
    drawCars(camX);
    drawChicken(camX);

    // Render Particles
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x - camX, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Render Feathers
    for (const f of state.feathers) {
      ctx.save();
      ctx.translate(f.x - camX, f.y);
      ctx.rotate(f.rot);
      ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(0, 0, 7, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // Red Flash overlay on crash
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(239, 68, 68, ${state.flash})`;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.restore();
  }

  function loop(ts) {
    if (!state.lastTs) state.lastTs = ts;
    const dt = Math.min(32, ts - state.lastTs);
    state.lastTs = ts;

    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // --- Image Asset Loading ---
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

  // --- Live Wins Mock Ticker ---
  const FAKE_PLAYERS = ['Player', 'Abebe K.', 'Sara M.', 'Yonas T.', 'Mimi A.', 'Henok B.', 'Liya G.'];
  setInterval(() => {
    if (!el.tickerPlayer || !el.tickerAmount) return;
    const p = FAKE_PLAYERS[Math.floor(Math.random() * FAKE_PLAYERS.length)];
    const amt = (1.5 + Math.random() * 25).toFixed(2);
    el.tickerPlayer.textContent = p;
    el.tickerAmount.textContent = `+ETB${amt}`;
    if (el.onlineCount) {
      const cur = Number(el.onlineCount.textContent) || 65;
      el.onlineCount.textContent = String(Math.max(45, cur + Math.floor(Math.random() * 5 - 2)));
    }
  }, 3800);

  // --- Event Listeners ---
  el.btnPlay.addEventListener('click', () => {
    handlePlayAction();
  });

  if (el.btnGo) {
    el.btnGo.addEventListener('click', () => {
      audio.ensure();
      if (state.phase === 'playing') {
        tryHop();
      }
    });
  }

  // Tapping directly on the canvas road also triggers play/hop!
  canvas.addEventListener('click', () => {
    handlePlayAction();
  });

  el.btnCashout.addEventListener('click', () => {
    audio.ensure();
    cashOut();
  });

  el.betMin.addEventListener('click', () => {
    if (state.phase !== 'idle') return;
    state.bet = MIN_BET;
    sfx('click');
    syncUi();
  });

  el.betMax.addEventListener('click', () => {
    if (state.phase !== 'idle') return;
    state.bet = Math.min(MAX_BET, Math.max(MIN_BET, Math.floor(getBalance())));
    sfx('click');
    syncUi();
  });

  el.betInput.addEventListener('change', () => {
    state.bet = clampBet(el.betInput.value);
    syncUi();
  });

  el.presetChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      if (state.phase !== 'idle') return;
      state.bet = clampBet(chip.dataset.bet);
      sfx('click');
      syncUi();
    });
  });

  // Difficulty Selector Dropdown
  el.diffTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.phase !== 'idle') return;
    const isOpen = !el.diffMenu.classList.contains('hidden');
    el.diffMenu.classList.toggle('hidden', isOpen);
    el.diffTrigger.closest('.cr-diff-wrap').classList.toggle('is-open', !isOpen);
  });

  document.addEventListener('click', () => {
    el.diffMenu.classList.add('hidden');
    el.diffTrigger.closest('.cr-diff-wrap').classList.remove('is-open');
  });

  el.diffItems.forEach((item) => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.phase !== 'idle') return;
      const dKey = item.dataset.diff;
      if (DIFFICULTIES[dKey]) {
        state.difficulty = dKey;
        state.ladder = buildLadder(dKey);
        sfx('click');
        syncUi();
        spawnCars();
      }
      el.diffMenu.classList.add('hidden');
      el.diffTrigger.closest('.cr-diff-wrap').classList.remove('is-open');
    });
  });

  // Drawer Menu Handlers
  el.btnMenu.addEventListener('click', () => {
    el.menuBackdrop.classList.remove('hidden');
  });

  el.btnCloseMenu.addEventListener('click', () => {
    el.menuBackdrop.classList.add('hidden');
  });

  el.menuBackdrop.addEventListener('click', (e) => {
    if (e.target === el.menuBackdrop) el.menuBackdrop.classList.add('hidden');
  });

  el.soundToggle.addEventListener('change', (e) => {
    state.soundOn = e.target.checked;
  });

  el.btnToggleMode.addEventListener('click', () => {
    const w = getWallet();
    if (!w) return;
    const cur = w.getMode();
    const next = cur === 'demo' ? 'real' : 'demo';
    w.setMode(next);
    syncUi();
    showToast(next === 'demo' ? 'Switched to Demo Mode' : 'Switched to Real Mode');
  });

  el.btnOpenRules.addEventListener('click', () => {
    el.menuBackdrop.classList.add('hidden');
    el.rulesBackdrop.classList.remove('hidden');
  });

  el.btnCloseRules.addEventListener('click', () => {
    el.rulesBackdrop.classList.add('hidden');
  });

  // Subscribe to external wallet updates
  const w = getWallet();
  if (w && w.subscribe) {
    w.subscribe(() => syncUi());
  }

  // --- Initialize ---
  loadImages().then(() => {
    resizeCanvas();
    spawnCars();
    syncUi();
    requestAnimationFrame(loop);
    if (window.hideGameLoader) {
      window.hideGameLoader(300);
    }
  });
})();
