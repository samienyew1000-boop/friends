/**
 * Chicken Crash Canvas Game Engine - HD Production Edition
 * Implements step-by-step GO! mechanics, car stopping physics, road barrier, and Image 1 & Image 2 visuals.
 */

class ChickenCrashGame {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');

    // Canvas Dimensions
    this.width = this.canvas.width = this.canvas.parentElement.clientWidth;
    this.height = this.canvas.height = this.canvas.parentElement.clientHeight;

    // State Variables
    this.state = 'IDLE'; // 'IDLE', 'RUNNING', 'CRASHED', 'CASHED_OUT'
    this.riskLevel = 'EASY'; // 'EASY', 'MEDIUM', 'HARD'
    this.balance = this.getBalance();
    this.betAmount = 6.00;
    this.currentMultiplier = 1.0;
    this.currentLane = 0;
    this.targetLane = 0;
    this.laneTransitionProgress = 1.0;
    this.setupWalletSync();

    // Display mode: 'CASH' (e.g. 6.36 FUN from Image 1) or 'MULTIPLIER' (e.g. 1.06x from Image 2)
    this.displayMode = 'CASH';

    // 80/20 Dynamic Profit & RTP Engine
    this.targetRTP = 0.80; // 80% player return / 20% house profit margin
    this.sessionStats = {
      totalBet: 0,
      totalWon: 0,
      rounds: 0
    };
    this.isCrashStep = false;

    // Roadblock Barrier (Image 2)
    this.barrier = {
      laneIndex: 1,
      x: this.width * 0.44 - 46,
      direction: 1, // 1 = traffic from left (barrier on left), -1 = traffic from right (barrier on right & flipped)
      visible: false,
      alpha: 1.0
    };

    // Camera / Road Scrolling
    this.cameraY = 0;
    this.targetCameraY = 0;

    // Screen Shake on Crash
    this.screenShake = 0;

    // Roadway Specifications (Calibrated to official lowLevelBg.webp 1080x2087 texture)
    this.lanes = [];
    this.totalLanes = 36;
    this.vehicles = [];

    // Scale factor based on canvas width vs 1080px base texture
    this.scale = this.width / 1080;
    this.laneHeight = 76 * this.scale;

    // Chicken Entity State
    this.chicken = {
      x: this.width * 0.44, // Centered on road
      y: 70 * this.scale,
      width: 38,
      height: 68,
      animTime: 0,
      blinkTimer: 0,
      isBlinking: false,
      isDead: false,
      feathers: [],
      winCoins: []
    };

    // Load High-Fidelity Official Assets
    this.loadAssets();

    // Sound Engine (Web Audio API Sprite + Ambient Music)
    this.initAudio();

    // Build Lanes & Multipliers
    this.generateLanes();
    this.setupEventListeners();
    this.resize();

    // Start 60 FPS Render Loop
    this.lastTime = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ---------------- UNIFIED WALLET INTEGRATION ----------------
  getWallet() {
    return window.FriendesWallet || window.HabeshaWallet || null;
  }

  getBalance() {
    const w = this.getWallet();
    if (w && typeof w.get === 'function') {
      return w.get();
    }
    const stored = localStorage.getItem('habesha_balance');
    return stored !== null && !isNaN(parseFloat(stored)) ? parseFloat(stored) : 0.00;
  }

  modifyBalance(delta, method = 'stake') {
    const w = this.getWallet();
    if (w && typeof w.modify === 'function') {
      return w.modify(delta, 'Chicken Crash', method);
    }
    const cur = this.getBalance();
    const next = Math.max(0, Math.round((cur + delta) * 100) / 100);
    localStorage.setItem('habesha_balance', next.toFixed(2));
    window.dispatchEvent(new CustomEvent('habesha_balance_updated', {
      detail: { balance: next }
    }));
    return next;
  }

