// Spribe Aviator Official Mobile View Game Engine - Multi-Device Synchronized Edition
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
    if (audioClips.fly && !audioClips.fly.paused) {
      const rate = Math.min(2.5, Math.max(0.85, 1.0 + (mult - 1.0) * 0.08));
      audioClips.fly.playbackRate = rate;
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

  function playCrashSound() {
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
  }

  function playClickSound() {
    if (!audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.04);
    } catch(e) {}
  }

  function playBetPlacedSound() {
    if (!audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1040, audioCtx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.08);
    } catch(e) {}
  }

  function playWinSound() {
    if (!audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.06);
        gain.gain.setValueAtTime(0.15, now + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.01, now + (i + 1) * 0.06 + 0.08);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + i * 0.06);
        osc.stop(now + (i + 1) * 0.06 + 0.08);
      });
    } catch(e) {}
  }

  // --- Global Clock Synchronization Engine ---
  let serverTimeOffset = 0;
  async function syncServerTime() {
    try {
      const t0 = Date.now();
      const resp = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
      const t1 = Date.now();
      const sDate = resp.headers.get('Date');
      if (sDate) {
        const serverMs = new Date(sDate).getTime();
        const roundTrip = t1 - t0;
        serverTimeOffset = Math.round(serverMs - (t0 + roundTrip / 2));
      }
    } catch(e) {
      serverTimeOffset = 0;
    }
  }
  function getSyncedNow() {
    return Date.now() + serverTimeOffset;
  }
  setInterval(syncServerTime, 180000); // Re-sync every 3 minutes

  // --- Seeded Deterministic Math Engine ---
  function mulberry32(a) {
    return function() {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function stringToSeed(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  function getAviatorFlightDuration(targetMult) {
    if (targetMult <= 1.00) return 0;
    let low = 0, high = 150;
    for (let i = 0; i < 20; i++) {
      const mid = (low + high) / 2;
      const m = 1.00 + Math.pow(mid * 0.9, 1.45) * 0.12 + mid * 0.06;
      if (m < targetMult) low = mid;
      else high = mid;
    }
    return low;
  }

  function getAviatorRoundData(roundIndex) {
    const seed = stringToSeed("aviator_sync_master_v1_" + roundIndex);
    const rng = mulberry32(seed);
    const margin = (window.HabeshaWallet && typeof window.HabeshaWallet.getGameMargin === 'function')
      ? (window.HabeshaWallet.getGameMargin('aviator', 6.0) / 100)
      : 0.06;
    const r1 = rng();
    let mult;
    if (r1 < margin) {
      mult = 1.00;
    } else {
      const r2 = rng();
      const raw = (1 - margin) / (1 - r2);
      mult = Math.max(1.00, Math.min(250.00, Math.floor(raw * 100) / 100));
    }
    const flightSec = getAviatorFlightDuration(mult);
    const flightMs = Math.round(flightSec * 1000);
    const waitMs = 5000;
    const cooldownMs = 3000;
    const totalMs = waitMs + flightMs + cooldownMs;
    return { roundIndex, mult, waitMs, flightMs, cooldownMs, totalMs };
  }

  const AVIATOR_CHECKPOINTS = [
    [1,1794355200000],[37608,1794960032337],[75105,1795564803295],[112781,1796169603284],
    [149928,1796774449086],[187327,1797379206071],[224539,1797984000730],[261890,1798588800952],
    [299449,1799193600027],[336453,1799798406085],[373996,1800403202891],[411605,1801008006554],
    [448825,1801612817979],[486040,1802217609922],[523621,1802822424350],[560790,1803427207928],
    [598209,1804032010269],[635185,1804636931096],[672341,1805241604147],[710055,1805846417081],
    [747323,1806451204585],[784348,1807056008703],[821645,1807660801361],[858900,1808265603594],
    [896272,1808870404968],[933830,1809475209955],[971112,1810080079664],[1008253,1810684815793],
    [1045955,1811289605595],[1083158,1811894442139],[1120607,1812499200839],[1157664,1813104023599],
    [1195151,1813708810537],[1232279,1814313618739],[1269780,1814918407711],[1307423,1815523209929],
    [1344512,1816128005832],[1382224,1816732803716],[1419140,1817337613929],[1456601,1817942420955],
    [1493868,1818547209202],[1531020,1819152006086],[1568252,1819756805624],[1605433,1820361603136],
    [1643073,1820966410465],[1680403,1821571209000],[1717597,1822176008264],[1755024,1822780812931],
    [1792352,1823385621455],[1829622,1823990402459],[1866442,1824595226635],[1903854,1825200005361],
    [1940983,1825804801363]
  ];

  function findAviatorRound(syncedNow) {
    let cpIndex = 0;
    for (let i = AVIATOR_CHECKPOINTS.length - 1; i >= 0; i--) {
      if (syncedNow >= AVIATOR_CHECKPOINTS[i][1]) {
        cpIndex = i;
        break;
      }
    }
    let roundIdx = AVIATOR_CHECKPOINTS[cpIndex][0];
    let currTime = AVIATOR_CHECKPOINTS[cpIndex][1];

    while (true) {
      const rData = getAviatorRoundData(roundIdx);
      if (currTime + rData.totalMs > syncedNow) {
        const elapsedInRound = syncedNow - currTime;
        let phase = 'WAITING';
        let multiplier = 1.00;
        let countdown = 0;

        if (elapsedInRound < rData.waitMs) {
          phase = 'WAITING';
          countdown = (rData.waitMs - elapsedInRound) / 1000;
        } else if (elapsedInRound < rData.waitMs + rData.flightMs) {
          phase = 'FLYING';
          const flightElapsed = (elapsedInRound - rData.waitMs) / 1000;
          multiplier = Math.min(rData.mult, 1.00 + Math.pow(flightElapsed * 0.9, 1.45) * 0.12 + flightElapsed * 0.06);
        } else {
          phase = 'CRASHED';
          multiplier = rData.mult;
        }

        return {
          roundIndex: roundIdx,
          roundStartTime: currTime,
          data: rData,
          elapsedInRound,
          phase,
          multiplier: Number(multiplier.toFixed(2)),
          countdown: Number(countdown.toFixed(1))
        };
      }
      currTime += rData.totalMs;
      roundIdx++;
    }
  }

  // --- Game State ---
  const state = {
    balance: 0.0,
    status: 'WAITING', // 'WAITING', 'FLYING', 'CRASHED'
    multiplier: 1.00,
    crashPoint: 1.00,
    roundStartTime: 0,
    waitStartTime: 0,
    waitDuration: 5000,
    currentRoundIndex: 0,
    history: [],
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
  function updateModeBanner() {
    const banner = document.getElementById('modeBanner') || document.querySelector('.fun-mode-banner');
    if (!banner) return;
    const wallet = window.FriendesWallet || window.HabeshaWallet;
    let mode = 'real';
    try {
      const p = new URLSearchParams(window.location.search);
      const urlM = p.get('mode');
      if (urlM === 'demo') {
        mode = 'demo';
      } else if (urlM === 'real') {
        mode = 'real';
      } else if (wallet && typeof wallet.getMode === 'function') {
        mode = wallet.getMode();
      } else if (localStorage.getItem('habesha_wallet_mode') === 'demo') {
        mode = 'demo';
      }
    } catch (e) {
      if (wallet && typeof wallet.getMode === 'function') mode = wallet.getMode();
    }

    if (mode === 'demo') {
      banner.textContent = 'FUN MODE';
      banner.classList.add('demo-mode');
      banner.classList.remove('real-mode');
    } else {
      banner.textContent = 'REAL';
      banner.classList.remove('demo-mode');
      banner.classList.add('real-mode');
    }
  }

  function initWallet() {
    const wallet = window.FriendesWallet || window.HabeshaWallet;
    if (wallet) {
      state.balance = wallet.get();
      wallet.subscribe((newBal) => {
        state.balance = newBal;
        updateBalanceUI();
        updateModeBanner();
      });
    } else {
      const stored = localStorage.getItem('habesha_balance');
      if (stored) {
        state.balance = parseFloat(stored) || 0.0;
      } else {
        state.balance = 0.0;
      }
    }
    updateBalanceUI();
    updateModeBanner();
  }

  window.addEventListener('habesha_balance_updated', () => {
    updateModeBanner();
    updateBalanceUI();
  });
  window.addEventListener('storage', (e) => {
    if (e.key === 'habesha_wallet_mode' || e.key === 'habesha_balance' || e.key === 'habesha_demo_balance') {
      updateModeBanner();
      updateBalanceUI();
    }
  });

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
    const wallet = window.FriendesWallet || window.HabeshaWallet;
    if (wallet) {
      if (wallet.has(amt)) {
        state.balance = wallet.modify(-amt, 'Aviator', 'stake');
        updateBalanceUI();
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
    const wallet = window.FriendesWallet || window.HabeshaWallet;
    if (wallet) {
      state.balance = wallet.modify(amt);
    } else {
      state.balance += amt;
      localStorage.setItem('habesha_balance', state.balance.toString());
    }
    updateBalanceUI();
  }

  // --- Mock Live Players Database ---
  const MOCK_PLAYERS = [
    { name: 'd***2', avatar: '😎', stake: 3765.75, target: 1.45 },
    { name: 'd***2', avatar: '🦁', stake: 3765.75, target: 1.80 },
    { name: 'd***7', avatar: '🚀', stake: 3464.66, target: 2.10 },
    { name: 'd***0', avatar: '🔥', stake: 3405.49, target: 1.35 },
    { name: 'd***0', avatar: '💰', stake: 3312.74, target: 3.20 },
    { name: 'd***0', avatar: '⭐', stake: 3140.47, target: 1.65 },
    { name: 'd***9', avatar: '👑', stake: 2689.94, target: 2.75 },
    { name: 'd***2', avatar: '⚡', stake: 2663.44, target: 1.95 },
    { name: 'd***1', avatar: '🎲', stake: 2650.19, target: 4.50 },
    { name: 'd***6', avatar: '🏆', stake: 2650.19, target: 2.25 },
    { name: 'd***9', avatar: '💎', stake: 2494.06, target: 1.50 },
    { name: 's***8', avatar: '🎯', stake: 1820.00, target: 2.80 },
    { name: 'k***4', avatar: '🔮', stake: 1540.50, target: 1.70 },
    { name: 'm***1', avatar: '✈️', stake: 980.00, target: 3.60 },
    { name: 'b***5', avatar: '🍀', stake: 500.00, target: 5.10 }
  ];

  function resetLiveBets(roundIndex) {
    const rng = mulberry32(stringToSeed("aviator_players_" + roundIndex));
    state.liveBets = MOCK_PLAYERS.map(p => {
      const target = Number((1.15 + rng() * 4.5).toFixed(2));
      const stakeMultiplier = [0.5, 0.8, 1.0, 1.2, 1.5, 2.0][Math.floor(rng() * 6)];
      return {
        ...p,
        stake: Math.round(p.stake * stakeMultiplier * 100) / 100,
        target,
        cashed: false,
        win: 0
      };
    });
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

  // --- Realtime Continuous Synchronized Engine Loop ---
  let lastRecordedCrashRound = 0;

  function gameTick() {
    const syncedNow = getSyncedNow();
    const round = findAviatorRound(syncedNow);

    // 1. Detect New Round Transition
    if (state.currentRoundIndex !== round.roundIndex) {
      state.currentRoundIndex = round.roundIndex;
      state.crashPoint = round.data.mult;
      state.roundStartTime = round.roundStartTime + round.data.waitMs;
      state.waitStartTime = round.roundStartTime;
      state.waitDuration = round.data.waitMs;
      state.userCashoutsThisRound = [];
      state.hasSharedThisRound = false;

      // Transition panels: QUEUED bets become active in new round
      ['panel1', 'panel2'].forEach(pKey => {
        const p = state[pKey];
        if (p.state === 'QUEUED') {
          p.state = 'IN_FLIGHT';
        } else if (p.state === 'WON' || p.state === 'LOST') {
          p.state = 'IDLE';
        }
      });

      resetLiveBets(round.roundIndex);
      updateBetButtons();
      updateBetControlsLock();
    }

    // 2. Handle Current Round Phase
    if (round.phase === 'WAITING') {
      if (state.status !== 'WAITING') {
        stopFlySound();
        state.status = 'WAITING';
        state.multiplier = 1.00;
      }
      const elapsed = round.elapsedInRound;
      const pct = Math.min(100, Math.max(0, (elapsed / round.data.waitMs) * 100));
      const fill = document.getElementById('waitProgressFill');
      if (fill) fill.style.width = pct + '%';

      updateHUD();
      updateBetButtons();
      updateBetControlsLock();

    } else if (round.phase === 'FLYING') {
      if (state.status !== 'FLYING') {
        state.status = 'FLYING';
        startFlySound(true);
        ['panel1', 'panel2'].forEach(pKey => {
          const p = state[pKey];
          if (p.state === 'QUEUED') {
            p.state = 'IN_FLIGHT';
          }
        });
      }

      state.multiplier = round.multiplier;
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

      updateHUD();
      updateBetButtons();
      updateBetControlsLock();

    } else if (round.phase === 'CRASHED') {
      if (state.status !== 'CRASHED') {
        state.status = 'CRASHED';
        state.multiplier = round.data.mult;
        playCrashSound();
        stopFlySound();

        // Process player losses if in flight
        ['panel1', 'panel2'].forEach(pKey => {
          const p = state[pKey];
          if (p.state === 'IN_FLIGHT') {
            p.state = 'LOST';
          }
        });

        // Add to history pill if not already added
        if (lastRecordedCrashRound !== round.roundIndex) {
          lastRecordedCrashRound = round.roundIndex;
          const cp = round.data.mult;
          let colorClass = 'pill-blue';
          if (cp >= 10.0) colorClass = 'pill-pink';
          else if (cp >= 2.0) colorClass = 'pill-purple';

          state.history.unshift({ mult: cp, color: colorClass });
          if (state.history.length > 25) state.history.pop();
          renderHistory();

          // Win card sharing strictly AFTER round crash (never during flight)
          // Only high multiplier cashouts (>= 10.0x) or high rounds (>= 20.0x) are shared
          if (window.aviatorChat && !state.hasSharedThisRound) {
            state.hasSharedThisRound = true;
            const finalCrash = cp;

            // Check if current user cashed out at a high multiplier (>= 10.0x)
            let userWin = null;
            if (state.userCashoutsThisRound && state.userCashoutsThisRound.length > 0) {
              const eligible = state.userCashoutsThisRound.filter(c => c.multiplier >= 10.0);
              if (eligible.length > 0) {
                eligible.sort((a, b) => b.multiplier - a.multiplier);
                userWin = eligible[0];
              }
            }

            if (userWin) {
              window.aviatorChat.shareWin({
                multiplier: userWin.multiplier,
                win: userWin.win,
                bet: userWin.bet,
                round: finalCrash
              });
            } else if (finalCrash >= 20.0) {
              // High round! Share top player of this round (e.g. crash 50x -> cashout ~48x)
              const simPct = 0.86 + (Math.sin(round.roundIndex * 9301 + 49297) * 0.5 + 0.5) * 0.11;
              const simMult = Number((finalCrash * simPct).toFixed(2));
              const simBetList = [10, 20, 50, 100];
              const simBet = simBetList[Math.abs(round.roundIndex) % simBetList.length];
              const simWin = Number((simMult * simBet).toFixed(2));
              const simAvatars = ['🍀', '🦁', '🦒', '💎', '👑', '🚀'];
              const simNames = ['+***6', '+***5', '+***2', '+***9', '+***8'];
              const simComments = ['Wow! 😮', 'Congratulations 👏', 'Boom! What a round 🎉', 'Nice cashout! 🔥'];
              const chosenAvatar = simAvatars[Math.abs(round.roundIndex) % simAvatars.length];
              const chosenName = simNames[Math.abs(round.roundIndex) % simNames.length];
              const chosenComment = simComments[Math.abs(round.roundIndex) % simComments.length];

              const winId = 'round_win_' + round.roundIndex;
              const timeStr = window.aviatorChat.formatTime();

              window.aviatorChat.seenMessageIds.add(winId);
              window.aviatorChat.addWinCard({
                id: winId,
                sender: chosenName,
                avatar: chosenAvatar,
                comment: chosenComment,
                cashedOut: simMult,
                winAmount: simWin,
                roundMult: finalCrash,
                betAmount: simBet,
                time: timeStr,
                gameName: 'Aviator'
              });

              window.aviatorChat.broadcastPayload({
                type: 'win_card',
                id: winId,
                sender: chosenName,
                avatar: chosenAvatar,
                comment: chosenComment,
                cashedOut: simMult,
                winAmount: simWin,
                roundMult: finalCrash,
                betAmount: simBet,
                time: timeStr,
                gameName: 'Aviator',
                uid: 'system_round_' + round.roundIndex
              });
            }
          }
        }

        updateHUD();
        updateBetButtons();
        updateBetControlsLock();
      }
    }
  }

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
    return p.state === 'QUEUED' || p.state === 'IN_FLIGHT';
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
        if (state.status === 'WAITING') {
          sub.textContent = `${p.amount.toFixed(2)} ETB`;
        } else {
          sub.textContent = `(Next Round)`;
        }
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
      creditBalance(p.amount);
      p.state = 'IDLE';
    } else if (p.state === 'IN_FLIGHT') {
      if (state.status === 'WAITING') {
        playClickSound();
        creditBalance(p.amount);
        p.state = 'IDLE';
      } else {
        // Cash out!
        const rawWin = Math.round(p.amount * state.multiplier * 100) / 100;
        const maxWin = Math.min(2500, p.amount * 50);
        const winAmt = Math.min(rawWin, maxWin);
        p.payout = winAmt;
        p.cashedAt = state.multiplier;
        creditBalance(winAmt);
        playWinSound();
        p.state = 'WON';

        // Record cashout for evaluation strictly after round crashes (never leak round mid-flight)
        if (!state.userCashoutsThisRound) state.userCashoutsThisRound = [];
        state.userCashoutsThisRound.push({
          multiplier: state.multiplier,
          win: winAmt,
          bet: p.amount
        });
      }
    }

    updateBetButtons();
    updateBetControlsLock();
  }

  function initHistory(currentRoundIndex) {
    state.history = [];
    for (let i = 1; i <= 25; i++) {
      const pastIdx = currentRoundIndex - i;
      if (pastIdx > 0) {
        const rData = getAviatorRoundData(pastIdx);
        let colorClass = 'pill-blue';
        if (rData.mult >= 10.0) colorClass = 'pill-pink';
        else if (rData.mult >= 2.0) colorClass = 'pill-purple';
        state.history.push({ mult: rData.mult, color: colorClass });
      }
    }
    renderHistory();
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
  async function init() {
    initWallet();
    await syncServerTime();

    const initialRound = findAviatorRound(getSyncedNow());
    state.currentRoundIndex = initialRound.roundIndex;
    initHistory(initialRound.roundIndex);

    resetLiveBets(initialRound.roundIndex);
    setupEvents();

    // Initialize In-Game Community Live Chat & Rain System
    try {
      if (typeof InGameChat !== 'undefined') {
        window.aviatorChat = new InGameChat({
          gameName: 'aviator',
          mountBtn: '#chatToggleBtn'
        });
        const fab = document.getElementById('chatFab');
        if (fab) {
          fab.addEventListener('click', () => {
            if (window.aviatorChat) window.aviatorChat.toggle();
          });
        }
      }
    } catch(e) {
      console.warn('Chat init error:', e);
    }

    gameTick();
    setInterval(gameTick, 30);
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
