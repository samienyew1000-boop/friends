// Habesha Games Mobile Mini App Logic
(function () {
  'use strict';

  // --- Sound Effects Engine (Synthesized Web Audio API) ---
  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.enabled = true;
    }

    init() {
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          this.ctx = new AudioContext();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    playClick() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    }

    playSuccess() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.15, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.2);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.2);
      });
    }

    playCrashFly() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 1.5);
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 1.5);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 1.5);
    }
  }

  const sound = new SoundEngine();

  // --- Telegram WebApp SDK Integration & Haptic Feedback ---
  function triggerHaptic(type = 'impact') {
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
      if (type === 'impact') {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
      } else if (type === 'success') {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
      } else if (type === 'error') {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
      }
    }
  }

  if (window.Telegram && window.Telegram.WebApp) {
    try {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
      window.Telegram.WebApp.setHeaderColor('#0d121b');
      window.Telegram.WebApp.setBackgroundColor('#0d121b');
    } catch (e) {
      console.log('Telegram WebApp initialized');
    }
  }

  // --- State Management ---
  const state = {
    balance: typeof window.HabeshaWallet !== 'undefined' ? window.HabeshaWallet.get() : parseFloat(localStorage.getItem('habesha_balance') || '1000.00'),
    isBalanceHidden: localStorage.getItem('habesha_balance_hidden') === 'true',
    favorites: JSON.parse(localStorage.getItem('habesha_favorites') || '[]'),
    activeSlide: 0,
    totalSlides: 4,
    autoSlideInterval: null,
    currentPayment: 'telebirr',
    gameSimulatorTimer: null,
    selectedAmount: 100,
  };

  // --- DOM Elements ---
  const balanceText = document.getElementById('balanceText');
  const toggleBalanceBtn = document.getElementById('toggleBalanceBtn');
  const refreshBalanceBtn = document.getElementById('refreshBalanceBtn');
  const eyeIcon = document.getElementById('eyeIcon');
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');

  // Carousel Elements
  const carouselTrack = document.getElementById('carouselTrack');
  const prevSlideBtn = document.getElementById('prevSlideBtn');
  const nextSlideBtn = document.getElementById('nextSlideBtn');
  const carouselDots = document.getElementById('carouselDots');

  // Modals
  const depositModal = document.getElementById('depositModal');
  const couponModal = document.getElementById('couponModal');
  const gameModal = document.getElementById('gameModal');
  const leaderboardModal = document.getElementById('leaderboardModal');
  const promoModal = document.getElementById('promoModal');
  const supportModal = document.getElementById('supportModal');
  const profileModal = document.getElementById('profileModal');

  // --- Toast Notification ---
  let toastTimeout = null;
  function showToast(message, type = 'info') {
    if (toastTimeout) clearTimeout(toastTimeout);
    toastMsg.textContent = message;
    toast.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-4');
    toast.classList.add('opacity-100', 'translate-y-0');
    
    if (type === 'success') {
      sound.playSuccess();
      triggerHaptic('success');
    } else {
      sound.playClick();
      triggerHaptic('impact');
    }

    toastTimeout = setTimeout(() => {
      toast.classList.remove('opacity-100', 'translate-y-0');
      toast.classList.add('opacity-0', 'pointer-events-none', 'translate-y-4');
    }, 2800);
  }

  // --- Balance Updates ---
  function updateBalanceDisplay() {
    if (typeof window.HabeshaWallet !== 'undefined') {
      state.balance = window.HabeshaWallet.get();
    }
    if (state.isBalanceHidden) {
      balanceText.textContent = '••••••';
      eyeIcon.innerHTML = `
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
      `;
    } else {
      balanceText.textContent = typeof window.HabeshaWallet !== 'undefined' ? window.HabeshaWallet.format(state.balance) : state.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      eyeIcon.innerHTML = `
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      `;
    }
    localStorage.setItem('habesha_balance_hidden', state.isBalanceHidden.toString());

    const modeBadge = document.getElementById('walletModeBadge');
    if (modeBadge && window.HabeshaWallet) {
      const mode = window.HabeshaWallet.getMode();
      if (mode === 'demo') {
        modeBadge.textContent = 'DEMO';
        modeBadge.className = 'text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30';
      } else {
        modeBadge.textContent = 'REAL';
        modeBadge.className = 'text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30';
      }
    }
  }

  toggleBalanceBtn.addEventListener('click', () => {
    sound.playClick();
    triggerHaptic('impact');
    state.isBalanceHidden = !state.isBalanceHidden;
    updateBalanceDisplay();
  });

  refreshBalanceBtn.addEventListener('click', () => {
    sound.playClick();
    triggerHaptic('impact');
    refreshBalanceBtn.classList.add('rotate-180');
    setTimeout(() => {
      refreshBalanceBtn.classList.remove('rotate-180');
      showToast('Balance synchronized successfully', 'info');
    }, 400);
  });

  // --- Hero Carousel Engine ---
  function renderDots() {
    carouselDots.innerHTML = '';
    for (let i = 0; i < state.totalSlides; i++) {
      const dot = document.createElement('button');
      dot.className = `transition-all duration-300 rounded-full ${
        i === state.activeSlide ? 'w-6 h-1.5 bg-white shadow-sm' : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/70'
      }`;
      dot.setAttribute('aria-label', `Slide ${i + 1}`);
      dot.addEventListener('click', () => {
        sound.playClick();
        goToSlide(i);
        restartAutoSlide();
      });
      carouselDots.appendChild(dot);
    }
  }

  function goToSlide(index) {
    if (index < 0) {
      state.activeSlide = state.totalSlides - 1;
    } else if (index >= state.totalSlides) {
      state.activeSlide = 0;
    } else {
      state.activeSlide = index;
    }
    carouselTrack.style.transform = `translateX(-${state.activeSlide * 100}%)`;
    renderDots();
  }

  function startAutoSlide() {
    state.autoSlideInterval = setInterval(() => {
      goToSlide(state.activeSlide + 1);
    }, 4500);
  }

  function restartAutoSlide() {
    if (state.autoSlideInterval) clearInterval(state.autoSlideInterval);
    startAutoSlide();
  }

  prevSlideBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sound.playClick();
    goToSlide(state.activeSlide - 1);
    restartAutoSlide();
  });

  nextSlideBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sound.playClick();
    goToSlide(state.activeSlide + 1);
    restartAutoSlide();
  });

  // Carousel touch swipe handling
  let touchStartX = 0;
  let touchEndX = 0;
  carouselTrack.parentElement.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  carouselTrack.parentElement.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    const diff = touchStartX - touchEndX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        goToSlide(state.activeSlide + 1);
      } else {
        goToSlide(state.activeSlide - 1);
      }
      restartAutoSlide();
    }
  }, { passive: true });

  // --- Modal Helpers ---
  function openModal(modalEl) {
    sound.playClick();
    triggerHaptic('impact');
    modalEl.classList.remove('hidden');
    modalEl.classList.add('flex');
    const content = modalEl.querySelector('.modal-content');
    if (content) {
      content.classList.remove('modal-leave');
      content.classList.add('modal-enter');
    }
    document.body.style.overflow = 'hidden';
  }

  function closeModal(modalEl) {
    sound.playClick();
    const content = modalEl.querySelector('.modal-content');
    if (content) {
      content.classList.remove('modal-enter');
      content.classList.add('modal-leave');
      setTimeout(() => {
        modalEl.classList.remove('flex');
        modalEl.classList.add('hidden');
        document.body.style.overflow = '';
      }, 180);
    } else {
      modalEl.classList.remove('flex');
      modalEl.classList.add('hidden');
      document.body.style.overflow = '';
    }
  }

  // Bind close buttons on all modals
  document.querySelectorAll('.close-modal-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-backdrop');
      if (modal) closeModal(modal);
    });
  });

  // Close when clicking outer backdrop
  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        closeModal(backdrop);
      }
    });
  });

  // --- Deposit Flow ---
  document.querySelectorAll('.open-deposit-btn').forEach((btn) => {
    btn.addEventListener('click', () => openModal(depositModal));
  });

  // Payment method selection
  const paymentMethods = document.querySelectorAll('.payment-method-item');
  paymentMethods.forEach((item) => {
    item.addEventListener('click', () => {
      sound.playClick();
      triggerHaptic('impact');
      paymentMethods.forEach((p) => {
        p.classList.remove('border-teal-500', 'bg-teal-500/10');
        p.classList.add('border-slate-800', 'bg-slate-900/60');
      });
      item.classList.add('border-teal-500', 'bg-teal-500/10');
      item.classList.remove('border-slate-800', 'bg-slate-900/60');
      state.currentPayment = item.dataset.method;
      
      const phoneInputPrefix = document.getElementById('phoneInputPrefix');
      if (state.currentPayment === 'telebirr') {
        phoneInputPrefix.textContent = '+251 9';
      } else if (state.currentPayment === 'cbe') {
        phoneInputPrefix.textContent = '+251';
      } else if (state.currentPayment === 'mpesa') {
        phoneInputPrefix.textContent = '+251 7';
      } else {
        phoneInputPrefix.textContent = '+251';
      }
    });
  });

  // Quick amount buttons
  const amountPills = document.querySelectorAll('.amount-pill');
  const customAmountInput = document.getElementById('customAmountInput');
  amountPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      sound.playClick();
      triggerHaptic('impact');
      amountPills.forEach((p) => {
        p.classList.remove('bg-teal-500', 'text-white', 'font-bold');
        p.classList.add('bg-slate-800', 'text-slate-300');
      });
      pill.classList.remove('bg-slate-800', 'text-slate-300');
      pill.classList.add('bg-teal-500', 'text-white', 'font-bold');
      const val = parseInt(pill.dataset.amount, 10);
      state.selectedAmount = val;
      customAmountInput.value = val;
    });
  });

  customAmountInput.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value) || 0;
    state.selectedAmount = val;
    amountPills.forEach((p) => {
      if (parseInt(p.dataset.amount, 10) === val) {
        p.classList.add('bg-teal-500', 'text-white', 'font-bold');
        p.classList.remove('bg-slate-800', 'text-slate-300');
      } else {
        p.classList.remove('bg-teal-500', 'text-white', 'font-bold');
        p.classList.add('bg-slate-800', 'text-slate-300');
      }
    });
  });

  // Deposit confirmation
  const confirmDepositBtn = document.getElementById('confirmDepositBtn');
  confirmDepositBtn.addEventListener('click', () => {
    const phone = document.getElementById('depositPhoneInput').value.trim();
    if (!phone || phone.length < 8) {
      showToast('Please enter a valid mobile number', 'error');
      return;
    }
    const amount = state.selectedAmount;
    if (amount <= 0) {
      showToast('Please enter an amount above 0 ETB', 'error');
      return;
    }

    confirmDepositBtn.disabled = true;
    confirmDepositBtn.innerHTML = `
      <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
      </svg>
      Processing ${state.currentPayment.toUpperCase()}...
    `;

    setTimeout(() => {
      state.balance += amount;
      updateBalanceDisplay();
      closeModal(depositModal);
      confirmDepositBtn.disabled = false;
      confirmDepositBtn.innerHTML = `Deposit Now`;
      showToast(`Successfully deposited ${amount} ETB via ${state.currentPayment.toUpperCase()}!`, 'success');
    }, 1200);
  });

  // --- Coupon Card Flow ---
  const couponBannerCard = document.getElementById('couponBannerCard');
  couponBannerCard.addEventListener('click', () => openModal(couponModal));

  const applyCouponBtn = document.getElementById('applyCouponBtn');
  const couponInput = document.getElementById('couponInput');
  const couponError = document.getElementById('couponError');

  // Sample valid coupons
  const validCoupons = {
    'HABESHA100': 100,
    'VICTORY2026': 250,
    'WELCOME': 50,
    'BOOP': 200,
    'AVIATOR50': 50
  };

  applyCouponBtn.addEventListener('click', () => {
    const code = couponInput.value.trim().toUpperCase();
    if (!code) {
      couponError.textContent = 'Please enter a coupon code';
      couponError.classList.remove('hidden');
      return;
    }

    if (validCoupons[code]) {
      const reward = validCoupons[code];
      couponError.classList.add('hidden');
      state.balance += reward;
      updateBalanceDisplay();
      closeModal(couponModal);
      couponInput.value = '';
      showToast(`🎉 Coupon "${code}" redeemed! +${reward} ETB added!`, 'success');
    } else {
      triggerHaptic('error');
      couponError.textContent = 'Invalid or expired code. Try "HABESHA100" or "WELCOME"';
      couponError.classList.remove('hidden');
    }
  });

  // Quick coupon click helper
  document.querySelectorAll('.sample-coupon-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      sound.playClick();
      couponInput.value = chip.dataset.code;
      couponError.classList.add('hidden');
    });
  });

  // --- Featured Game Click & Simulator Modal ---
  const gameData = {
    'aviator': {
      title: 'Aviator',
      provider: 'SPRIBE',
      multiplier: '97.0% RTP',
      category: 'Crash Game',
      image: 'assets/game_aviator.gif',
      url: 'game/aviator/index.html',
      desc: 'Watch the red plane ascend! Cash out before it flies away to win massive multipliers!'
    },
    'fast_keno': {
      title: 'Fast Keno',
      provider: 'Habesha Gaming',
      multiplier: 'Instant Draw 80',
      category: 'Keno & Lottery',
      image: 'assets/game_fast_keno.gif',
      url: 'game/fast keno/index.html',
      desc: 'Fast paced 80-ball instant lottery. Pick your lucky numbers and win up to 10,000x!'
    },
    'jetx': {
      title: 'JetX',
      provider: 'SmartSoft Gaming',
      multiplier: 'Up to 25,000x',
      category: 'Crash Game',
      image: 'assets/game_jetx.png',
      url: 'game/infinity/index.html',
      desc: 'The supersonic jet rocket is ready for takeoff. Eject before explosion to secure profits!'
    },
    'rocket_star': {
      title: 'Rocket Star',
      provider: 'InOut / Provably Fair',
      multiplier: '98.5% RTP',
      category: 'Provably Fair',
      image: 'assets/game_rocket_star.png',
      url: 'game/infinity/index.html',
      desc: 'Launch through the cosmos with certified cryptographic fairness verification.'
    },
    'aviafly': {
      title: 'Aviafly',
      provider: 'Habesha Studio',
      multiplier: 'Instant Flight',
      category: 'Crash Arcade',
      image: 'assets/game_aviafly.png',
      url: 'game/aviator/index.html',
      desc: 'The fearless chicken pilot navigates through spark storms. Soar high and cash out!'
    },
    'fish_road': {
      title: 'Fish Road',
      provider: 'SeaGames',
      multiplier: 'Casual Arcade',
      image: 'assets/game_fish_road.png',
      url: 'game/fish/index.html',
      desc: 'Dive into the ocean reef! Dodge the sharks and collect underwater treasure chests.'
    },
    'chicken_road': {
      title: 'Chicken Road',
      provider: 'InOut Games',
      multiplier: 'Cross & Win',
      category: 'Instant Game',
      image: 'assets/game_chicken_road.png',
      url: 'game/chicken road/index.html',
      desc: 'Cross the perilous road step by step. Each step boosts your win multiplier!'
    },
    'bingo': {
      title: 'Dallol Bingo',
      provider: 'Ethiopia Bingo',
      multiplier: 'Live Rooms',
      category: 'Bingo 90',
      image: 'assets/game_bingo.png',
      url: 'game/bingo/index.html',
      desc: 'Authentic Ethiopian community bingo room with automated voice and quick payouts.'
    },
    'plinko': {
      title: 'Golden Plinko',
      provider: 'Habesha Original',
      multiplier: 'Up to 1,000x',
      category: 'Plinko',
      image: 'assets/game_plinko.png',
      url: 'game/bingo star/index.html',
      desc: 'Drop golden balls down the peg pyramid for multipliers up to 1,000x your stake!'
    }
  };

  let activeGameUrl = 'game/aviator/index.html';
  let activeGameId = 'aviator';
  function gameAvailable(id) {
    return !window.HabeshaWallet || window.HabeshaWallet.isGameEnabled(id);
  }
  function syncGameAvailability() {
    document.querySelectorAll('.game-card').forEach((card) => {
      const available = gameAvailable(card.dataset.game);
      card.classList.toggle('game-paused', !available);
      card.setAttribute('aria-disabled', String(!available));
      card.title = available ? '' : 'Temporarily unavailable';
    });
    if (gameModal && !gameModal.classList.contains('hidden') && !gameAvailable(activeGameId)) {
      closeModal(gameModal);
      showToast('This game is temporarily unavailable', 'error');
    }
  }
  if (window.HabeshaWallet?.subscribeAdminConfig) {
    window.HabeshaWallet.subscribeAdminConfig(syncGameAvailability);
  }
  const gameModalTitle = document.getElementById('gameModalTitle');
  const gameModalProvider = document.getElementById('gameModalProvider');
  const gameModalCategory = document.getElementById('gameModalCategory');
  const gameModalDesc = document.getElementById('gameModalDesc');
  const gameModalImage = document.getElementById('gameModalImage');
  const demoModalBalVal = document.getElementById('demoModalBalVal');
  const realStatusLabel = document.getElementById('realStatusLabel');
  const realStatusValue = document.getElementById('realStatusValue');
  const realBtnText = document.getElementById('realBtnText');
  const launchDemoModeBtn = document.getElementById('launchDemoModeBtn');
  const launchRealModeBtn = document.getElementById('launchRealModeBtn');

  // Telegram Registration Modal elements
  const telegramRegisterModal = document.getElementById('telegramRegisterModal');
  const closeTelegramRegBtn = document.getElementById('closeTelegramRegBtn');
  const regTelegramUsername = document.getElementById('regTelegramUsername');
  const regDisplayName = document.getElementById('regDisplayName');
  const confirmTelegramRegBtn = document.getElementById('confirmTelegramRegBtn');

  function syncGameModalStatus() {
    const isReg = window.HabeshaWallet ? window.HabeshaWallet.isRegistered() : false;
    const user = window.HabeshaWallet ? window.HabeshaWallet.getUser() : null;

    if (demoModalBalVal) {
      demoModalBalVal.textContent = '1,000.00 ETB';
    }

    if (isReg && user) {
      if (realStatusLabel) realStatusLabel.textContent = 'Telegram Linked:';
      if (realStatusValue) {
        realStatusValue.textContent = '@' + (user.username || user.name);
        realStatusValue.className = 'font-bold text-emerald-400 ml-1';
      }
      if (realBtnText) realBtnText.textContent = 'Play Real Money';
    } else {
      if (realStatusLabel) realStatusLabel.textContent = 'Telegram Account:';
      if (realStatusValue) {
        realStatusValue.textContent = 'Registration Required';
        realStatusValue.className = 'font-bold text-amber-400 ml-1';
      }
      if (realBtnText) realBtnText.textContent = 'Register & Play Real';
    }
  }

  // Launch Demo Mode (Automatic / Renewable 1,000 Birr Practice Balance)
  if (launchDemoModeBtn) {
    launchDemoModeBtn.addEventListener('click', () => {
      if (!gameAvailable(activeGameId)) {
        showToast('This game is temporarily unavailable', 'error');
        return;
      }
      sound.playClick();
      triggerHaptic('impact');

      // Set wallet mode to demo and renew 1,000 ETB balance
      if (window.HabeshaWallet) {
        window.HabeshaWallet.setMode('demo');
        window.HabeshaWallet.renewDemoBalance();
      }

      showToast('?? Demo Mode: 1,000 ETB practice balance ready!', 'info');
      closeModal(gameModal);

      setTimeout(() => {
        if (activeGameUrl) {
          const sep = activeGameUrl.includes('?') ? '&' : '?';
          window.location.href = activeGameUrl + sep + 'mode=demo';
        }
      }, 300);
    });
  }

  // Launch Real Mode (Funded via Telegram)
  if (launchRealModeBtn) {
    launchRealModeBtn.addEventListener('click', () => {
      if (!gameAvailable(activeGameId)) {
        showToast('This game is temporarily unavailable', 'error');
        return;
      }
      sound.playClick();
      triggerHaptic('impact');

      const isReg = window.HabeshaWallet ? window.HabeshaWallet.isRegistered() : false;

      if (!isReg) {
        // Prompt user to register because real balance is funded through Telegram
        closeModal(gameModal);
        // Pre-populate if in Telegram WebApp
        if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
          const tg = window.Telegram.WebApp.initDataUnsafe.user;
          if (regTelegramUsername && tg.username) regTelegramUsername.value = tg.username;
          if (regDisplayName) regDisplayName.value = tg.first_name + (tg.last_name ? ' ' + tg.last_name : '');
        }
        openModal(telegramRegisterModal);
        return;
      }

      // User is registered: set wallet mode to real and launch!
      if (window.HabeshaWallet) {
        window.HabeshaWallet.setMode('real');
      }

      showToast('?? Real Money Mode: Funded via Telegram', 'success');
      closeModal(gameModal);

      setTimeout(() => {
        if (activeGameUrl) {
          const sep = activeGameUrl.includes('?') ? '&' : '?';
          window.location.href = activeGameUrl + sep + 'mode=real';
        }
      }, 300);
    });
  }

  // Close Telegram Registration Modal
  if (closeTelegramRegBtn) {
    closeTelegramRegBtn.addEventListener('click', () => {
      closeModal(telegramRegisterModal);
    });
  }

  // Confirm Telegram Registration
  if (confirmTelegramRegBtn) {
    confirmTelegramRegBtn.addEventListener('click', () => {
      sound.playClick();
      triggerHaptic('impact');

      const username = regTelegramUsername ? regTelegramUsername.value.trim() : '';
      const name = regDisplayName ? regDisplayName.value.trim() : '';

      if (!username && !name) {
        showToast('Please enter your Telegram username or phone', 'error');
        return;
      }

      if (window.HabeshaWallet) {
        window.HabeshaWallet.registerTelegramUser({ username, name });
        window.HabeshaWallet.setMode('real');
      }

      showToast('?? Telegram account registered! Launching real game...', 'success');
      closeModal(telegramRegisterModal);

      setTimeout(() => {
        if (activeGameUrl) {
          const sep = activeGameUrl.includes('?') ? '&' : '?';
          window.location.href = activeGameUrl + sep + 'mode=real';
        }
      }, 400);
    });
  }

  // Bind game card clicks
  document.querySelectorAll('.game-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      // If clicking favorite star, don't open modal
      if (e.target.closest('.star-btn')) {
        return;
      }

      const gameId = card.dataset.game;
      if (!gameAvailable(gameId)) {
        showToast('This game is temporarily unavailable', 'error');
        return;
      }
      const info = gameData[gameId];
      if (info) {
        activeGameId = gameId;
        activeGameUrl = info.url || 'game/aviator/index.html';
        gameModalTitle.textContent = info.title;
        gameModalProvider.textContent = info.provider;
        gameModalCategory.textContent = info.category || 'Featured';
        gameModalDesc.textContent = info.desc;
        gameModalImage.src = info.image;

        syncGameModalStatus();
        openModal(gameModal);
      }
    });
  });

  // Star favorite toggle
  document.querySelectorAll('.star-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      sound.playClick();
      triggerHaptic('impact');
      const card = btn.closest('.game-card');
      const gameId = card.dataset.game;
      const starIcon = btn.querySelector('svg');

      if (state.favorites.includes(gameId)) {
        state.favorites = state.favorites.filter((id) => id !== gameId);
        btn.classList.remove('text-amber-400', 'bg-amber-400/20');
        btn.classList.add('text-teal-400', 'bg-teal-500/20');
        showToast('Removed from favorites');
      } else {
        state.favorites.push(gameId);
        btn.classList.add('text-amber-400', 'bg-amber-400/20');
        btn.classList.remove('text-teal-400', 'bg-teal-500/20');
        showToast('Added to favorites ⭐', 'success');
      }
      localStorage.setItem('habesha_favorites', JSON.stringify(state.favorites));
    });
  });

  // Category filter tabs
  const categoryTabs = document.querySelectorAll('.category-tab');
  categoryTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      sound.playClick();
      triggerHaptic('impact');
      categoryTabs.forEach((t) => {
        t.classList.remove('bg-teal-500', 'text-white', 'shadow-md', 'shadow-teal-500/20');
        t.classList.add('bg-slate-800/80', 'text-slate-400');
      });
      tab.classList.add('bg-teal-500', 'text-white', 'shadow-md', 'shadow-teal-500/20');
      tab.classList.remove('bg-slate-800/80', 'text-slate-400');

      const cat = tab.dataset.category;
      document.querySelectorAll('.game-card').forEach((card) => {
        const gameCat = card.dataset.category;
        const gameId = card.dataset.game;
        if (cat === 'all') {
          card.classList.remove('hidden');
        } else if (cat === 'favorites') {
          if (state.favorites.includes(gameId)) {
            card.classList.remove('hidden');
          } else {
            card.classList.add('hidden');
          }
        } else if (gameCat === cat) {
          card.classList.remove('hidden');
        } else {
          card.classList.add('hidden');
        }
      });
    });
  });

  // --- Bottom Dock Navigation Handlers ---
  document.getElementById('navLeaderboard').addEventListener('click', () => openModal(leaderboardModal));
  document.getElementById('navPromo').addEventListener('click', () => openModal(promoModal));
  document.getElementById('navSupport').addEventListener('click', () => openModal(supportModal));
  document.getElementById('navProfile').addEventListener('click', () => openModal(profileModal));
  document.getElementById('navDeposit').addEventListener('click', () => openModal(depositModal));

  // --- Sound Toggle in Profile ---
  const soundToggle = document.getElementById('soundToggle');
  if (soundToggle) {
    soundToggle.addEventListener('change', (e) => {
      sound.enabled = e.target.checked;
      showToast(sound.enabled ? 'Sound effects enabled' : 'Sound muted');
    });
  }

  // --- Initial Setup ---
  syncGameAvailability();
  updateBalanceDisplay();
  if (typeof window.HabeshaWallet !== 'undefined') {
    window.HabeshaWallet.subscribe((newBal) => {
      state.balance = newBal;
      updateBalanceDisplay();
    });
  }
  renderDots();
  startAutoSlide();

  // Restore favorites styling
  state.favorites.forEach((favId) => {
    const card = document.querySelector(`.game-card[data-game="${favId}"]`);
    if (card) {
      const btn = card.querySelector('.star-btn');
      if (btn) {
        btn.classList.add('text-amber-400', 'bg-amber-400/20');
        btn.classList.remove('text-teal-400', 'bg-teal-500/20');
      }
    }
  });

  console.log('Habesha Games Mini App initialized successfully.');
})();
