// Spribe Aviator Official Mobile View Game Engine
(function() {
  'use strict';

  // --- Audio System (Native MP3 Audio + Web Audio UI FX) ---
  const audioCtx = (function() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      return new AudioContext();
    } catch(e) { return null; }
  })();

  function resumeAudioContext() {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  }

  // Preload audio files (.mp3 with .wav fallback)
  function createAudioClip(filename) {
    const audio = new Audio(`./assets/sounds/${filename}.mp3`);
    audio.preload = 'auto';
    audio.addEventListener('error', () => {
      if (!audio.src.endsWith('.wav')) {
        audio.src = `./assets/sounds/${filename}.wav`;
      }
    }, { once: true });
    return audio;
  }

  const audioClips = {
    fly: createAudioClip('fly'),
    crash: createAudioClip('crash'),
  };

  if (audioClips.fly) {
    audioClips.fly.loop = true;
    audioClips.fly.volume = 0.55;
  }
  if (audioClips.crash) {
    audioClips.crash.volume = 0.8;
  }

  function startFlySound(forceRestart = false) {
    resumeAudioContext();
    if (audioClips.fly) {
      try {
        if (forceRestart || audioClips.fly.paused) {
          audioClips.fly.currentTime = 0;
        }
        audioClips.fly.playbackRate = 1.0;
        const playPromise = audioClips.fly.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {});
        }
      } catch(e) {}
    }
  }

  function updateFlyPitch(mult) {
    if (state.status !== 'FLYING') return;
    if (audioClips.fly && !audioClips.fly.paused) {
      try {
        const rate = Math.min(1.85, Math.max(0.95, 1.0 + Math.log10(Math.max(1, mult)) * 0.42));
        audioClips.fly.playbackRate = rate;
      } catch(e) {}
    }
  }

  function stopFlySound() {
    if (audioClips.fly) {
      try {
        audioClips.fly.pause();
        audioClips.fly.currentTime = 0;
      } catch(e) {}
    }
  }

  function playTone(freq, type, duration, gainVal = 0.1) {
    if (!audioCtx) return;
    try {
      resumeAudioContext();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch(e) {}
  }

  function playWinSound() {
    resumeAudioContext();
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      setTimeout(() => playTone(freq, 'triangle', 0.22, 0.12), idx * 70);
    });
  }

  function playCrashSound() {
    stopFlySound();
    resumeAudioContext();
    if (audioClips.crash) {
      try {
        audioClips.crash.currentTime = 0;
        const playPromise = audioClips.crash.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {});
        }
      } catch(e) {}
    }
    // Deep sub-bass impact layer
    playTone(95, 'sawtooth', 0.45, 0.22);
  }

  function playClickSound() {
    resumeAudioContext();
    playTone(900, 'sine', 0.03, 0.05);
  }

  function playBetPlacedSound() {
    resumeAudioContext();
    // Crisp positive two-tone pip for placing a bet / cutting ticket
    playTone(650, 'sine', 0.04, 0.06);
    setTimeout(() => playTone(950, 'sine', 0.05, 0.07), 45);
  }

  // --- State Management ---
  const state = {
    balance: 50000.0,
    status: 'WAITING', // 'WAITING', 'FLYING', 'CRASHED'
    multiplier: 1.00,
    crashPoint: 3.33,
    roundStartTime: 0,
    waitStartTime: Date.now(),
    waitDuration: 5000,
    history: [
      { mult: 1.57, color: 'pill-blue' },
      { mult: 206.89, color: 'pill-pink' },
      { mult: 3.54, color: 'pill-purple' },
      { mult: 342.87, color: 'pill-pink' },
      { mult: 1.82, color: 'pill-blue' },
      { mult: 3.44, color: 'pill-purple' },
      { mult: 2.94, color: 'pill-purple' },
      { mult: 1.08, color: 'pill-blue' },
      { mult: 2.15, color: 'pill-purple' },
      { mult: 18.40, color: 'pill-pink' }
    ],
    panel1: {
      amount: 4.00,
      state: 'IDLE', // 'IDLE', 'QUEUED', 'IN_FLIGHT', 'WON', 'LOST'
      payout: 0,
      cashedAt: 0
    },
    panel2: {
      amount: 4.00,
      state: 'IDLE',
      payout: 0,
      cashedAt: 0,
      collapsed: false
    },
    liveBets: [],
    activeTab: 'all'
  };

  // --- Shared Wallet Sync ---
  function initWallet() {
    if (window.HabeshaWallet) {
      state.balance = window.HabeshaWallet.get();
      window.HabeshaWallet.subscribe((newBal) => {
        state.balance = newBal;
        updateBalanceUI();
      });
    } else {
      const stored = localStorage.getItem('habesha_balance');
      if (stored) state.balance = parseFloat(stored) || 50000.0;
    }
    updateBalanceUI();
  }

  function updateBalanceUI() {
    const el = document.getElementById('userBalanceText');
    if (el) {
      el.textContent = state.balance.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }
  }

  function deductBalance(amt) {
    if (window.HabeshaWallet) {
      if (window.HabeshaWallet.has(amt)) {
        state.balance = window.HabeshaWallet.modify(-amt);
        return true;
      }
      return false;
    }
    if (state.balance >= amt) {
      state.balance -= amt;
      localStorage.setItem('habesha_balance', state.balance.toString());
      updateBalanceUI();
      return true;
    }
    return false;
  }

  function creditBalance(amt) {
    if (window.HabeshaWallet) {
      state.balance = window.HabeshaWallet.modify(amt);
    } else {
      state.balance += amt;
      localStorage.setItem('habesha_balance', state.balance.toString());
      updateBalanceUI();
    }
  }

  // --- Mock Live Players Database ---
  const MOCK_PLAYERS = [
    { name: 'd***2', avatar: '??', stake: 3765.75, target: 1.45 },
    { name: 'd***2', avatar: '??', stake: 3765.75, target: 1.80 },
    { name: 'd***7', avatar: '???', stake: 3464.66, target: 2.10 },
    { name: 'd***0', avatar: '??', stake: 3405.49, target: 1.35 },
    { name: 'd***0', avatar: '??', stake: 3312.74, target: 3.20 },
    { name: 'd***0', avatar: '??', stake: 3140.47, target: 1.65 },
    { name: 'd***9', avatar: '??', stake: 2689.94, target: 2.75 },
    { name: 'd***2', avatar: '??', stake: 2663.44, target: 1.95 },
    { name: 'd***1', avatar: '???', stake: 2650.19, target: 4.50 },
    { name: 'd***6', avatar: '??', stake: 2650.19, target: 2.25 },
    { name: 'd***9', avatar: '??', stake: 2494.06, target: 1.50 },
    { name: 's***8', avatar: '??', stake: 1820.00, target: 2.80 },
    { name: 'k***4', avatar: '??', stake: 1540.50, target: 1.70 },
    { name: 'm***1', avatar: '??', stake: 980.00, target: 3.60 },
    { name: 'b***5', avatar: '??', stake: 500.00, target: 5.10 }
  ];

  function resetLiveBets() {
    state.liveBets = MOCK_PLAYERS.map(p => ({
      ...p,
      cashed: false,
      win: 0
    }));
    renderLiveBetsList();
  }

  function renderLiveBetsList() {
    const list = document.getElementById('liveBetsList');
    if (!list) return;

    let totalWin = 0;
    let cashedCount = 0;

    let html = '';
    state.liveBets.forEach(item => {
      if (item.cashed) {
        totalWin += item.win;
        cashedCount++;
      }

      html += `
        <div class="bet-row-item ${item.cashed ? 'cashed-out' : ''}">
          <div class="player-info">
            <span class="player-avatar">${item.avatar}</span>
            <span class="player-name">${item.name}</span>
          </div>
          <span class="stake-col">${item.stake.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <div class="mult-col">
            ${item.cashed ? `<span class="mult-badge-chip">${item.target.toFixed(2)}x</span>` : ''}
          </div>
          <span class="win-col ${item.cashed ? 'active-win' : ''}">
            ${item.cashed ? item.win.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
          </span>
        </div>
      `;
    });

    list.innerHTML = html;

    const countLabel = document.getElementById('betsCountText');
    if (countLabel) countLabel.textContent = `${cashedCount + 80}/${state.liveBets.length + 150} Bets`;

    const totalWinEl = document.getElementById('totalWinText');
    if (totalWinEl) {
      totalWinEl.textContent = totalWin.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }

    const progressFill = document.getElementById('betsProgressFill');
    if (progressFill) {
      const pct = Math.min(100, Math.round(((cashedCount + 40) / (state.liveBets.length + 80)) * 100));
      progressFill.style.width = pct + '%';
    }
  }

  // --- Canvas 60FPS Flight Animation ---
  const canvas = document.getElementById('flightCanvas');
  const ctx = canvas.getContext('2d');
  let planeImg = new Image();
  planeImg.src = 'plane.svg';

  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Animation particles
  const stars = Array.from({ length: 45 }, () => ({
    x: Math.random() * 500,
    y: Math.random() * 300,
    speed: 0.5 + Math.random() * 1.5,
    size: 1 + Math.random() * 2
  }));

  function drawScene() {
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, w, h);

    // Dark radar grid / starfield
    ctx.fillStyle = '#08080c';
    ctx.fillRect(0, 0, w, h);

    // Drifting star particles
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    stars.forEach(s => {
      if (state.status === 'FLYING') {
        s.x -= s.speed * 1.8;
        s.y += s.speed * 0.9;
        if (s.x < 0) s.x = w;
        if (s.y > h) s.y = 0;
      }
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    });

    if (state.status === 'FLYING' || state.status === 'CRASHED') {
      const startX = 20;
      const startY = h - 25;

      // Calculate progress across canvas based on multiplier
      const progress = Math.min(1.0, Math.max(0, (state.multiplier - 1.0) / 4.0));
      const endX = startX + progress * (w - 110);
      const endY = startY - Math.pow(progress, 0.75) * (h - 90);

      const cpX = startX + (endX - startX) * 0.45;
      const cpY = startY;

      // 1. Draw glowing red gradient area beneath curve
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(cpX, cpY, endX, endY);
      ctx.lineTo(endX, startY);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, endY, 0, startY);
      grad.addColorStop(0, 'rgba(229, 5, 57, 0.45)');
      grad.addColorStop(0.6, 'rgba(229, 5, 57, 0.15)');
      grad.addColorStop(1, 'rgba(229, 5, 57, 0.0)');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();

      // 2. Draw curved red flight line
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(cpX, cpY, endX, endY);
      ctx.strokeStyle = '#e50539';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = '#e50539';
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.restore();

      // 3. Draw Airplane Sprite
      if (state.status === 'FLYING') {
        ctx.save();
        ctx.translate(endX, endY);
        
        // Calculate tangent angle for natural flight tilt
        const t = 1.0;
        const dx = 2 * (1 - t) * (cpX - startX) + 2 * t * (endX - cpX);
        const dy = 2 * (1 - t) * (cpY - startY) + 2 * t * (endY - cpY);
        let angle = Math.atan2(dy, dx);
        ctx.rotate(angle * 0.55);

        // Airplane image or vector fallback
        if (planeImg.complete && planeImg.naturalWidth > 0) {
          const pw = 68;
          const ph = (68 / 150) * 74;
          ctx.drawImage(planeImg, -pw * 0.35, -ph * 0.65, pw, ph);
        } else {
          ctx.fillStyle = '#e50539';
          ctx.beginPath();
          ctx.moveTo(25, 0);
          ctx.lineTo(-20, -12);
          ctx.lineTo(-12, 0);
          ctx.lineTo(-20, 12);
          ctx.closePath();
          ctx.fill();
        }

        // Spinning propeller glow
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(38, -2, 6, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
      }
    }

    requestAnimationFrame(drawScene);
  }
  requestAnimationFrame(drawScene);

  // --- Game Loop Engine ---
  function generateCrashPoint() {
    const rand = Math.random();
    if (rand < 0.05) return 1.00; // Immediate bust
    if (rand < 0.45) return 1.10 + Math.random() * 1.5; // Low 1.10 - 2.60x
    if (rand < 0.80) return 2.60 + Math.random() * 3.5; // Mid 2.60 - 6.10x
    if (rand < 0.95) return 6.00 + Math.random() * 14.0; // High 6.00 - 20.0x
    return 20.0 + Math.random() * 80.0; // Mega 20x - 100x
  }

  function startWaiting() {
    stopFlySound();
    state.status = 'WAITING';
    state.multiplier = 1.00;
    state.waitStartTime = Date.now();
    state.waitDuration = 5000;

    // Reset panel states
    ['panel1', 'panel2'].forEach(pKey => {
      const p = state[pKey];
      if (p.state === 'QUEUED') {
        p.state = 'IN_FLIGHT';
      } else if (p.state === 'WON' || p.state === 'LOST') {
        p.state = 'IDLE';
      }
    });

    resetLiveBets();
    updateHUD();
    updateBetButtons();
    updateBetControlsLock();
  }

  function startFlight() {
    state.status = 'FLYING';
    state.multiplier = 1.00;
    state.crashPoint = generateCrashPoint();
    state.roundStartTime = Date.now();

    startFlySound();

    // Check if bets placed
    ['panel1', 'panel2'].forEach(pKey => {
      const p = state[pKey];
      if (p.state === 'QUEUED') {
        p.state = 'IN_FLIGHT';
      }
    });

    updateHUD();
    updateBetButtons();
    updateBetControlsLock();
  }

  function crashFlight() {
    state.status = 'CRASHED';
    playCrashSound();

    // Process player losses if in flight
    ['panel1', 'panel2'].forEach(pKey => {
      const p = state[pKey];
      if (p.state === 'IN_FLIGHT') {
        p.state = 'LOST';
      }
    });

    // Add to history
    const cp = state.multiplier;
    let colorClass = 'pill-blue';
    if (cp >= 10.0) colorClass = 'pill-pink';
    else if (cp >= 2.0) colorClass = 'pill-purple';

    state.history.unshift({ mult: cp, color: colorClass });
    if (state.history.length > 25) state.history.pop();
    renderHistory();

    updateHUD();
    updateBetButtons();
    updateBetControlsLock();

    // Schedule next round
    setTimeout(() => {
      startWaiting();
    }, 2500);
  }

  function gameTick() {
    const now = Date.now();

    if (state.status === 'WAITING') {
      const elapsed = now - state.waitStartTime;
      const pct = Math.min(100, Math.max(0, (elapsed / state.waitDuration) * 100));
      const fill = document.getElementById('waitProgressFill');
      if (fill) fill.style.width = pct + '%';

      if (elapsed >= state.waitDuration) {
        startFlight();
      }
    } else if (state.status === 'FLYING') {
      const elapsed = (now - state.roundStartTime) / 1000;
      
      // Exponential curve: starts gentle, accelerates upwards
      state.multiplier = 1.00 + Math.pow(elapsed * 0.9, 1.45) * 0.12 + elapsed * 0.06;
      updateFlyPitch(state.multiplier);

      // Check simulated players cashout
      state.liveBets.forEach(b => {
        if (!b.cashed && state.multiplier >= b.target && b.target <= state.crashPoint) {
          b.cashed = true;
          b.win = Math.round(b.stake * b.target * 100) / 100;
          renderLiveBetsList();
        }
      });

      // Update cashout button values
      ['panel1', 'panel2'].forEach((pKey, idx) => {
        const p = state[pKey];
        if (p.state === 'IN_FLIGHT') {
          const winVal = (p.amount * state.multiplier).toFixed(2);
          const subEl = document.getElementById(`btnSub${idx + 1}`);
          if (subEl) subEl.textContent = `${winVal} ETB`;
        }
      });

      if (state.multiplier >= state.crashPoint) {
        state.multiplier = state.crashPoint;
        crashFlight();
      }

      updateHUD();
    }
  }
  setInterval(gameTick, 30);

  // --- UI Update Helpers ---
  function updateHUD() {
    const multEl = document.getElementById('multText');
    const flewEl = document.getElementById('flewAwayText');
    const waitBox = document.getElementById('waitingBox');

    if (state.status === 'FLYING') {
      if (multEl) {
        multEl.classList.remove('hidden', 'crashed');
        multEl.textContent = state.multiplier.toFixed(2) + 'x';
      }
      if (flewEl) flewEl.classList.add('hidden');
      if (waitBox) waitBox.classList.add('hidden');
    } else if (state.status === 'CRASHED') {
      if (multEl) {
        multEl.classList.remove('hidden');
        multEl.classList.add('crashed');
        multEl.textContent = state.multiplier.toFixed(2) + 'x';
      }
      if (flewEl) flewEl.classList.remove('hidden');
      if (waitBox) waitBox.classList.add('hidden');
    } else if (state.status === 'WAITING') {
      if (multEl) multEl.classList.add('hidden');
      if (flewEl) flewEl.classList.add('hidden');
      if (waitBox) waitBox.classList.remove('hidden');
    }
  }

  function isPanelLocked(panelNum) {
    const pKey = `panel${panelNum}`;
    const p = state[pKey];
    // Once the round starts (FLYING or CRASHED), bet amount cannot be edited.
    // Also while a bet is queued or in flight, it cannot be edited.
    return state.status === 'FLYING' || state.status === 'CRASHED' || p.state === 'QUEUED' || p.state === 'IN_FLIGHT';
  }

  function updateBetControlsLock() {
    [1, 2].forEach(num => {
      const locked = isPanelLocked(num);
      const input = document.getElementById(`betInput${num}`);
      const minus = document.getElementById(`stepMinus${num}`);
      const plus = document.getElementById(`stepPlus${num}`);
      const stepperRow = input ? input.closest('.stepper-row') : null;
      const chips = document.querySelectorAll(`.quick-chip[data-panel="${num}"]`);

      if (minus) {
        minus.disabled = locked;
        minus.classList.toggle('is-locked', locked);
      }
      if (plus) {
        plus.disabled = locked;
        plus.classList.toggle('is-locked', locked);
      }
      if (input) {
        input.disabled = locked;
        input.readOnly = locked;
      }
      if (stepperRow) {
        stepperRow.classList.toggle('is-locked', locked);
      }
      chips.forEach(chip => {
        chip.disabled = locked;
        chip.classList.toggle('is-locked', locked);
      });
    });
  }

  function updateBetButtons() {
    ['panel1', 'panel2'].forEach((pKey, idx) => {
      const p = state[pKey];
      const panelNum = idx + 1;
      const btn = document.getElementById(`actionBtn${panelNum}`);
      const primary = document.getElementById(`btnLabel${panelNum}`);
      const sub = document.getElementById(`btnSub${panelNum}`);
      if (!btn || !primary || !sub) return;

      btn.className = 'action-btn';

      if (p.state === 'IDLE') {
        btn.classList.add('btn-bet');
        primary.textContent = 'Bet';
        sub.textContent = `${p.amount.toFixed(2)} ETB`;
      } else if (p.state === 'QUEUED') {
        btn.classList.add('btn-waiting');
        primary.textContent = 'Waiting';
        sub.textContent = 'Cancel';
      } else if (p.state === 'IN_FLIGHT') {
        if (state.status === 'WAITING') {
          btn.classList.add('btn-waiting');
          primary.textContent = 'Waiting';
          sub.textContent = 'Cancel';
        } else {
          btn.classList.add('btn-cashout');
          primary.textContent = 'Cash Out';
          sub.textContent = `${(p.amount * state.multiplier).toFixed(2)} ETB`;
        }
      } else if (p.state === 'WON') {
        btn.classList.add('btn-won');
        primary.textContent = 'Won';
        sub.textContent = `+${p.payout.toFixed(2)} ETB`;
      } else if (p.state === 'LOST') {
        btn.classList.add('btn-lost');
        primary.textContent = 'Lost';
        sub.textContent = `${p.amount.toFixed(2)} ETB`;
      }
    });
  }

  function handleBetClick(panelNum) {
    const pKey = `panel${panelNum}`;
    const p = state[pKey];

    if (p.state === 'IDLE') {
      if (deductBalance(p.amount)) {
        playBetPlacedSound();
        startFlySound(); // Fly sound accompanies ticket cut!
        if (state.status === 'WAITING') {
          p.state = 'IN_FLIGHT';
        } else {
          p.state = 'QUEUED';
        }
      } else {
        alert('Insufficient balance. Please deposit ETB to continue playing.');
      }
    } else if (p.state === 'QUEUED') {
      playClickSound();
      // Cancel queued bet
      creditBalance(p.amount);
      p.state = 'IDLE';
      if (state.status === 'WAITING' && state.panel1.state === 'IDLE' && state.panel2.state === 'IDLE') {
        stopFlySound();
      }
    } else if (p.state === 'IN_FLIGHT') {
      if (state.status === 'WAITING') {
        playClickSound();
        // Cancel bet placed during waiting
        creditBalance(p.amount);
        p.state = 'IDLE';
        if (state.panel1.state === 'IDLE' && state.panel2.state === 'IDLE') {
          stopFlySound();
        }
      } else {
        // Cash out!
        const winAmt = Math.round(p.amount * state.multiplier * 100) / 100;
        p.payout = winAmt;
        p.cashedAt = state.multiplier;
        creditBalance(winAmt);
        playWinSound();
        p.state = 'WON';
      }
    }

    updateBetButtons();
    updateBetControlsLock();
  }

  function renderHistory() {
    const container = document.getElementById('historyScroll');
    if (!container) return;
    container.innerHTML = state.history.map(item => `
      <span class="mult-pill ${item.color}">${item.mult.toFixed(2)}x</span>
    `).join('');
  }

  // --- Bind Event Listeners ---
  function setupEvents() {
    // Bet Buttons
    const btn1 = document.getElementById('actionBtn1');
    if (btn1) btn1.addEventListener('click', () => handleBetClick(1));

    const btn2 = document.getElementById('actionBtn2');
    if (btn2) btn2.addEventListener('click', () => handleBetClick(2));

    // Steppers & Quick Chips
    [1, 2].forEach(num => {
      const pKey = `panel${num}`;
      const input = document.getElementById(`betInput${num}`);
      const minus = document.getElementById(`stepMinus${num}`);
      const plus = document.getElementById(`stepPlus${num}`);

      if (minus) {
        minus.addEventListener('click', () => {
          if (isPanelLocked(num)) return;
          playClickSound();
          state[pKey].amount = Math.max(1, state[pKey].amount - 1);
          if (input) input.value = state[pKey].amount.toFixed(2);
          updateBetButtons();
        });
      }

      if (plus) {
        plus.addEventListener('click', () => {
          if (isPanelLocked(num)) return;
          playClickSound();
          state[pKey].amount = Math.min(10000, state[pKey].amount + 1);
          if (input) input.value = state[pKey].amount.toFixed(2);
          updateBetButtons();
        });
      }

      if (input) {
        input.addEventListener('change', () => {
          if (isPanelLocked(num)) {
            input.value = state[pKey].amount.toFixed(2);
            return;
          }
          const val = parseFloat(input.value) || 1;
          state[pKey].amount = Math.max(1, Math.min(10000, val));
          input.value = state[pKey].amount.toFixed(2);
          updateBetButtons();
        });
        input.addEventListener('keydown', (e) => {
          if (isPanelLocked(num)) {
            e.preventDefault();
          }
        });
      }

      document.querySelectorAll(`.quick-chip[data-panel="${num}"]`).forEach(chip => {
        chip.addEventListener('click', () => {
          if (isPanelLocked(num)) return;
          playClickSound();
          const amt = parseFloat(chip.dataset.amt);
          state[pKey].amount = amt;
          if (input) input.value = amt.toFixed(2);
          updateBetButtons();
        });
      });
    });

    // Panel 2 Collapse Toggle
    const toggleBtn2 = document.getElementById('toggleCard2Btn');
    const card2 = document.getElementById('betCard2');
    if (toggleBtn2 && card2) {
      toggleBtn2.addEventListener('click', () => {
        playClickSound();
        state.panel2.collapsed = !state.panel2.collapsed;
        card2.classList.toggle('collapsed', state.panel2.collapsed);
        toggleBtn2.innerHTML = state.panel2.collapsed
          ? '<svg width="12" height="12" viewBox="0 0 24 24"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>'
          : '<svg width="12" height="12" viewBox="0 0 24 24"><path fill="currentColor" d="M19 13H5v-2h14v2z"/></svg>';
      });
    }

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(tab => {
      tab.addEventListener('click', () => {
        playClickSound();
        document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.activeTab = tab.dataset.tab;
        renderLiveBetsList();
      });
    });
  }

  // --- Initialize App ---
  function init() {
    initWallet();
    renderHistory();
    resetLiveBets();
    setupEvents();
    startWaiting();
    updateBetControlsLock();

    // Enable audio context silently upon user's first tap/click anywhere
    const unlockAudio = () => {
      resumeAudioContext();
    };
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    window.addEventListener('touchstart', unlockAudio, { once: true });

    if (window.hideGameLoader) {
      window.hideGameLoader(300);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
