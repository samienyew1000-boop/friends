/**
 * Tower Dash / Tower Crash - HTML5 Canvas Physics Engine
 * Official Galaxsys High-Altitude Crane Building Experience
 */

class TowerCrashGame {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');

    // Dimensions
    this.width = 0;
    this.height = 0;
    this.dpr = window.devicePixelRatio || 1;

    // Game States: 'IDLE', 'PLAYING', 'DROPPING', 'BUSTED', 'CASHED_OUT'
    this.state = 'IDLE';
    this.riskLevel = 'EASY'; // 'EASY', 'MEDIUM', 'HARD'
    this.betAmount = 10.0;
    this.balance = this.getBalance();
    this.currentFloor = 0;
    this.currentMultiplier = 1.0;
    this.muted = false;

    // Multiplier Ladder (80/20 Calibrated Margin)
    this.multipliers = {
      EASY:   [1.15, 1.35, 1.62, 1.98, 2.45, 3.10, 4.00, 5.25, 7.00, 9.50, 13.5, 20.0, 30.0, 50.0, 100.0],
      MEDIUM: [1.25, 1.58, 2.05, 2.70, 3.65, 5.00, 7.10, 10.5, 16.0, 25.0, 40.0, 70.0, 120.0, 250.0, 500.0],
      HARD:   [1.45, 2.15, 3.25, 5.10, 8.20, 13.5, 23.0, 40.0, 75.0, 140.0, 280.0, 600.0, 1300.0, 3000.0, 8000.0]
    };

    // Camera & Viewport
    this.cameraY = 0;
    this.targetCameraY = 0;
    this.screenShake = 0;

    // Crane & Hook System
    this.crane = {
      x: 0,
      y: 90,
      angle: 0,
      swingSpeed: 2.2,
      swingRadius: 180,
      phase: 0
    };

    // Current Swung Block
    this.currentBlock = null;

    // Placed Tower Blocks Stack
    this.towerStack = [];

    // Particles & FX
    this.particles = [];
    this.smokeEffects = [];
    this.clouds = [];
    this.airplanes = [];
    this.satellites = [];
    this.stars = [];

    // Assets Container
    this.assets = {
      loaded: false,
      blocks: [],
      brokenBlocks: [],
      hook: new Image(),
      cable: new Image(),
      ground: new Image(),
      pedestal: new Image(),
      city: new Image(),
      cloud: new Image(),
      earth: new Image(),
      sputnik: new Image(),
      ufo: new Image(),
      star: new Image(),
      smokeFrames: []
    };

    // Audio Engine
    this.audioEngine = {
      ctx: null,
      bgMusic: null,
      sfx: {}
    };

    // Initialize
    this.initWalletSync();
    this.loadAssets();
    this.initAudio();
    this.initEnvironment();
    this.resize();

    window.addEventListener('resize', () => this.resize());

    // 60 FPS Render Loop
    this.lastTime = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ---------------- UNIFIED WALLET INTEGRATION ----------------
  getWallet() {
    return window.HabeshaWallet || window.FriendesWallet || null;
  }

  getBalance() {
    const w = this.getWallet();
    if (w && typeof w.get === 'function') {
      return w.get();
    }
    const stored = localStorage.getItem('habesha_balance');
    return stored !== null && !isNaN(parseFloat(stored)) ? parseFloat(stored) : 0.0;
  }

  modifyBalance(delta, method = 'stake') {
    const w = this.getWallet();
    if (w && typeof w.modify === 'function') {
      const res = w.modify(delta, 'Tower Dash', method);
      this.balance = res;
      return res;
    }
    const cur = this.getBalance();
    const next = Math.max(0, Math.round((cur + delta) * 100) / 100);
    localStorage.setItem('habesha_balance', next.toFixed(2));
    this.balance = next;
    window.dispatchEvent(new CustomEvent('habesha_balance_updated', { detail: { balance: next } }));
    return next;
  }