  setupWalletSync() {
    const w = this.getWallet();
    if (w && typeof w.subscribe === 'function') {
      w.subscribe((newBal) => {
        this.balance = newBal;
        this.updateBalanceUI();
      });
    }

    window.addEventListener('habesha_balance_updated', (e) => {
      if (e.detail && typeof e.detail.balance === 'number') {
        this.balance = e.detail.balance;
        this.updateBalanceUI();
      }
    });

    window.addEventListener('storage', (e) => {
      if (e.key === 'habesha_balance' || e.key === 'habesha_demo_balance' || e.key === 'habesha_wallet_mode') {
        this.balance = this.getBalance();
        this.updateBalanceUI();
      }
    });

    window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'HABESHA_BALANCE_UPDATE') {
        this.balance = parseFloat(e.data.balance) || 0;
        this.updateBalanceUI();
      }
    });
  }

  loadAssets() {
    this.assets = {
      bgRoad: new Image(),
      tireTrack: new Image(),
      tireTrackGreen: new Image(),
      roadBarrier: new Image(),
      chicken3d: new Image(),
      chickenFull: new Image(),
      deathSign: new Image(),
      feather: new Image(),
      gameLogo: new Image(),
      cars: {
        vaz: new Image(), // Red sedan from Image 2
        raf: new Image(), // Green van from Image 2
        niva: new Image(), // Blue sedan from Image 2
        zil: new Image(),
        gaz: new Image()
      }
    };

    // Sources (Relative paths with accurate asset locations)
    this.assets.bgRoad.src = 'img/lowLevelBg.webp';
    this.assets.tireTrack.src = 'img/tire_track.png';
    this.assets.tireTrackGreen.src = 'img/tire_track_green.png';
    this.assets.roadBarrier.src = 'img/road_barrier.png';
    this.assets.chicken3d.src = 'img/chicken_3d_perfect_hd.png';
    this.assets.chickenFull.src = 'img/chicken_full.png';
    this.assets.deathSign.src = 'img/death_sign.png';
    this.assets.feather.src = 'img/feather.png';
    this.assets.gameLogo.src = 'img/gameLogo.webp';

    // 3D Car Composited Models with Wheels
    this.assets.cars.vaz.src = 'img/cars/car_red.png';
    this.assets.cars.raf.src = 'img/cars/car_green.png';
    this.assets.cars.niva.src = 'img/cars/car_blue.png';
    this.assets.cars.zil.src = 'img/cars/zil.png';
    this.assets.cars.gaz.src = 'img/cars/gaz1.png';
  }

  initAudio() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();

      // Official sound sprite markers extracted from Galaxsys client bundle
      this.soundSprites = {
        carMove1: { start: 1.0, duration: 2.4 },
        carMove2: { start: 4.0, duration: 2.7 },
        carMove3: { start: 7.0, duration: 2.5 },
        ambulance: { start: 10.0, duration: 2.5 },
        police: { start: 13.0, duration: 3.0 },
        carMove4: { start: 18.0, duration: 2.5 },
        crash: { start: 21.0, duration: 2.0 },
        win: { start: 24.0, duration: 3.0 },
        click: { start: 28.0, duration: 0.5 },
        car_stop: { start: 31.0, duration: 1.6 },
        stopped_car_horn: { start: 32.0, duration: 0.8 },
        step: { start: 28.0, duration: 0.25 }
      };

      // Background ambient soundtrack
      this.bgMusic = new Audio('sounds/background.mp3');
      this.bgMusic.loop = true;
      this.bgMusic.volume = 0.20;

      const unlockAudio = () => {
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
          this.audioCtx.resume();
        }
        if (this.bgMusic && this.bgMusic.paused) {
          this.bgMusic.play().catch(() => {});
        }
      };
      window.addEventListener('click', unlockAudio);
      window.addEventListener('touchstart', unlockAudio);

      // Load official audio buffer
      fetch('sounds/sounds.mp3')
        .then(res => res.arrayBuffer())
        .then(buf => this.audioCtx.decodeAudioData(buf))
        .then(decoded => {
          this.audioBuffer = decoded;
        })
        .catch(err => {
          console.warn('Audio sprite fetch warning:', err);
        });
    } catch (e) {
      this.audioCtx = null;
    }
  }

  playAudioSprite(spriteName) {
    if (!this.audioCtx) return;
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    if (this.audioBuffer && this.soundSprites[spriteName]) {
      try {
        const sprite = this.soundSprites[spriteName];
        const src = this.audioCtx.createBufferSource();
        src.buffer = this.audioBuffer;
        const gain = this.audioCtx.createGain();
        gain.gain.value = 0.65;
        src.connect(gain);
        gain.connect(this.audioCtx.destination);
        src.start(0, sprite.start, sprite.duration);
        return;
      } catch (e) {}
    }

    this.playSynthSound(spriteName);
  }

  playSynthSound(type) {
    if (!this.audioCtx) return;
    const t = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    if (type === 'step' || type === 'click') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(540, t);
      osc.frequency.exponentialRampToValueAtTime(820, t + 0.08);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
      osc.start(t);
      osc.stop(t + 0.08);
    } else if (type === 'car_stop') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(420, t);
      osc.frequency.exponentialRampToValueAtTime(160, t + 0.35);
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.35);
    } else if (type === 'stopped_car_horn') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, t);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
      osc.start(t);
      osc.stop(t + 0.25);
    } else if (type === 'crash') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(30, t + 0.4);
      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.45);
      osc.start(t);
      osc.stop(t + 0.45);
    } else if (type === 'win') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, t);
      osc.frequency.exponentialRampToValueAtTime(1174.66, t + 0.35);
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
      osc.start(t);
      osc.stop(t + 0.4);
    }
  }

  generateLanes() {
    this.lanes = [];
    this.vehicles = [];

    const isMobile = this.width <= 550;
    if (isMobile) {
      this.laneHeight = Math.max(80, Math.min(94, (this.height - 120) / 5.8));
    } else {
      this.laneHeight = Math.max(68, Math.min(84, (this.height - 110) / 6.5));
    }
    this.scale = this.width / 1080;

    // Lane 0: Starting Top Sidewalk Safe Zone (Cobblestone pavement with trees)
    const sidewalkY = isMobile ? 62 : 68;
    this.lanes.push({
      index: 0,
      y: sidewalkY,
      multiplier: 1.0,
      isRoad: false
    });

    // Multipliers calibrated to user specifications:
    // EASY: starts from 1.15 (6.90, 7.86, 8.82, 9.84, 10.98... with bet 6.00)
    // MEDIUM: starts from 1.30 (7.80, 9.12, 10.68, 12.60, 14.88... with bet 6.00)
    // HARD: starts from 1.45 (8.70, 10.68, 13.20, 16.50, 20.88... with bet 6.00)
    const initialSteps = {
      EASY: [1.15, 1.31, 1.47, 1.64, 1.83, 2.05, 2.30, 2.59, 2.94, 3.36, 3.86],
      MEDIUM: [1.30, 1.52, 1.78, 2.10, 2.48, 2.95, 3.52, 4.22, 5.10, 6.20, 7.60],
      HARD: [1.45, 1.78, 2.20, 2.75, 3.48, 4.45, 5.75, 7.45, 9.75, 12.80, 16.90]
    };

    const baseList = initialSteps[this.riskLevel] || initialSteps.EASY;
    let lastMult = 1.0;

    const roadStartY = isMobile ? 110 : 120;

    for (let i = 1; i <= this.totalLanes; i++) {
      let laneMult;
      if (i - 1 < baseList.length) {
        laneMult = baseList[i - 1];
        lastMult = laneMult;
      } else {
        const factor = this.riskLevel === 'EASY' ? 1.12 : (this.riskLevel === 'MEDIUM' ? 1.20 : 1.28);
        lastMult = parseFloat((lastMult * factor).toFixed(2));
        laneMult = lastMult;
      }

      // Alternating traffic direction (Left or Right)
      const direction = (i % 2 === 1) ? 1 : -1;
      const speed = (this.riskLevel === 'EASY' ? 1.5 : (this.riskLevel === 'MEDIUM' ? 2.2 : 3.2)) + (Math.random() * 0.4);
      const laneY = roadStartY + (i - 1) * this.laneHeight;

      const lane = {
        index: i,
        y: laneY,
        multiplier: laneMult,
        isRoad: true,
        direction: direction,
        speed: speed
      };
      this.lanes.push(lane);

      // Place vehicles with realistic alternating directions
      // Odd lanes (1, 3, 5...): move RIGHT (dir = 1), approaching from left
      // Even lanes (2, 4, 6...): move LEFT (dir = -1), approaching from right
      let vDir = (i % 2 === 1) ? 1 : -1;
      lane.direction = vDir;

      if (i === 1) {
        this.vehicles.push({
          laneIndex: 1,
          x: this.width * 0.16,
          width: 72,
          height: 48,
          speed: speed,
          direction: 1,
          type: 'vaz',
          isStopped: false,
          honked: false
        });
      } else if (i === 2) {
        this.vehicles.push({
          laneIndex: 2,
          x: this.width * 0.80,
          width: 70,
          height: 48,
          speed: speed,
          direction: -1,
          type: 'niva',
          isStopped: false,
          honked: false
        });
      } else if (i === 3) {
        this.vehicles.push({
          laneIndex: 3,
          x: this.width * 0.14,
          width: 86,
          height: 52,
          speed: speed * 0.85,
          direction: 1,
          type: 'zil',
          isStopped: false,
          honked: false
        });
      } else if (i === 4) {
        this.vehicles.push({
          laneIndex: 4,
          x: this.width * 0.82,
          width: 70,
          height: 48,
          speed: speed,
          direction: -1,
          type: 'vaz',
          isStopped: false,
          honked: false
        });
      } else if (i === 5) {
        this.vehicles.push({
          laneIndex: 5,
          x: this.width * 0.16,
          width: 82,
          height: 52,
          speed: speed,
          direction: 1,
          type: 'raf',
          isStopped: false,
          honked: false
        });
      } else {
        const carTypes = ['vaz', 'raf', 'niva'];
        const type = carTypes[i % carTypes.length];
        this.vehicles.push({
          laneIndex: i,
          x: (vDir === 1 ? -120 : this.width + 120),
          width: type === 'raf' ? 82 : 72,
          height: type === 'raf' ? 52 : 48,
          speed: speed,
          direction: vDir,
          type: type,
          isStopped: false,
          honked: false
        });
      }
    }

    // Chicken starts at top sidewalk (Lane 0)
    this.chicken.x = this.width * 0.5;
    this.chicken.y = sidewalkY;
  }

  setupEventListeners() {
    window.addEventListener('resize', () => this.resize());

    // Allow clicking any lane to JUMP AHEAD (as shown in the tutorial bubble!)
    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const worldClickY = clickY + this.cameraY;

      // Find which lane was clicked
      for (let i = 1; i < this.lanes.length; i++) {
        const lane = this.lanes[i];
        if (worldClickY >= lane.y && worldClickY < lane.y + this.laneHeight) {
          if (this.state === 'RUNNING' && i > this.currentLane) {
            this.jumpToLane(i);
          }
          break;
        }
      }
    });

    // Road scroll with mouse wheel in idle
    this.canvas.addEventListener('wheel', (e) => {
      if (this.state === 'IDLE' || this.state === 'CASHED_OUT') {
        this.cameraY += e.deltaY * 0.4;
        const maxScroll = Math.max(0, (this.totalLanes - 6) * this.laneHeight);
        this.cameraY = Math.max(0, Math.min(this.cameraY, maxScroll));
      }
    }, { passive: true });
  }

  resize() {
    this.width = this.canvas.width = this.canvas.parentElement.clientWidth;
    this.height = this.canvas.height = this.canvas.parentElement.clientHeight;

    const isMobile = this.width <= 550;
    if (isMobile) {
      this.laneHeight = Math.max(80, Math.min(94, (this.height - 120) / 5.8));
    } else {
      this.laneHeight = Math.max(68, Math.min(84, (this.height - 110) / 6.5));
    }
    this.scale = this.width / 1080;

    this.chicken.x = this.width * 0.5;
    if (this.state === 'IDLE') {
      this.chicken.y = isMobile ? 62 : 68;
    } else if (this.barrier.visible) {
      this.updateBarrierPosition(this.barrier.laneIndex);
    }
  }

  setRiskLevel(level) {
    if (this.state === 'RUNNING') return;
    this.riskLevel = level;
    if (level === 'HARD') {
      this.assets.bgRoad.src = 'img/highLevelBg.webp';
    } else if (level === 'MEDIUM') {
      this.assets.bgRoad.src = 'img/mediumLevelBg.webp';
    } else {
      this.assets.bgRoad.src = 'img/lowLevelBg.webp';
    }
    this.generateLanes();
    this.playAudioSprite('click');

    // Update traffic signal lamp UI
    document.querySelectorAll('.traffic-lamp').forEach(lamp => {
      lamp.classList.remove('active');
      if (lamp.dataset.risk === level) {
        lamp.classList.add('active');
      }
    });
  }

  setBetAmount(val) {
    if (this.state === 'RUNNING') return;
    const curBal = this.getBalance();
    const maxAllowed = curBal > 0 ? Math.max(1.0, curBal) : 1000.0;
    this.betAmount = Math.max(1.0, Math.min(parseFloat(val) || 1.0, maxAllowed));
    const display = document.getElementById('betAmountDisplay');
    const input = document.getElementById('betAmountInput');
    if (display) display.innerText = Math.round(this.betAmount);
    if (input) input.value = this.betAmount.toFixed(2);
  }

  toggleDisplayMode() {
    this.displayMode = (this.displayMode === 'CASH') ? 'MULTIPLIER' : 'CASH';
    this.playAudioSprite('click');
  }

  // Dynamically place barrier and flip orientation matching the incoming car's lane direction
  updateBarrierPosition(laneIndex) {
    const lane = this.lanes[laneIndex];
    if (!lane) return;

    const v = this.vehicles.find(veh => veh.laneIndex === laneIndex);
    const dir = v ? v.direction : (lane.direction || 1);

    this.barrier.laneIndex = laneIndex;
    this.barrier.direction = dir;

    // If dir === 1 (traffic approaches from left): barrier on left of chicken, facing left
    // If dir === -1 (traffic approaches from right): barrier on right of chicken, facing right
    if (dir === 1) {
      this.barrier.x = this.chicken.x - 46;
    } else {
      this.barrier.x = this.chicken.x + 4;
    }
    this.barrier.visible = true;
  }

  // 80/20 Dynamic Profit & RTP Algorithm
  shouldLaneCrash(nextLaneIndex) {
    const prevLane = this.lanes[this.currentLane] || { multiplier: 1.0 };
    const defaultFirstMult = (this.riskLevel === 'EASY') ? 1.15 : (this.riskLevel === 'MEDIUM' ? 1.30 : 1.45);
    const nextLane = this.lanes[nextLaneIndex] || { multiplier: defaultFirstMult };

    const multPrev = prevLane.multiplier || 1.0;
    const multNext = nextLane.multiplier || defaultFirstMult;

    // Base risk level calibration targeting 80/20 profit margin:
    // EASY: ~85% RTP, MEDIUM: ~80% RTP (80/20 standard baseline), HARD: ~76% RTP
    let baseRTP = (this.riskLevel === 'EASY') ? 0.85 : (this.riskLevel === 'MEDIUM' ? 0.80 : 0.76);

    // Dynamic session calibration:
    // If player has won more than target RTP, adjust margin up slightly.
    // If player is on a losing streak or below target, boost player survival odds.
    if (this.sessionStats.totalBet >= 18) {
      const currentRTP = this.sessionStats.totalWon / this.sessionStats.totalBet;
      if (currentRTP > baseRTP + 0.12) {
        baseRTP = Math.max(0.68, baseRTP - 0.06);
      } else if (currentRTP < baseRTP - 0.12) {
        baseRTP = Math.min(0.92, baseRTP + 0.06);
      }
    }

    // Step survival probability derived from fair odds and dynamic 80/20 retention:
    const stepRatio = multPrev / multNext;
    const marginRetention = 1.0 - ((1.0 - baseRTP) / 5.0);
    const pSafe = Math.min(0.95, Math.max(0.35, stepRatio * marginRetention));

    const roll = Math.random();
    return (roll > pSafe);
  }

  // ---------------- GAMEPLAY: STEPPING & ADVANCE ----------------
  startRound() {
    if (this.state === 'RUNNING') return;
    const curBal = this.getBalance();
    if (curBal < this.betAmount) {
      alert(`የማይበቃ ቀሪ ሂሳብ! ያለዎት ቀሪ ሂሳብ ${curBal.toFixed(2)} ETB ነው። እባክዎ ሂሳብ ይሙሉ ወይም የውርርድ መጠን ይቀንሱ።`);
      return;
    }

    // Deduct bet amount from unified balance
    this.modifyBalance(-this.betAmount, 'stake');
    this.balance = this.getBalance();
    this.sessionStats.totalBet += this.betAmount;
    this.sessionStats.rounds += 1;
    this.updateBalanceUI();

    this.state = 'RUNNING';
    this.currentLane = 0;
    this.targetLane = 1; // Prepare first step
    this.laneTransitionProgress = 1.0;
    this.currentMultiplier = 1.0;
    this.cameraY = 0;
    this.isCrashStep = false;
    this.chicken.isDead = false;
    this.chicken.feathers = [];
    this.chicken.winCoins = [];
    this.chicken.x = this.width * 0.44;
    this.chicken.y = 70 * this.scale;

    // Reset vehicles stop states & normal speeds
    for (const v of this.vehicles) {
      v.isStopped = false;
      v.honked = false;
      v.isCrashCar = false;
      v.stopDuration = 0;
      v.speed = (this.riskLevel === 'EASY' ? 1.5 : (this.riskLevel === 'MEDIUM' ? 2.2 : 3.2)) + (Math.random() * 0.4);
    }

    // Switch controller to Running View (Image 1)
    const idleView = document.getElementById('controllerIdleView');
    const runningView = document.getElementById('controllerRunningView');
    if (idleView) idleView.style.display = 'none';
    if (runningView) runningView.style.display = 'flex';

    // Step into Lane 1
    this.advanceLane();
  }

  advanceLane() {
    if (this.state !== 'RUNNING') return;
    if (this.laneTransitionProgress < 1.0) return; // Prevent double jumping while airborne

    // Move to next lane
    const nextLane = this.currentLane + 1;
    if (nextLane >= this.lanes.length) {
      this.cashOut();
      return;
    }

    this.targetLane = nextLane;
    this.laneTransitionProgress = 0;
    this.playAudioSprite('step');

    // Unpause any cars from previous lanes so they can drive away smoothly
    for (const v of this.vehicles) {
      if (v.laneIndex < this.targetLane && v.isStopped) {
        v.isStopped = false;
        v.honked = false;
        v.stopDuration = 0;
      }
    }

    // Evaluate 80/20 Dynamic Profit Model
    const willCrash = this.shouldLaneCrash(this.targetLane);

    if (willCrash) {
      // CRASH STEP: Speeding car rushes in to physically collide with the chicken!
      this.isCrashStep = true;
      this.barrier.visible = false; // No roadblock barrier!

      // Find or create car in target lane
      let crashCar = this.vehicles.find(v => v.laneIndex === this.targetLane);
      if (!crashCar) {
        const dir = (this.targetLane % 2 === 1) ? 1 : -1;
        crashCar = {
          laneIndex: this.targetLane,
          x: dir === 1 ? -120 : this.width + 120,
          width: 72,
          height: 48,
          speed: 10.5,
          direction: dir,
          type: 'vaz',
          isStopped: false,
          honked: false
        };
        this.vehicles.push(crashCar);
      }

      crashCar.isCrashCar = true;
      crashCar.isStopped = false;
      crashCar.honked = false;
      crashCar.speed = 10.5; // High-speed rush

      // Position car ~160px from chicken so it strikes right as chicken lands
      if (crashCar.direction === 1) {
        crashCar.x = this.chicken.x - 160 - crashCar.width;
      } else {
        crashCar.x = this.chicken.x + 160;
      }

      // Fast approaching car sound
      this.playAudioSprite('carMove3');
      setTimeout(() => this.playAudioSprite('stopped_car_horn'), 120);

    } else {
      // SAFE STEP: Barrier is placed, oncoming car stops safely
      this.isCrashStep = false;
      this.updateBarrierPosition(this.targetLane);

      // When chicken finishes hop, update current lane & multipliers
      setTimeout(() => {
        if (this.state === 'RUNNING') {
          this.currentLane = this.targetLane;
          this.currentMultiplier = this.lanes[this.currentLane].multiplier;
          this.updateCashoutUI();
        }
      }, 300);
    }
  }

  jumpToLane(laneIndex) {
    if (this.state !== 'RUNNING') return;
    if (this.laneTransitionProgress < 1.0) return;

    this.targetLane = laneIndex;
    this.laneTransitionProgress = 0;
    this.playAudioSprite('step');

    for (const v of this.vehicles) {
      if (v.laneIndex < this.targetLane && v.isStopped) {
        v.isStopped = false;
        v.honked = false;
        v.stopDuration = 0;
      }
    }

    const willCrash = this.shouldLaneCrash(this.targetLane);

    if (willCrash) {
      this.isCrashStep = true;
      this.barrier.visible = false;

      let crashCar = this.vehicles.find(v => v.laneIndex === this.targetLane);
      if (!crashCar) {
        const dir = (this.targetLane % 2 === 1) ? 1 : -1;
        crashCar = {
          laneIndex: this.targetLane,
          x: dir === 1 ? -120 : this.width + 120,
          width: 72,
          height: 48,
          speed: 11.0,
          direction: dir,
          type: 'vaz',
          isStopped: false,
          honked: false
        };
        this.vehicles.push(crashCar);
      }

      crashCar.isCrashCar = true;
      crashCar.isStopped = false;
      crashCar.honked = false;
      crashCar.speed = 11.0;

      if (crashCar.direction === 1) {
        crashCar.x = this.chicken.x - 170 - crashCar.width;
      } else {
        crashCar.x = this.chicken.x + 170;
      }

      this.playAudioSprite('carMove3');
      setTimeout(() => this.playAudioSprite('stopped_car_horn'), 100);
    } else {
      this.isCrashStep = false;
      this.updateBarrierPosition(this.targetLane);

      setTimeout(() => {
        if (this.state === 'RUNNING') {
          this.currentLane = this.targetLane;
          this.currentMultiplier = this.lanes[this.currentLane].multiplier;
          this.updateCashoutUI();
        }
      }, 300);
    }
  }

  triggerCrash(impactCar = null) {
    if (this.state !== 'RUNNING') return;

    this.state = 'CRASHED';
    this.chicken.isDead = true;
    this.screenShake = 22; // High-impact screen shake
    this.barrier.visible = false;
    this.playAudioSprite('crash');

    // Create explosion feathers bursting outward in car's collision direction
    const impactLaneY = this.lanes[this.targetLane] ? this.lanes[this.targetLane].y + 20 : (70 * this.scale);
    const carDir = impactCar ? impactCar.direction : 1;

    for (let i = 0; i < 36; i++) {
      this.chicken.feathers.push({
        x: this.chicken.x + (Math.random() - 0.5) * 16,
        y: impactLaneY + (Math.random() - 0.5) * 16,
        vx: (carDir * 6) + (Math.random() - 0.5) * 12,
        vy: -Math.random() * 12 - 3,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.35,
        scale: 0.5 + Math.random() * 0.7,
        alpha: 1.0
      });
    }

    // Update buttons
    const goBtn = document.getElementById('btnActionGo');
    if (goBtn) {
      goBtn.classList.add('disabled');
      goBtn.innerHTML = `<span>CRASH</span>`;
    }

    this.addHistoryRecord(this.currentMultiplier, false);

    // Reset to IDLE after 3.2s
    setTimeout(() => {
      this.state = 'IDLE';
      this.targetLane = 0;
      this.currentLane = 0;
      this.cameraY = 0;
      this.chicken.isDead = false;
      this.chicken.y = 70 * this.scale;
      this.barrier.visible = false;
      this.isCrashStep = false;

      // Restore controller to IDLE view
      const idleView = document.getElementById('controllerIdleView');
      const runningView = document.getElementById('controllerRunningView');
      if (idleView) idleView.style.display = 'flex';
      if (runningView) runningView.style.display = 'none';

      if (goBtn) {
        goBtn.classList.remove('disabled');
        goBtn.innerHTML = '<span>GO!</span>';
      }

      // Resume all vehicles & restore normal speeds
      for (const v of this.vehicles) {
        v.isStopped = false;
        v.honked = false;
        v.isCrashCar = false;
        v.stopDuration = 0;
        v.speed = (this.riskLevel === 'EASY' ? 1.5 : (this.riskLevel === 'MEDIUM' ? 2.2 : 3.2)) + (Math.random() * 0.4);
      }
    }, 3200);
  }

  cashOut() {
    if (this.state !== 'RUNNING') return;

    this.state = 'CASHED_OUT';
    this.barrier.visible = false;
    this.isCrashStep = false;
    const winAmount = parseFloat((this.betAmount * this.currentMultiplier).toFixed(2));
    this.sessionStats.totalWon += winAmount;
    
    // Credit winnings to unified balance
    this.modifyBalance(winAmount, 'win');
    this.balance = this.getBalance();
    this.updateBalanceUI();
    this.playAudioSprite('win');

    // Spawn win coins shower
    const targetLaneY = this.lanes[this.currentLane] ? this.lanes[this.currentLane].y + 20 : 120;
    for (let i = 0; i < 28; i++) {
      this.chicken.winCoins.push({
        x: this.chicken.x + (Math.random() - 0.5) * 40,
        y: targetLaneY,
        vx: (Math.random() - 0.5) * 8,
        vy: -Math.random() * 9 - 4,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: 0.16,
        alpha: 1.0
      });
    }

    this.addHistoryRecord(this.currentMultiplier, true, winAmount);

    // Update collect button to show WIN
    const collectBtn = document.getElementById('btnActionCollect');
    if (collectBtn) {
      collectBtn.innerHTML = `<span class="collect-title">WON!</span><span class="collect-amount">+${winAmount.toFixed(2)} ETB</span>`;
    }

    setTimeout(() => {
      this.state = 'IDLE';
      this.targetLane = 0;
      this.currentLane = 0;
      this.cameraY = 0;
      this.chicken.y = 70 * this.scale;

      const idleView = document.getElementById('controllerIdleView');
      const runningView = document.getElementById('controllerRunningView');
      if (idleView) idleView.style.display = 'flex';
      if (runningView) runningView.style.display = 'none';

      for (const v of this.vehicles) {
        v.isStopped = false;
        v.honked = false;
      }
    }, 2400);
  }

  updateCashoutUI() {
    const liveCollect = document.getElementById('liveCollectVal');
    if (liveCollect) {
      const val = (this.betAmount * this.currentMultiplier).toFixed(2);
      liveCollect.innerText = `${val} ETB`;
    }
  }

  updateBalanceUI() {
    this.balance = this.getBalance();
    const w = this.getWallet();
    const mode = w && typeof w.getMode === 'function' ? w.getMode() : 'real';
    const tag = mode === 'demo' ? 'DEMO ETB' : 'ETB';
    const formatted = (Math.round(this.balance * 100) / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    const text = `${formatted} ${tag}`;
    const userBalanceText = document.getElementById('userBalanceText');
    if (userBalanceText) userBalanceText.innerText = text;
    const balEl = document.getElementById('hudUserBalance');
    if (balEl && !userBalanceText) balEl.innerText = text;
    const mobileBalEl = document.getElementById('mobileHudBalance');
    if (mobileBalEl) mobileBalEl.innerText = text;
  }

  addHistoryRecord(multiplier, won, winAmount = 0) {
    const tbody = document.getElementById('livePlayersTableBody');
    if (!tbody) return;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${Math.floor(10 + Math.random() * 89)}***${Math.floor(10 + Math.random() * 89)}</td>
      <td>${this.betAmount.toFixed(1)}</td>
      <td style="color: ${won ? '#00e676' : '#cbd5e1'}; font-weight: 700;">${won ? winAmount.toFixed(2) : '0.00'}</td>
      <td>${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
    `;
    tbody.prepend(tr);
    if (tbody.children.length > 25) {
      tbody.removeChild(tbody.lastChild);
    }
  }

  // ---------------- 60 FPS Render & Animation Loop ----------------
  loop(time) {
    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    this.update(dt);
    this.draw();

    requestAnimationFrame(this.loop);
  }

  update(dt) {
    this.chicken.animTime += dt;

    // Screen shake decay
    if (this.screenShake > 0) {
      this.screenShake -= dt * 35;
      if (this.screenShake < 0) this.screenShake = 0;
    }

    // Chicken blinking timer (blinks every ~3.2s)
    this.chicken.blinkTimer += dt;
    if (this.chicken.blinkTimer > 3.2) {
      this.chicken.isBlinking = true;
      if (this.chicken.blinkTimer > 3.38) {
        this.chicken.isBlinking = false;
        this.chicken.blinkTimer = 0;
      }
    }

    // Animate vehicles with BARRIER & PHYSICAL COLLISION DETECTION
    for (const v of this.vehicles) {
      // 1. Direct Physical Collision Detection with chicken (Only for speeding crash car!)
      if (v.isCrashCar && this.state === 'RUNNING') {
        const carLeft = v.x;
        const carRight = v.x + v.width;
        const chickenLeft = this.chicken.x - 16;
        const chickenRight = this.chicken.x + 16;

        const isColliding = (v.direction === 1 && carRight >= chickenLeft)
                         || (v.direction === -1 && carLeft <= chickenRight);

        if (isColliding) {
          v.isCrashCar = false; // Collision event fired!
          this.triggerCrash(v);
        }
      }

      // 2. Roadblock Barrier Detection (safe cars stop before barrier)
      let shouldStop = false;

      if (!v.isCrashCar && this.barrier.visible && v.laneIndex === this.barrier.laneIndex && this.state === 'RUNNING') {
        const barrierX = this.barrier.x;
        const bW = 42;

        if (v.direction === 1) {
          // Traffic moving right towards barrier on left of chicken
          const carFront = v.x + v.width;
          const barrierFront = barrierX;
          const dist = barrierFront - carFront;
          if (dist >= -15 && dist <= 55) {
            shouldStop = true;
          }
        } else if (v.direction === -1) {
          // Traffic moving left towards barrier on right of chicken
          const carFront = v.x;
          const barrierFront = barrierX + bW;
          const dist = carFront - barrierFront;
          if (dist >= -15 && dist <= 55) {
            shouldStop = true;
          }
        }
      }

      if (shouldStop) {
        if (!v.isStopped) {
          v.isStopped = true;
          this.playAudioSprite('car_stop');
        }
        // Soft horn after waiting
        if (!v.honked) {
          v.stopDuration = (v.stopDuration || 0) + dt;
          if (v.stopDuration > 1.0) {
            this.playAudioSprite('stopped_car_horn');
            v.honked = true;
          }
        }
      } else {
        if (v.isStopped && (!this.barrier.visible || v.laneIndex !== this.barrier.laneIndex)) {
          v.isStopped = false;
          v.honked = false;
          v.stopDuration = 0;
        }

        if (!v.isStopped) {
          v.x += v.speed * v.direction * 60 * dt;
          if (v.direction === 1 && v.x > this.width + 120) {
            v.x = -v.width - 60;
          } else if (v.direction === -1 && v.x < -v.width - 120) {
            v.x = this.width + 60;
          }
        }
      }
    }

    // Chicken Lane Crossing Progress
    if (this.laneTransitionProgress < 1.0) {
      this.laneTransitionProgress += dt * 3.4;
      if (this.laneTransitionProgress >= 1.0) {
        this.laneTransitionProgress = 1.0;
        this.currentLane = this.targetLane;
      }
    }

    // Camera follow chicken smoothly downward
    if (this.state === 'RUNNING') {
      const currentLaneY = this.lanes[this.currentLane] ? this.lanes[this.currentLane].y : 70 * this.scale;
      const targetLaneY = this.lanes[this.targetLane] ? this.lanes[this.targetLane].y : 70 * this.scale;
      const chickenWorldY = currentLaneY + (targetLaneY - currentLaneY) * this.laneTransitionProgress;

      this.targetCameraY = Math.max(0, chickenWorldY - this.height * 0.42);
      this.cameraY += (this.targetCameraY - this.cameraY) * 0.12;
    }

    // Feathers particles
    for (let i = this.chicken.feathers.length - 1; i >= 0; i--) {
      const p = this.chicken.feathers[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.22;
      p.rot += p.rotSpeed;
      p.alpha -= dt * 1.1;
      if (p.alpha <= 0) {
        this.chicken.feathers.splice(i, 1);
      }
    }

    // Win coins particles
    for (let i = this.chicken.winCoins.length - 1; i >= 0; i--) {
      const c = this.chicken.winCoins[i];
      c.x += c.vx;
      c.y += c.vy;
      c.vy += 0.36;
      c.rot += c.rotSpeed;
      c.alpha -= dt * 0.9;
      if (c.alpha <= 0) {
        this.chicken.winCoins.splice(i, 1);
      }
    }
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    ctx.save();

    // Apply Screen Shake on Crash
    if (this.screenShake > 0) {
      const shakeX = (Math.random() - 0.5) * this.screenShake;
      const shakeY = (Math.random() - 0.5) * this.screenShake;
      ctx.translate(shakeX, shakeY);
    }

    // Scroll Viewport by camera
    ctx.translate(0, -this.cameraY);

    // 1. Draw Highway Road Background (lowLevelBg.webp - Official 1080x2087 texture)
    if (this.assets.bgRoad.complete && this.assets.bgRoad.naturalWidth > 0) {
      const bgW = this.width;
      const bgH = (bgW / this.assets.bgRoad.naturalWidth) * this.assets.bgRoad.naturalHeight;
      let drawY = 0;
      while (drawY < (this.totalLanes + 4) * this.laneHeight) {
        ctx.drawImage(this.assets.bgRoad, 0, drawY, bgW, bgH);
        drawY += bgH;
      }
    } else {
      ctx.fillStyle = '#1c1f26';
      ctx.fillRect(0, 0, this.width, (this.totalLanes + 4) * this.laneHeight);
    }

    // 2. Draw Multiplier Marks & Tire Tracks Across Each Lane
    for (let i = 1; i < this.lanes.length; i++) {
      const lane = this.lanes[i];
      const laneY = lane.y;

      // Is this lane already cleared by the chicken?
      const isCleared = (this.state === 'RUNNING' || this.state === 'CASHED_OUT') && (i <= this.currentLane);

      // Select Track image: Green track for cleared lanes (Image 1), Amber track for upcoming lanes
      const trackImg = isCleared && this.assets.tireTrackGreen.complete && this.assets.tireTrackGreen.naturalWidth > 0
        ? this.assets.tireTrackGreen
        : this.assets.tireTrack;

      if (trackImg && trackImg.complete && trackImg.naturalWidth > 0) {
        const trackW = 100;
        const trackH = 32;
        ctx.drawImage(trackImg, this.width / 2 - trackW / 2, laneY + (this.laneHeight - trackH) / 2, trackW, trackH);
      }

      // Display Value: Cash amount (Image 1, e.g. 6.36) or Multiplier (Image 2, e.g. 1.06x)
      let labelText = '';
      if (this.displayMode === 'CASH') {
        const cashVal = (this.betAmount * lane.multiplier).toFixed(2);
        labelText = cashVal;
      } else {
        labelText = lane.multiplier.toFixed(2) + 'x';
      }

      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = isCleared ? '#ffffff' : '#ffffff';
      ctx.font = '900 18px Ubuntu, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(labelText, this.width / 2, laneY + this.laneHeight * 0.62);
      ctx.restore();
    }

    // 3. Draw Neon Green Chevrons (>> on right side of lanes 2 & 3 from screenshots)
    const chevronLanes = [2, 3];
    for (const cl of chevronLanes) {
      if (this.lanes[cl]) {
        const cy = this.lanes[cl].y + this.laneHeight * 0.28;
        const cx = Math.min(this.width * 0.91, this.width - 24);
        ctx.save();
        ctx.strokeStyle = '#00e676';
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.shadowColor = '#00e676';
        ctx.shadowBlur = 8;
        for (let k = 0; k < 2; k++) {
          const yOff = k * 12;
          ctx.beginPath();
          ctx.moveTo(cx - 7, cy + yOff + 5);
          ctx.lineTo(cx, cy + yOff);
          ctx.lineTo(cx + 7, cy + yOff + 5);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // 3b. Draw Tutorial Tap Hand icon on lane 5 in IDLE state (Image 1)
    if (this.state === 'IDLE' && this.lanes[5]) {
      const l5 = this.lanes[5];
      const hx = this.width / 2 + 54;
      const hy = l5.y + this.laneHeight * 0.58 + Math.sin(this.chicken.animTime * 4.5) * 3;
      ctx.save();
      ctx.font = '22px sans-serif';
      ctx.fillText('👆', hx, hy);
      ctx.restore();
    }

    // 4. Draw Roadblock Barrier in front of oncoming car / lane (Image 2)
    if (this.barrier.visible && this.lanes[this.barrier.laneIndex]) {
      const bLane = this.lanes[this.barrier.laneIndex];
      const bx = this.barrier.x;
      const by = bLane.y + (this.laneHeight - 45) / 2;
      const bDir = this.barrier.direction || 1;
      const bW = 42;
      const bH = 46;

      ctx.save();
      ctx.translate(bx + bW / 2, by + bH / 2);

      // Flip orientation when traffic is moving left (bDir === -1)
      if (bDir === -1) {
        ctx.scale(-1, 1);
      }

      // Barrier ground shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(0, bH / 2 - 3, 22, 6, -0.2, 0, Math.PI * 2);
      ctx.fill();

      // Road Barrier sprite centered
      if (this.assets.roadBarrier.complete && this.assets.roadBarrier.naturalWidth > 0) {
        ctx.drawImage(this.assets.roadBarrier, -bW / 2, -bH / 2, bW, bH);
      }
      ctx.restore();
    }

    // 5. Draw Moving / Stopped 3D Vehicles (vaz, raf, niva, zil)
    for (const v of this.vehicles) {
      const lane = this.lanes[v.laneIndex];
      if (!lane) continue;
      const vy = lane.y + (this.laneHeight - v.height) / 2;
      this.draw3DVehicle(ctx, v.x, vy, v.width, v.height, v.type, v.direction, v.isStopped, v.isCrashCar);
    }

    // 6. Draw Animated 3D Chicken
    const currentLaneY = this.lanes[this.currentLane] ? this.lanes[this.currentLane].y : 70 * this.scale;
    const targetLaneY = this.lanes[this.targetLane] ? this.lanes[this.targetLane].y : 70 * this.scale;
    const smoothY = currentLaneY + (targetLaneY - currentLaneY) * this.laneTransitionProgress;

    if (!this.chicken.isDead) {
      this.drawAnimatedChicken(ctx, this.chicken.x, smoothY + this.laneHeight * 0.25);
    } else {
      // Draw Death Tombstone Sign
      this.drawDeathSite(ctx, this.chicken.x, smoothY + this.laneHeight * 0.25);
    }

    // 7. Draw Feathers Burst Particles
    for (const p of this.chicken.feathers) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (this.assets.feather.complete && this.assets.feather.naturalWidth > 0) {
        ctx.drawImage(this.assets.feather, -12 * p.scale, -10 * p.scale, 24 * p.scale, 20 * p.scale);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 8. Draw Win Gold Coins
    for (const c of this.chicken.winCoins) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, c.alpha);
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#b8860b';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  draw3DVehicle(ctx, x, y, width, height, type, dir, isStopped, isCrashCar = false) {
    ctx.save();
    ctx.translate(x + width / 2, y + height / 2);

    // Direction Flip (dir === 1: moving right, dir === -1: moving left)
    if (dir === -1) {
      ctx.scale(-1, 1);
    }

    // 1. Soft Asphalt Drop Shadow under vehicle
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.ellipse(0, height / 2 - 2, width / 2 + 5, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Headlight Beam Casting Forward onto Asphalt (High beams for crash car!)
    ctx.save();
    const beamLength = isStopped ? 45 : (isCrashCar ? 85 : 55);
    const beamGrad = ctx.createLinearGradient(width / 2, 0, width / 2 + beamLength, 0);
    beamGrad.addColorStop(0, isCrashCar ? 'rgba(255, 240, 160, 0.85)' : (isStopped ? 'rgba(255, 255, 200, 0.55)' : 'rgba(255, 255, 220, 0.38)'));
    beamGrad.addColorStop(1, 'rgba(255, 255, 220, 0.0)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(width / 2 - 4, -height / 3);
    ctx.lineTo(width / 2 + beamLength, -height / 1.6);
    ctx.lineTo(width / 2 + beamLength, height / 1.6);
    ctx.lineTo(width / 2 - 4, height / 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 3. Select Real 3D Car Image
    let carImg = this.assets.cars.vaz; // Default red car
    if (type === 'raf') carImg = this.assets.cars.raf; // Green van
    else if (type === 'niva') carImg = this.assets.cars.niva; // Blue car
    else if (type === 'zil') carImg = this.assets.cars.zil; // Truck

    if (carImg && carImg.complete && carImg.naturalWidth > 0) {
      ctx.drawImage(carImg, -width / 2, -height / 2, width, height);
    } else {
      ctx.fillStyle = (type === 'raf') ? '#10b981' : (type === 'niva' ? '#3b82f6' : '#ef4444');
      ctx.beginPath();
      ctx.roundRect(-width / 2, -height / 2, width, height, 6);
      ctx.fill();
    }

    ctx.restore();
  }

  drawAnimatedChicken(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);

    const isMoving = this.laneTransitionProgress < 1.0;
    const t = this.chicken.animTime;
    const p = this.laneTransitionProgress;

    // 1. Hop & Body Bob Dynamics
    let hopY = 0;
    let tilt = 0;
    let scaleX = 1.0;
    let scaleY = 1.0;

    if (isMoving) {
      // High parabolic leap arc
      hopY = -Math.sin(p * Math.PI) * 28;

      // Squash and stretch physics
      if (p < 0.18) {
        // Anticipation crouch / squash
        const factor = Math.sin((p / 0.18) * Math.PI);
        scaleY = 1.0 - 0.15 * factor;
        scaleX = 1.0 + 0.15 * factor;
      } else if (p < 0.82) {
        // Airborne stretch
        scaleY = 1.16;
        scaleX = 0.92;
        tilt = Math.sin(p * Math.PI) * 0.08;
      } else {
        // Landing impact squash
        const factor = Math.sin(((p - 0.82) / 0.18) * Math.PI);
        scaleY = 1.0 - 0.16 * factor;
        scaleX = 1.0 + 0.16 * factor;
      }
    } else {
      // Idle breathing bobbing & subtle sway
      hopY = Math.sin(t * 3.8) * 2.2;
      tilt = Math.sin(t * 1.8) * 0.03;
      scaleY = 1.0 + Math.sin(t * 3.8) * 0.035;
      scaleX = 1.0 - Math.sin(t * 3.8) * 0.035;
    }

    // 2. Realistic Ground Shadow on Asphalt (contracts & blurs when airborne)
    const shadowScale = isMoving ? Math.max(0.32, 1.0 - Math.abs(hopY) / 32) : (1.0 + Math.sin(t * 3.8) * 0.05);
    const shadowAlpha = isMoving ? Math.max(0.18, 0.55 - Math.abs(hopY) / 55) : 0.55;

    ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
    ctx.beginPath();
    ctx.ellipse(0, 32, 14 * shadowScale, 5 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(tilt);
    ctx.scale(scaleX, scaleY);

    // 3. Draw 3D Chicken Sprite
    const img = (this.assets.chicken3d.complete && this.assets.chicken3d.naturalWidth > 0)
      ? this.assets.chicken3d
      : this.assets.chickenFull;

    const renderW = 34;
    const renderH = 72;

    if (img && img.complete && img.naturalWidth > 0) {
      // Draw 3D chicken body
      ctx.drawImage(img, -renderW / 2, -renderH / 2 + hopY, renderW, renderH);

      // Blinking animation: draw eyelid over eyes smoothly
      if (this.chicken.isBlinking && !isMoving) {
        ctx.fillStyle = '#f8fafc';
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        // Left eyelid
        ctx.beginPath();
        ctx.arc(-renderW * 0.304, -renderH * 0.217 + hopY, 3.5, 0, Math.PI);
        ctx.fill();
        ctx.stroke();
        // Right eyelid
        ctx.beginPath();
        ctx.arc(renderW * 0.226, -renderH * 0.231 + hopY, 3.5, 0, Math.PI);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(0, hopY, 16, 22, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(0, -20 + hopY, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  drawDeathSite(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);

    const signImg = this.assets.deathSign;
    if (signImg && signImg.complete && signImg.naturalWidth > 0) {
      const sw = 42;
      const sh = 56;
      ctx.drawImage(signImg, -sw / 2, -sh + 10, sw, sh);
    } else {
      ctx.fillStyle = '#64748b';
      ctx.fillRect(-15, -30, 30, 35);
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('RIP', 0, -12);
    }

    ctx.restore();
  }
}

// Export for app controller
window.ChickenCrashGame = ChickenCrashGame;