  initWalletSync() {
    const sync = () => {
      this.balance = this.getBalance();
      this.updateBalanceUI();
    };
    window.addEventListener('habesha_balance_updated', sync);
    window.addEventListener('storage', (e) => {
      if (e.key && e.key.includes('balance')) sync();
    });
    window.addEventListener('message', (e) => {
      if (e.data && (e.data.type === 'SYNC_BALANCE' || e.data.balance !== undefined)) sync();
    });
  }

  updateBalanceUI() {
    this.balance = this.getBalance();
    const w = this.getWallet();
    const mode = (w && typeof w.getMode === 'function') ? w.getMode() : 'real';
    const formatted = Number(this.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const text = `${formatted} ${mode === 'demo' ? 'DEMO ETB' : 'ETB'}`;
    const el = document.getElementById('userBalanceText');
    if (el) el.innerText = text;
  }

  // ---------------- ASSET LOADING ----------------
  loadAssets() {
    // 1. Crane & Hooks
    this.assets.hook.src = '02_Crane_and_Hooks/kran2.png';
    this.assets.cable.src = '02_Crane_and_Hooks/line_2.png';

    // 2. Scenery & Backgrounds
    this.assets.ground.src = '04_Scenery_and_Backgrounds/Ground_and_Pedestal/first_floor_08_1.png';
    this.assets.pedestal.src = '04_Scenery_and_Backgrounds/Ground_and_Pedestal/first_floor_11_1.png';
    this.assets.city.src = '04_Scenery_and_Backgrounds/City_Backdrops/city_2_1.png';
    this.assets.cloud.src = '04_Scenery_and_Backgrounds/Sky_and_Clouds/cloud1.png';
    this.assets.earth.src = '04_Scenery_and_Backgrounds/Creatures_and_Space/earth_1_1.png';
    this.assets.sputnik.src = '04_Scenery_and_Backgrounds/Creatures_and_Space/sputnik1.png';
    this.assets.ufo.src = '04_Scenery_and_Backgrounds/Creatures_and_Space/ufo.png';
    this.assets.star.src = '04_Scenery_and_Backgrounds/Sky_and_Clouds/star.png';

    // 3. 12 Floor Building Blocks & Broken Variants
    const blockFolders = [
      { folder: 'Block_04_LogCabin', base: 'components_block4_1.png', broken: 'components_block4_broken.png', w: 197, h: 190 },
      { folder: 'Block_10_Container', base: 'components_block10_1.png', broken: 'components_block10_broken.png', w: 292, h: 196 },
      { folder: 'Block_01_Temple', base: 'components_block1_1.png', broken: 'components_block1_broken.png', w: 195, h: 168 },
      { folder: 'Block_02_TownHouse', base: 'components_block2_1.png', broken: 'components_block2_broken.png', w: 194, h: 164 },
      { folder: 'Block_03_YellowHouse', base: 'components_block3_1.png', broken: 'components_block3_broken.png', w: 194, h: 158 },
      { folder: 'Block_05_Shop', base: 'components_block5_1.png', broken: 'components_block5_broken.png', w: 196, h: 160 },
      { folder: 'Block_06_Skyscraper', base: 'components_block6_1.png', broken: 'components_block6_broken.png', w: 256, h: 196 },
      { folder: 'Block_07_Lab', base: 'components_block7_1.png', broken: 'components_block7_broken.png', w: 230, h: 199 },
      { folder: 'Block_08_NeonApartment', base: 'components_block8_1.png', broken: 'components_block8_broken.png', w: 206, h: 199 },
      { folder: 'Block_09_Penthouse', base: 'components_block9_1.png', broken: 'components_block9_broken.png', w: 286, h: 208 },
      { folder: 'Block_11_AntennaTower', base: 'components_block11_1.png', broken: 'components_block11_broken.png', w: 214, h: 194 },
      { folder: 'Block_12_Observatory', base: 'components_block12_1.png', broken: 'components_block11_broken.png', w: 244, h: 194 }
    ];

    blockFolders.forEach((b, i) => {
      const img = new Image();
      img.src = `01_Blocks/${b.folder}/${b.base}`;
      const brokenImg = new Image();
      brokenImg.src = `01_Blocks/${b.folder}/${b.broken}`;
      this.assets.blocks.push({ img, w: b.w, h: b.h, index: i });
      this.assets.brokenBlocks.push({ img: brokenImg, w: b.w, h: b.h });
    });

    // 4. Smoke Landing FX (10 Frames)
    for (let f = 0; f < 10; f++) {
      const sImg = new Image();
      sImg.src = `03_Smoke_and_Effects/Drop_FX_Smoke/drop_fx_smoke_fx_4_0000${f}.png`;
      this.assets.smokeFrames.push(sImg);
    }
  }

  // ---------------- AUDIO SYSTEM ----------------
  initAudio() {
    try {
      this.audioEngine.bgMusic = new Audio('05_Audio/Music_Layers/musicMainLayer1.42fa4555.mp3');
      this.audioEngine.bgMusic.loop = true;
      this.audioEngine.bgMusic.volume = 0.25;

      const unlock = () => {
        if (!this.muted && this.audioEngine.bgMusic && this.audioEngine.bgMusic.paused) {
          this.audioEngine.bgMusic.play().catch(() => {});
        }
      };
      window.addEventListener('click', unlock, { once: true });
      window.addEventListener('touchstart', unlock, { once: true });
    } catch (e) {
      console.warn('Audio initialization notice:', e);
    }
  }

  playSFX(filename, volume = 0.6) {
    if (this.muted) return;
    try {
      const a = new Audio(`05_Audio/${filename}`);
      a.volume = volume;
      a.play().catch(() => {});
    } catch (e) {}
  }

  // ---------------- ENVIRONMENT & PARALLAX BACKGROUNDS ----------------
  initEnvironment() {
    // Floating clouds
    this.clouds = [];
    for (let i = 0; i < 16; i++) {
      this.clouds.push({
        x: Math.random() * 1200,
        y: 400 + Math.random() * 1400,
        speed: 0.15 + Math.random() * 0.35,
        scale: 0.7 + Math.random() * 0.8,
        alpha: 0.4 + Math.random() * 0.5
      });
    }

    // High space stars
    this.stars = [];
    for (let i = 0; i < 80; i++) {
      this.stars.push({
        x: Math.random() * 1000,
        y: 2200 + Math.random() * 2000,
        size: 1 + Math.random() * 2.5,
        blink: Math.random() * Math.PI * 2
      });
    }
  }

  resize() {
    const parent = this.canvas.parentElement;
    this.width = parent.clientWidth;
    this.height = parent.clientHeight;
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
    this.ctx.scale(this.dpr, this.dpr);

    this.crane.swingRadius = Math.min(this.width * 0.38, 170);

    // Initialize pedestal position if stack is empty
    if (this.towerStack.length === 0) {
      this.resetStack();
    }
  }

  resetStack() {
    this.towerStack = [];
    const pedestalW = 260;
    const pedestalH = 80;
    const groundY = this.height - 180;

    // Foundation stone base
    this.pedestal = {
      x: (this.width - pedestalW) / 2,
      y: groundY,
      width: pedestalW,
      height: pedestalH
    };

    this.cameraY = 0;
    this.targetCameraY = 0;
  }

  // ---------------- GAMEPLAY LOGIC ----------------
  startRound() {
    if (this.state === 'PLAYING' || this.state === 'DROPPING') return;

    if (this.balance < this.betAmount) {
      alert('የሂሳብ መጠንዎ በቂ አይደለም (Insufficient balance). እባክዎ ሂሳብዎን ይሙሉ ወይም Demo ይጠቀሙ።');
      return;
    }

    // Deduct stake from unified wallet
    this.modifyBalance(-this.betAmount, 'stake');
    this.updateBalanceUI();

    this.state = 'PLAYING';
    this.currentFloor = 0;
    this.currentMultiplier = 1.0;
    this.resetStack();

    // Spawn first swinging floor block
    this.spawnNextSwingingBlock();
    this.playSFX('Voice_Lines/voiceCharacterLineWelcome1.efe0d3fb.mp3', 0.7);

    // Switch buttons UI
    this.updateControllerUI();
  }

  spawnNextSwingingBlock() {
    const nextFloorIndex = this.currentFloor;
    const blockDef = this.assets.blocks[nextFloorIndex % this.assets.blocks.length] || this.assets.blocks[0];

    const blockScale = 0.72;
    const w = blockDef.w * blockScale;
    const h = blockDef.h * blockScale;

    // Crane swing speed scales gently with floor height and risk
    const baseSpeed = this.riskLevel === 'EASY' ? 2.0 : (this.riskLevel === 'MEDIUM' ? 2.6 : 3.4);
    this.crane.swingSpeed = baseSpeed + Math.min(1.2, this.currentFloor * 0.08);

    this.currentBlock = {
      blockDef,
      width: w,
      height: h,
      x: this.width / 2,
      y: this.crane.y + 60,
      vy: 0,
      isDropping: false,
      isBroken: false,
      settled: false,
      wobble: 0
    };
  }

  dropBlock() {
    if (this.state !== 'PLAYING' || !this.currentBlock || this.currentBlock.isDropping) return;

    this.currentBlock.isDropping = true;
    this.currentBlock.vy = 280; // Initial drop velocity
    this.state = 'DROPPING';
    this.playSFX('Sound_Effects/blockLaunch.6462c307.mp3', 0.6);
  }

  handleBlockLanding() {
    const dropped = this.currentBlock;
    if (!dropped) return;

    // Target surface is either the top of the tower stack or the pedestal
    const targetSurface = this.towerStack.length > 0
      ? this.towerStack[this.towerStack.length - 1]
      : this.pedestal;

    const blockCenterX = dropped.x + dropped.width / 2;
    const targetCenterX = targetSurface.x + targetSurface.width / 2;
    const offset = blockCenterX - targetCenterX;
    const absOffset = Math.abs(offset);

    // Alignment Tolerance based on risk level
    const maxTolerance = (this.riskLevel === 'EASY' ? 52 : (this.riskLevel === 'MEDIUM' ? 42 : 34));

    if (absOffset <= maxTolerance) {
      // SUCCESSFUL LANDING!
      dropped.settled = true;
      dropped.isDropping = false;
      dropped.y = targetSurface.y - dropped.height + 6; // Snapped flush on top

      this.towerStack.push(dropped);
      this.currentFloor++;

      // Multiplier progress
      const multLadder = this.multipliers[this.riskLevel];
      const nextMult = multLadder[Math.min(this.currentFloor - 1, multLadder.length - 1)];
      this.currentMultiplier = nextMult;

      // Spawn Landing Smoke Effect
      this.spawnSmokeFX(blockCenterX, dropped.y + dropped.height);

      // Check for PERFECT alignment (< 9px)
      const isPerfect = absOffset <= 9;
      if (isPerfect) {
        dropped.x = targetCenterX - dropped.width / 2; // Perfect snap
        this.triggerFloatingAlert('✨ PERFECT! ✨', 'perfect');
        this.playSFX('Sound_Effects/stingerWin.ade2cbb4.mp3', 0.7);
        this.spawnGoldCoins(blockCenterX, dropped.y + dropped.height / 2, 22);
      } else {
        this.playSFX(`Sound_Effects/blockHit${Math.floor(1 + Math.random() * 4)}.f6bd5be7.mp3`, 0.65);
      }

      // Smooth camera pan up as tower grows taller
      const targetScreenY = this.height * 0.55;
      this.targetCameraY = Math.max(0, (this.pedestal.y - dropped.y) - (this.height - targetScreenY - 100));

      // Update UI HUD
      this.updateHUD();
      this.updateControllerUI();

      // Spawn next floor block after gentle delay
      setTimeout(() => {
        if (this.state === 'DROPPING') {
          this.state = 'PLAYING';
          this.spawnNextSwingingBlock();
        }
      }, 350);

    } else {
      // MISS / CATASTROPHIC COLLAPSE!
      this.handleTowerCollapse(dropped, offset);
    }
  }

  handleTowerCollapse(dropped, offset) {
    this.state = 'BUSTED';
    dropped.isBroken = true;
    dropped.isDropping = false;
    this.screenShake = 18;

    this.playSFX('Sound_Effects/blockDestroy.039d3984.mp3', 0.85);
    this.playSFX('Sound_Effects/stingerFail.665a3036.mp3', 0.75);
    this.playSFX(`Voice_Lines/voiceCharacterLineFail${Math.floor(1 + Math.random() * 3)}.a684649f.mp3`, 0.7);

    this.triggerFloatingAlert('💥 TOWER COLLAPSED!', 'bust');

    // Add tumbling physics to broken block
    dropped.tumbleVx = offset > 0 ? 5.5 : -5.5;
    dropped.tumbleVy = -4.0;
    dropped.tumbleRot = 0;
    dropped.tumbleRotSpeed = offset > 0 ? 0.08 : -0.08;

    this.addHistoryRecord(this.currentMultiplier, false, 0);

    // Reset back to IDLE after dramatic failure sequence
    setTimeout(() => {
      this.state = 'IDLE';
      this.currentBlock = null;
      this.currentFloor = 0;
      this.currentMultiplier = 1.0;
      this.resetStack();
      this.updateHUD();
      this.updateControllerUI();
    }, 2800);
  }

  cashOut() {
    if (this.state !== 'PLAYING' && this.state !== 'DROPPING') return;
    if (this.currentFloor === 0) return;

    this.state = 'CASHED_OUT';
    const winAmount = parseFloat((this.betAmount * this.currentMultiplier).toFixed(2));

    // Credit winnings to unified wallet
    this.modifyBalance(winAmount, 'win');
    this.updateBalanceUI();

    this.playSFX('Sound_Effects/stingerCashoutWinLabel.d7b1c9f0.mp3', 0.85);
    this.playSFX(`Voice_Lines/voiceCharacterLineWin${Math.floor(1 + Math.random() * 3)}.903dbe2e.mp3`, 0.8);

    this.triggerFloatingAlert(`🏆 WON +${winAmount.toFixed(2)} ETB!`, 'cashout');
    this.spawnGoldCoins(this.width / 2, this.height * 0.45, 35);
    this.addHistoryRecord(this.currentMultiplier, true, winAmount);

    // Reset to IDLE after celebration
    setTimeout(() => {
      this.state = 'IDLE';
      this.currentBlock = null;
      this.currentFloor = 0;
      this.currentMultiplier = 1.0;
      this.resetStack();
      this.updateHUD();
      this.updateControllerUI();
    }, 2800);
  }

  spawnSmokeFX(x, y) {
    this.smokeEffects.push({
      x,
      y,
      frame: 0,
      totalFrames: 10,
      animSpeed: 0.55
    });
  }

  spawnGoldCoins(x, y, count = 20) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 40,
        y: y + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 9,
        vy: -Math.random() * 10 - 4,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: 0.15,
        alpha: 1.0,
        type: 'coin'
      });
    }
  }

  triggerFloatingAlert(text, type = 'perfect') {
    const alertEl = document.getElementById('gameFloatingAlert');
    if (!alertEl) return;
    alertEl.innerHTML = `<div class="alert-badge ${type}">${text}</div>`;
    alertEl.classList.add('show');
    setTimeout(() => {
      alertEl.classList.remove('show');
    }, 1800);
  }

  updateHUD() {
    const floorEl = document.getElementById('hudFloorCount');
    if (floorEl) floorEl.innerText = `Floor ${this.currentFloor}`;

    const multEl = document.getElementById('hudMultiplierVal');
    if (multEl) {
      multEl.innerText = `${this.currentMultiplier.toFixed(2)}x`;
      multEl.parentElement.classList.add('bump');
      setTimeout(() => multEl.parentElement.classList.remove('bump'), 250);
    }
  }

  updateControllerUI() {
    const idleView = document.getElementById('controllerIdleView');
    const runningView = document.getElementById('controllerRunningView');
    const mainActionBtn = document.getElementById('btnActionMain');
    const liveWinVal = document.getElementById('liveCollectAmount');

    if (this.state === 'IDLE') {
      if (idleView) idleView.style.display = 'flex';
      if (runningView) runningView.style.display = 'none';
      if (mainActionBtn) {
        mainActionBtn.classList.remove('drop-state');
        mainActionBtn.innerHTML = `<span>BUILD</span>`;
      }
    } else {
      if (idleView) idleView.style.display = 'none';
      if (runningView) runningView.style.display = 'flex';
      if (mainActionBtn) {
        mainActionBtn.classList.add('drop-state');
        mainActionBtn.innerHTML = `<span>DROP ⬇</span>`;
      }
      if (liveWinVal) {
        const win = (this.betAmount * this.currentMultiplier).toFixed(2);
        liveWinVal.innerText = `${win} ETB`;
      }
    }
  }

  addHistoryRecord(multiplier, won, winAmount = 0) {
    const tbody = document.getElementById('livePlayersTableBody');
    if (!tbody) return;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${Math.floor(10 + Math.random() * 89)}***${Math.floor(10 + Math.random() * 89)}</td>
      <td>${this.betAmount.toFixed(1)} ETB</td>
      <td class="${won ? 'win' : ''}">${won ? winAmount.toFixed(2) + ' ETB' : '-'}</td>
      <td>${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
    `;
    tbody.prepend(tr);
    if (tbody.children.length > 20) {
      tbody.removeChild(tbody.lastChild);
    }
  }

  // ---------------- 60 FPS ANIMATION LOOP ----------------
  loop(time) {
    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    this.update(dt);
    this.draw();

    requestAnimationFrame(this.loop);
  }

  update(dt) {
    // 1. Smooth Camera Interpolation
    this.cameraY += (this.targetCameraY - this.cameraY) * 0.08;

    // 2. Screen Shake Decay
    if (this.screenShake > 0) {
      this.screenShake -= dt * 30;
      if (this.screenShake < 0) this.screenShake = 0;
    }

    // 3. Crane Harmonic Pendulum Swing
    this.crane.phase += dt * this.crane.swingSpeed;
    this.crane.angle = Math.sin(this.crane.phase) * 0.28;
    this.crane.x = (this.width / 2) + Math.sin(this.crane.phase) * this.crane.swingRadius;

    // 4. Update Current Swung or Dropping Block
    if (this.currentBlock) {
      if (!this.currentBlock.isDropping && !this.currentBlock.settled) {
        // Suspended on hook
        this.currentBlock.x = this.crane.x - this.currentBlock.width / 2;
        this.currentBlock.y = this.crane.y + 60;
        this.currentBlock.wobble = this.crane.angle * 0.7;
      } else if (this.currentBlock.isDropping) {
        // Accelerating downward with gravity
        this.currentBlock.vy += 1250 * dt;
        this.currentBlock.y += this.currentBlock.vy * dt;

        // Collision Check with target surface
        const targetSurface = this.towerStack.length > 0
          ? this.towerStack[this.towerStack.length - 1]
          : this.pedestal;

        const targetY = targetSurface.y - this.currentBlock.height + 6;

        if (this.currentBlock.y >= targetY) {
          this.handleBlockLanding();
        }
      } else if (this.currentBlock.isBroken) {
        // Tumbling off screen on failure
        this.currentBlock.x += this.currentBlock.tumbleVx;
        this.currentBlock.tumbleVy += 980 * dt;
        this.currentBlock.y += this.currentBlock.tumbleVy * dt;
        this.currentBlock.tumbleRot += this.currentBlock.tumbleRotSpeed;
      }
    }

    // 5. Update Smoke FX
    for (let i = this.smokeEffects.length - 1; i >= 0; i--) {
      const s = this.smokeEffects[i];
      s.frame += s.animSpeed;
      if (s.frame >= s.totalFrames) {
        this.smokeEffects.splice(i, 1);
      }
    }

    // 6. Update Particles (Coins & Debris)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vy += 700 * dt;
      p.x += p.vx;
      p.y += p.vy * dt;
      p.rot += p.rotSpeed;
      p.alpha -= dt * 0.6;
      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // 7. Update Clouds
    for (const c of this.clouds) {
      c.x += c.speed;
      if (c.x > this.width + 150) c.x = -150;
    }
  }

  // ---------------- CANVAS RENDERING ----------------
  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    ctx.save();

    // Screen Shake Offset
    if (this.screenShake > 0) {
      const sx = (Math.random() - 0.5) * this.screenShake;
      const sy = (Math.random() - 0.5) * this.screenShake;
      ctx.translate(sx, sy);
    }

    // 1. Multi-Layer Altitude Background Sky
    this.drawSkyBackground(ctx);

    // 2. Parallax World Objects (Translate by Camera Y)
    ctx.save();
    ctx.translate(0, this.cameraY);

    // Scenery Background: City & Ground
    this.drawGroundAndCity(ctx);

    // High Atmosphere & Space Objects
    this.drawAltitudeObjects(ctx);

    // Tower Stack Blocks
    this.drawTowerStack(ctx);

    // Landing Smoke FX
    this.drawSmokeFX(ctx);

    // Broken Block if crashing
    if (this.currentBlock && this.currentBlock.isBroken) {
      this.drawBrokenBlock(ctx, this.currentBlock);
    }

    ctx.restore();

    // 3. Fixed Viewport Elements: Crane & Suspended Block
    this.drawCraneAndSuspendedBlock(ctx);

    // 4. Gold Coin Particles
    this.drawParticles(ctx);

    ctx.restore();
  }

  drawSkyBackground(ctx) {
    // Dynamic Sky Gradient transitioning from Warm City Dawn to Deep Space as tower climbs
    const altitude = Math.min(1.0, this.cameraY / 1800);

    const grad = ctx.createLinearGradient(0, 0, 0, this.height);
    if (altitude < 0.4) {
      // Dawn / City sky
      grad.addColorStop(0, '#1e293b');
      grad.addColorStop(0.5, '#0f172a');
      grad.addColorStop(1, '#1e1b4b');
    } else if (altitude < 0.8) {
      // Stratosphere
      grad.addColorStop(0, '#020617');
      grad.addColorStop(0.5, '#0f172a');
      grad.addColorStop(1, '#1e293b');
    } else {
      // Deep Outer Space
      grad.addColorStop(0, '#000000');
      grad.addColorStop(0.5, '#050510');
      grad.addColorStop(1, '#090d16');
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Draw Stars when camera climbs high
    if (altitude > 0.3) {
      const starAlpha = Math.min(1.0, (altitude - 0.3) / 0.5);
      ctx.fillStyle = `rgba(255, 255, 255, ${starAlpha})`;
      for (const s of this.stars) {
        ctx.beginPath();
        const adjustedY = (s.y - this.cameraY * 0.4) % this.height;
        ctx.arc(s.x, adjustedY, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawGroundAndCity(ctx) {
    const groundBaseY = this.pedestal.y;

    // City Skyline (Parallax factor 0.3)
    if (this.assets.city.complete && this.assets.city.naturalWidth > 0) {
      const cityW = this.width * 1.1;
      const cityH = (this.assets.city.naturalHeight / this.assets.city.naturalWidth) * cityW;
      const cityY = groundBaseY - cityH + 90;
      ctx.drawImage(this.assets.city, -20, cityY, cityW, cityH);
    }

    // Drifting Clouds
    if (this.assets.cloud.complete) {
      for (const c of this.clouds) {
        ctx.save();
        ctx.globalAlpha = c.alpha;
        ctx.drawImage(this.assets.cloud, c.x, groundBaseY - c.y, 113 * c.scale, 122 * c.scale);
        ctx.restore();
      }
    }

    // Ground Construction Yard
    if (this.assets.ground.complete && this.assets.ground.naturalWidth > 0) {
      const gW = this.width * 1.08;
      const gH = 140;
      ctx.drawImage(this.assets.ground, -10, groundBaseY + 30, gW, gH);
    } else {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, groundBaseY + 60, this.width, 200);
    }

    // Stone Pedestal Foundation
    if (this.assets.pedestal.complete && this.assets.pedestal.naturalWidth > 0) {
      ctx.drawImage(this.assets.pedestal, this.pedestal.x, this.pedestal.y, this.pedestal.width, this.pedestal.height);
    } else {
      ctx.fillStyle = '#475569';
      ctx.fillRect(this.pedestal.x, this.pedestal.y, this.pedestal.width, this.pedestal.height);
    }
  }

  drawAltitudeObjects(ctx) {
    const altitude = this.cameraY;

    // Orbiting Sputnik Satellite in high space
    if (altitude > 1200 && this.assets.sputnik.complete) {
      const sputnikX = (this.width * 0.75) + Math.sin(this.crane.phase * 0.5) * 40;
      const sputnikY = this.pedestal.y - 1900;
      ctx.drawImage(this.assets.sputnik, sputnikX, sputnikY, 90, 84);
    }

    // UFO hovering high
    if (altitude > 1600 && this.assets.ufo.complete) {
      const ufoX = (this.width * 0.25) + Math.cos(this.crane.phase * 0.6) * 50;
      const ufoY = this.pedestal.y - 2400;
      ctx.drawImage(this.assets.ufo, ufoX, ufoY, 110, 75);
    }
  }

  drawTowerStack(ctx) {
    for (let i = 0; i < this.towerStack.length; i++) {
      const b = this.towerStack[i];
      const img = b.blockDef.img;
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, b.x, b.y, b.width, b.height);
      } else {
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(b.x, b.y, b.width, b.height);
      }
    }
  }

  drawSmokeFX(ctx) {
    for (const s of this.smokeEffects) {
      const fIdx = Math.floor(s.frame);
      const frameImg = this.assets.smokeFrames[fIdx];
      if (frameImg && frameImg.complete) {
        const sw = 140;
        const sh = 100;
        ctx.drawImage(frameImg, s.x - sw / 2, s.y - sh + 20, sw, sh);
      }
    }
  }

  drawBrokenBlock(ctx, b) {
    ctx.save();
    ctx.translate(b.x + b.width / 2, b.y + b.height / 2);
    ctx.rotate(b.tumbleRot);
    const brokenDef = this.assets.brokenBlocks[b.blockDef.index] || this.assets.brokenBlocks[0];
    const img = brokenDef.img;
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, -b.width / 2, -b.height / 2, b.width, b.height);
    } else {
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-b.width / 2, -b.height / 2, b.width, b.height);
    }
    ctx.restore();
  }

  drawCraneAndSuspendedBlock(ctx) {
    if (this.state === 'IDLE' && !this.currentBlock) return;

    const craneAnchorX = this.width / 2;
    const craneAnchorY = 0;
    const hookX = this.crane.x;
    const hookY = this.crane.y;

    // 1. Draw Crane Steel Cable
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(craneAnchorX, craneAnchorY);
    ctx.lineTo(hookX, hookY);
    ctx.stroke();

    // 2. Draw Crane Hook (kran2.png)
    if (this.assets.hook.complete && this.assets.hook.naturalWidth > 0) {
      ctx.save();
      ctx.translate(hookX, hookY);
      ctx.rotate(this.crane.angle);
      ctx.drawImage(this.assets.hook, -16, -10, 32, 27);
      ctx.restore();
    }

    // 3. Draw Suspended or Dropping Block
    if (this.currentBlock && !this.currentBlock.settled && !this.currentBlock.isBroken) {
      const b = this.currentBlock;
      ctx.save();

      if (b.isDropping) {
        // Falling with camera compensation
        const renderY = b.y + this.cameraY;
        ctx.drawImage(b.blockDef.img, b.x, renderY, b.width, b.height);
      } else {
        // Swinging harmonically on the hook
        ctx.translate(hookX, hookY + 20);
        ctx.rotate(b.wobble);
        ctx.drawImage(b.blockDef.img, -b.width / 2, 0, b.width, b.height);
      }

      ctx.restore();
    }
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);

      if (p.type === 'coin') {
        ctx.fillStyle = '#fbbf24';
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

window.TowerCrashGame = TowerCrashGame;
