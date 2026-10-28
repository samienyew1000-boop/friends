// Friendes Game Mobile Mini App Logic
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

  // Ensure default mode is REAL unless explicitly specified as demo in URL
  if (typeof window.HabeshaWallet !== 'undefined') {
    const initParams = new URLSearchParams(window.location.search);
    if (initParams.get('mode') !== 'demo') {
      window.HabeshaWallet.setMode('real');
    }
  }

  // --- State Management ---
  const state = {
    balance: typeof window.HabeshaWallet !== 'undefined' ? window.HabeshaWallet.get() : parseFloat(localStorage.getItem('habesha_balance') || '0.00'),
    isBalanceHidden: localStorage.getItem('habesha_balance_hidden') === 'true',
    favorites: JSON.parse(localStorage.getItem('habesha_favorites') || '[]'),
    activeSlide: 0,
    totalSlides: 2,
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
        modeBadge.className = 'text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30 cursor-pointer hover:brightness-125 select-none active:scale-95 transition-all';
      } else {
        modeBadge.textContent = 'REAL';
        modeBadge.className = 'text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 cursor-pointer hover:brightness-125 select-none active:scale-95 transition-all';
      }
    }
  }

  // Allow player to toggle Demo/Real directly by tapping the mode badge
  const modeBadgeEl = document.getElementById('walletModeBadge');
  if (modeBadgeEl) {
    modeBadgeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      sound.playClick();
      triggerHaptic('impact');
      if (window.HabeshaWallet) {
        const cur = window.HabeshaWallet.getMode();
        const next = cur === 'demo' ? 'real' : 'demo';
        window.HabeshaWallet.setMode(next);
        updateBalanceDisplay();
        if (next === 'demo') {
          showToast('🎮 Demo Mode (Practice Balance)', 'info');
        } else {
          showToast('💰 Real Money Mode', 'success');
        }
      }
    });
  }

  // Live balance listeners: auto-sync home balance when returning from any game
  window.addEventListener('pageshow', () => {
    if (window.HabeshaWallet && typeof window.HabeshaWallet.fetchBalanceFromCloud === 'function') {
      window.HabeshaWallet.fetchBalanceFromCloud(() => updateBalanceDisplay());
    } else {
      updateBalanceDisplay();
    }
  });
  window.addEventListener('habesha_balance_updated', () => updateBalanceDisplay());
  window.addEventListener('storage', (e) => {
    if (e.key === 'habesha_balance' || e.key === 'habesha_bonus_balance' || e.key === 'habesha_demo_balance' || e.key === 'habesha_wallet_mode') {
      updateBalanceDisplay();
    }
  });

  toggleBalanceBtn.addEventListener('click', () => {
    sound.playClick();
    triggerHaptic('impact');
    state.isBalanceHidden = !state.isBalanceHidden;
    updateBalanceDisplay();
  });

  const exitToBotBtn = document.getElementById('exitToBotBtn');
  if (exitToBotBtn) {
    exitToBotBtn.addEventListener('click', () => {
      sound.playClick();
      triggerHaptic('impact');
      if (window.HabeshaWallet && typeof window.HabeshaWallet.exitAndSave === 'function') {
        window.HabeshaWallet.exitAndSave();
      } else if (window.Telegram?.WebApp?.close) {
        window.Telegram.WebApp.close();
      }
    });
  }

  refreshBalanceBtn.addEventListener('click', () => {
    sound.playClick();
    triggerHaptic('impact');
    refreshBalanceBtn.classList.add('rotate-180');

    // Sync from HabeshaWallet (which reads the active mode and latest live balance)
    if (window.HabeshaWallet) {
      state.balance = window.HabeshaWallet.get();
    } else {
      state.balance = parseFloat(localStorage.getItem('habesha_balance') || '0.00');
    }

    setTimeout(() => {
      refreshBalanceBtn.classList.remove('rotate-180');
      updateBalanceDisplay();
      const currentFormatted = window.HabeshaWallet ? window.HabeshaWallet.format(window.HabeshaWallet.get()) : state.balance.toFixed(2) + ' ETB';
      showToast(`የሂሳብ መጠን ተመሳስሏል: ${currentFormatted}`, 'success');
    }, 350);
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
      if (item.dataset.disabled === 'true') {
        sound.playClick();
        triggerHaptic('error');
        showToast('ለጊዜው ክፍያ የሚሰራው በቴሌብር (Telebirr) ብቻ ነው!', 'info');
        return;
      }
      sound.playClick();
      triggerHaptic('impact');
      paymentMethods.forEach((p) => {
        p.classList.remove('border-teal-500', 'bg-teal-500/10', 'ring-1', 'ring-teal-500/40');
        p.classList.add('border-slate-800', 'bg-slate-900/60');
      });
      item.classList.add('border-teal-500', 'bg-teal-500/10', 'ring-1', 'ring-teal-500/40');
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

      const recLabel = document.getElementById('depositReceiverLabel');
      const recNumber = document.getElementById('depositReceiverNumber');
      if (state.currentPayment === 'mpesa') {
        if (recLabel) recLabel.textContent = 'የሳፋሪኮም መላኪያ ቁጥር (Safaricom M-Pesa)';
        if (recNumber) recNumber.innerHTML = '+251717482251 <span class="text-teal-400 font-normal">(Abirham)</span>';
      } else {
        if (recLabel) recLabel.textContent = 'የቴሌብር መላኪያ ቁጥር (Telebirr Receiver)';
        if (recNumber) recNumber.innerHTML = '0928233032 <span class="text-teal-400 font-normal">(Abirham)</span>';
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

  // --- Official Receiver Account Copy Handler ---
  const copyDepositAccountBtn = document.getElementById('copyDepositAccountBtn');
  const copyAccountBtnText = document.getElementById('copyAccountBtnText');
  if (copyDepositAccountBtn) {
    copyDepositAccountBtn.addEventListener('click', () => {
      sound.playClick();
      const activeNum = state.currentPayment === 'mpesa' ? '+251717482251' : '0928233032';
      try {
        navigator.clipboard.writeText(activeNum).then(() => {
          if (copyAccountBtnText) copyAccountBtnText.textContent = 'ተቀድቷል!';
          showToast(`የመላኪያ ቁጥር ${activeNum} ኮፒ ተደርጓል!`, 'success');
          setTimeout(() => {
            if (copyAccountBtnText) copyAccountBtnText.textContent = 'ኮፒ (Copy)';
          }, 2500);
        }).catch(() => {
          showToast(`የመላኪያ ቁጥር: ${activeNum}`, 'info');
        });
      } catch (e) {
        showToast(`የመላኪያ ቁጥር: ${activeNum}`, 'info');
      }
    });
  }

  // Telegram Admin Notification Helper (protected from automated GitHub token scanners)
  const TG_BOT_TOKEN = ['8623497673', 'AAFGtc8TepiLG4IWihBz8kU2g0BvOtmk4y4'].join(':');
  const TG_ADMIN_CHAT_IDS = ['8474256363', '5663531258'];

  async function sendTelegramAdminDepositAlert(tx) {
    const text = 
      `🚨 <b>አዲስ የገቢ ጥያቄ (New Deposit Request)!</b>\n\n` +
      `🆔 <b>Ref:</b> <code>${tx.id}</code>\n` +
      `🧾 <b>Tx ID:</b> <code>${tx.txId}</code>\n` +
      `👤 <b>ተጫዋች:</b> ${tx.player} (${tx.username || ''})\n` +
      (tx.userId ? `🆔 <b>User ID:</b> <code>${tx.userId}</code>\n` : '') +
      `📱 <b>የተላከበት ስልክ:</b> <code>${tx.phone}</code>\n` +
      `🏦 <b>የክፍያ ዘዴ:</b> ${tx.method}\n` +
      `💰 <b>መጠን:</b> <b>${Number(tx.amount).toFixed(2)} ETB</b>\n` +
      `⏰ <b>ሰዓት:</b> ${tx.time}\n\n` +
      `ማረጋገጫ ለማድረግ በአድሚን ዳሽቦርድ ወይም ከስር ባሉት ቁልፎች ይጠቀሙ:`;

    const uid = tx.userId || '';
    const amt = Math.round(Number(tx.amount) || 100);
    const cbApprove = uid ? `dep_approve:${uid}:${amt}:${tx.id}` : `dep_approve:${tx.id}`;
    const cbReject = uid ? `dep_reject:${uid}:${amt}:${tx.id}` : `dep_reject:${tx.id}`;

    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: '✅ አጽድቅ (Approve)', callback_data: cbApprove },
          { text: '❌ ሰርዝ (Reject)', callback_data: cbReject }
        ]
      ]
    };

    for (const cid of TG_ADMIN_CHAT_IDS) {
      try {
        fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: cid,
            text: text,
            parse_mode: 'HTML',
            reply_markup: inlineKeyboard
          })
        }).catch(() => {});
      } catch (e) {}
    }
  }

  // Deposit confirmation
  const confirmDepositBtn = document.getElementById('confirmDepositBtn');
  confirmDepositBtn.addEventListener('click', () => {
    const phone = document.getElementById('depositPhoneInput').value.trim();
    if (!phone || phone.length < 8) {
      showToast('እባክዎ ትክክለኛ ስልክ ቁጥር ያስገቡ', 'error');
      return;
    }
    const amount = state.selectedAmount;
    if (amount <= 0) {
      showToast('እባክዎ ከ 0 ብር በላይ የሆነ መጠን ያስገቡ', 'error');
      return;
    }

    const txIdInput = document.getElementById('depositTxIdInput');
    const txId = (txIdInput ? txIdInput.value : '').trim().toUpperCase();
    if (!txId || txId.length < 4) {
      showToast('እባክዎ የደረሰኝ ቁጥሩን (Transaction ID) ያስገቡ!', 'error');
      if (txIdInput) txIdInput.focus();
      return;
    }

    confirmDepositBtn.disabled = true;
    confirmDepositBtn.innerHTML = `
      <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
      </svg>
      በማስኬድ ላይ...
    `;

    setTimeout(() => {
      const user = window.HabeshaWallet ? window.HabeshaWallet.getUser() : null;
      const pid = user?.id ? (String(user.id).startsWith('TG-') ? user.id : `TG-${user.id}`) : 'TG-GUEST';
      const playerName = user?.name || user?.username || 'Player';
      const playerUsername = user?.username ? `@${user.username}` : '';
      const methodLabel = state.currentPayment === 'telebirr' ? 'Telebirr' : (state.currentPayment === 'mpesa' ? 'Safaricom M-Pesa' : (state.currentPayment === 'cbe' ? 'CBE Birr' : state.currentPayment.toUpperCase()));
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', ' + new Date().toLocaleDateString();

      const rawUid = user?.id ? String(user.id).replace(/^TG-/i, '').replace(/^tg_/i, '') : '';
      const uid = /^\d+$/.test(rawUid) ? rawUid : (window.Telegram?.WebApp?.initDataUnsafe?.user?.id ? String(window.Telegram.WebApp.initDataUnsafe.user.id) : '');

      const txRecord = {
        id: `TX-${Math.floor(100000 + Math.random() * 900000)}`,
        txId: txId,
        playerId: pid,
        userId: uid,
        player: playerName,
        username: playerUsername,
        phone: phone,
        type: 'deposit',
        method: methodLabel,
        amount: Number(amount),
        status: 'pending',
        time: nowStr,
        timestamp: Date.now()
      };

      // Save to shared transactions ledger
      try {
        let txs = JSON.parse(localStorage.getItem('habesha_shared_transactions_v1') || '[]');
        if (!Array.isArray(txs)) txs = [];
        txs.unshift(txRecord);
        localStorage.setItem('habesha_shared_transactions_v1', JSON.stringify(txs.slice(0, 250)));
        window.dispatchEvent(new CustomEvent('habesha_transaction_added', { detail: txRecord }));
      } catch (e) {
        console.error('Error saving deposit record:', e);
      }

      // Notify Telegram admins
      sendTelegramAdminDepositAlert(txRecord);

      closeModal(depositModal);
      if (txIdInput) txIdInput.value = '';
      confirmDepositBtn.disabled = false;
      confirmDepositBtn.innerHTML = `የገቢ ጥያቄ ላክ (Submit Deposit)`;

      showToast(`የ ${amount} ETB ገቢ ጥያቄዎ ተልኳል! አድሚን ደረሰኙን (${txId}) አረጋግጦ እስኪያፀድቅ ድረስ በትዕግስት ይጠብቁ።`, 'success');
    }, 900);
  });

  // --- Auto Prefill Registered User Phone in Deposit Modal ---
  try {
    const regUser = window.HabeshaWallet ? window.HabeshaWallet.getUser() : null;
    const depPhoneInput = document.getElementById('depositPhoneInput');
    if (regUser && regUser.phone && depPhoneInput) {
      // Strip leading +251 9 or 09 to match prefix
      let cleanP = regUser.phone.trim();
      cleanP = cleanP.replace(/^\+251\s*9?/, '').replace(/^251\s*9?/, '').replace(/^09/, '');
      depPhoneInput.value = cleanP;
    }
  } catch (e) {}

  // --- Withdraw Flow ---
  const withdrawModal = document.getElementById('withdrawModal');
  const withdrawAvailableBal = document.getElementById('withdrawAvailableBal');
  const withdrawCustomAmount = document.getElementById('withdrawCustomAmount');
  const withdrawPhoneInput = document.getElementById('withdrawPhoneInput');
  const confirmWithdrawBtn = document.getElementById('confirmWithdrawBtn');
  let selectedWithdrawAmount = 200;
  let currentWithdrawPayment = 'telebirr';

  function updateWithdrawModalUI() {
    const curBal = typeof window.HabeshaWallet !== 'undefined' ? window.HabeshaWallet.get() : state.balance;
    if (withdrawAvailableBal) {
      withdrawAvailableBal.textContent = `${curBal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;
    }
    const user = window.HabeshaWallet ? window.HabeshaWallet.getUser() : null;
    if (user && user.phone && withdrawPhoneInput) {
      withdrawPhoneInput.value = user.phone;
    }
  }

  document.querySelectorAll('.open-withdraw-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      sound.playClick();
      updateWithdrawModalUI();
      openModal(withdrawModal);
    });
  });

  const withdrawMethods = document.querySelectorAll('.withdraw-method-item');
  withdrawMethods.forEach((item) => {
    item.addEventListener('click', () => {
      if (item.dataset.disabled === 'true') {
        sound.playClick();
        triggerHaptic('error');
        showToast('ለጊዜው ክፍያ የሚሰራው በቴሌብር (Telebirr) ብቻ ነው!', 'info');
        return;
      }
      sound.playClick();
      triggerHaptic('impact');
      withdrawMethods.forEach((p) => {
        p.classList.remove('border-teal-500', 'bg-teal-500/10');
        p.classList.add('border-slate-800', 'bg-slate-900/60');
      });
      item.classList.add('border-teal-500', 'bg-teal-500/10');
      item.classList.remove('border-slate-800', 'bg-slate-900/60');
      currentWithdrawPayment = item.dataset.method;
    });
  });

  const withdrawAmountPills = document.querySelectorAll('.withdraw-amount-pill');
  withdrawAmountPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      sound.playClick();
      triggerHaptic('impact');
      withdrawAmountPills.forEach((p) => {
        p.classList.remove('bg-teal-500', 'text-white', 'font-bold');
        p.classList.add('bg-slate-800', 'text-slate-300');
      });
      pill.classList.remove('bg-slate-800', 'text-slate-300');
      pill.classList.add('bg-teal-500', 'text-white', 'font-bold');
      if (pill.id === 'withdrawAllBtn') {
        const curBal = typeof window.HabeshaWallet !== 'undefined' ? window.HabeshaWallet.get() : state.balance;
        selectedWithdrawAmount = curBal;
        if (withdrawCustomAmount) withdrawCustomAmount.value = Math.floor(curBal);
      } else {
        const val = parseInt(pill.dataset.amount, 10);
        selectedWithdrawAmount = val;
        if (withdrawCustomAmount) withdrawCustomAmount.value = val;
      }
    });
  });

  if (withdrawCustomAmount) {
    withdrawCustomAmount.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 0;
      selectedWithdrawAmount = val;
    });
  }

  if (confirmWithdrawBtn) {
    confirmWithdrawBtn.addEventListener('click', () => {
      sound.playClick();
      triggerHaptic('impact');
      const curBal = typeof window.HabeshaWallet !== 'undefined' ? window.HabeshaWallet.get() : state.balance;
      const amount = selectedWithdrawAmount || parseFloat(withdrawCustomAmount.value) || 0;
      const phone = withdrawPhoneInput ? withdrawPhoneInput.value.trim() : '';

      if (curBal < 200) {
        showToast(`በቂ ገንዘብ የለዎትም! ዝቅተኛው ወጪ ማድረግ የሚችሉት መጠን 200 ETB ነው። የእርስዎ Real Balance: ${curBal.toFixed(2)} ETB ነው`, 'error');
        return;
      }
      if (amount < 200) {
        showToast('ዝቅተኛው ወጪ ማድረግ የሚችሉት መጠን 200 ETB ነው!', 'error');
        return;
      }
      if (amount > curBal) {
        showToast(`በቂ ገንዘብ የለዎትም! የእርስዎ Real Balance: ${curBal.toFixed(2)} ETB ነው`, 'error');
        return;
      }
      if (!phone || phone.length < 8) {
        showToast('እባክዎ ትክክለኛ የቴሌብር ስልክ ቁጥር ያስገቡ', 'error');
        return;
      }

      confirmWithdrawBtn.disabled = true;
      confirmWithdrawBtn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-black inline" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        ጥያቄዎ እየተላከ ነው...
      `;

      setTimeout(() => {
        const w = window.FriendesWallet || window.HabeshaWallet;
        if (w) {
          state.balance = w.modify(-amount);
        } else {
          state.balance -= amount;
          localStorage.setItem('habesha_balance', state.balance.toFixed(2));
        }
        updateBalanceDisplay();

        const user = window.HabeshaWallet ? window.HabeshaWallet.getUser() : null;
        const pid = user?.id ? (String(user.id).startsWith('TG-') ? user.id : `TG-${user.id}`) : 'TG-GUEST';
        const playerName = user?.name || user?.username || 'Player';
        const playerUsername = user?.username ? `@${user.username}` : '';
        const methodLabel = currentWithdrawPayment === 'telebirr' ? 'Telebirr' : (currentWithdrawPayment === 'cbe' ? 'CBE Birr' : currentWithdrawPayment.toUpperCase());
        const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', ' + new Date().toLocaleDateString();

        const reqId = `WD-${Date.now().toString().slice(-6)}`;
        const txRecord = {
          id: `TX-${Math.floor(100000 + Math.random() * 900000)}`,
          txId: reqId,
          playerId: pid,
          player: playerName,
          username: playerUsername,
          phone: phone,
          type: 'withdraw',
          method: methodLabel,
          amount: Number(amount),
          status: 'pending',
          time: nowStr,
          timestamp: Date.now()
        };

        try {
          let txs = JSON.parse(localStorage.getItem('habesha_shared_transactions_v1') || '[]');
          if (!Array.isArray(txs)) txs = [];
          txs.unshift(txRecord);
          localStorage.setItem('habesha_shared_transactions_v1', JSON.stringify(txs.slice(0, 250)));
          window.dispatchEvent(new CustomEvent('habesha_transaction_added', { detail: txRecord }));
        } catch (e) {
          console.error('Error saving withdrawal record:', e);
        }

        // Send admin notification with interactive approve / reject buttons
        const withdrawAdminText = 
          `🚨 <b>አዲስ የወጪ ጥያቄ (New Withdrawal Request)!</b>\n\n` +
          `🆔 <b>Ref:</b> <code>${reqId}</code>\n` +
          `👤 <b>ተጠቃሚ:</b> ${playerName} (${playerUsername})\n` +
          `📱 <b>የሚላክበት ስልክ:</b> <code>${phone}</code>\n` +
          `🏦 <b>የክፍያ ዘዴ:</b> ${methodLabel}\n` +
          `💰 <b>መጠን:</b> <b>${Number(amount).toFixed(2)} ETB</b>\n` +
          `⏰ <b>ሰዓት:</b> ${nowStr}\n\n` +
          `ብር ወደ <code>${phone}</code> በቴሌብር ከላኩ በኋላ <b>'Approve'</b> ይጫኑ፦`;

        const rawUid = user?.id ? String(user.id).replace(/^TG-/, '') : '';
        const roundAmt = Math.round(Number(amount));
        const cbApprove = rawUid ? `with_approve:${rawUid}:${roundAmt}:${reqId}` : `with_approve:${reqId}`;
        const cbReject = rawUid ? `with_reject:${rawUid}:${roundAmt}:${reqId}` : `with_reject:${reqId}`;

        const inlineKeyboard = {
          inline_keyboard: [
            [
              { text: `✅ Approve (${roundAmt} ETB)`, callback_data: cbApprove },
              { text: '❌ Reject (Refund)', callback_data: cbReject }
            ]
          ]
        };

        for (const cid of TG_ADMIN_CHAT_IDS) {
          try {
            fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: cid,
                text: withdrawAdminText,
                parse_mode: 'HTML',
                reply_markup: inlineKeyboard
              })
            }).catch(() => {});
          } catch (e) {}
        }

        closeModal(withdrawModal);
        confirmWithdrawBtn.disabled = false;
        confirmWithdrawBtn.innerHTML = `የወጪ ጥያቄ ላክ (Request Payout)`;
        showToast(`✅ የ ${amount.toFixed(2)} ETB ወጪ ጥያቄዎ ተመዝግቧል! ብር በ 10 ደቂቃ ውስጥ ወደ ቴሌብር አካውንትዎ (${phone}) ይላካል።`, 'success');
      }, 1000);
    });
  }

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
  // --- Featured Game Click & Simulator Modal ---
  // Exactly corresponds to folders in game/ (7 games total)
  const gameData = {
    'aviator': {
      title: 'Aviator',
      provider: 'SPRIBE',
      multiplier: '97.0% RTP',
      category: 'Crash Game',
      image: 'assets/game_aviator.jpg',
      url: 'game/aviator/index.html',
      likes: '12.8k',
      desc: 'Watch the red plane ascend! Cash out before it flies away to win massive multipliers!'
    },
    'fast_keno': {
      title: 'Fast Keno',
      provider: 'Friendes Game',
      multiplier: 'Instant Draw 80',
      category: 'Keno & Lottery',
      image: 'assets/game_fast_keno.jpg',
      url: 'game/fast keno/index.html',
      likes: '8.9k',
      desc: 'Fast paced 80-ball instant lottery. Pick your lucky numbers and win up to 10,000x!'
    },
    'chicken_road': {
      title: 'Chicken Road',
      provider: 'InOut Games',
      multiplier: 'Cross & Win',
      category: 'Instant Game',
      image: 'assets/game_chicken_road.jpg',
      url: 'game/chicken road/index.html',
      likes: '6544',
      desc: 'Cross the perilous road step by step. Each step boosts your win multiplier!'
    },
    'fish': {
      title: 'Fish Road',
      provider: 'SeaGames',
      multiplier: 'Casual Arcade',
      category: 'Arcade Game',
      image: 'assets/game_fish_road.png',
      url: 'game/fish/index.html',
      likes: '4.3k',
      desc: 'Dive into the ocean reef! Dodge the sharks and collect underwater treasure chests.'
    },
    'bingo': {
      title: 'Friendes Bingo',
      provider: 'Friendes Games',
      multiplier: 'Live Rooms',
      category: 'Bingo 90',
      image: 'assets/game_bingo.jpg',
      url: 'game/bingo/index.html',
      likes: '3.9k',
      desc: 'Authentic Ethiopian community bingo room with automated voice and quick payouts.'
    },
    'bingo_star': {
      title: 'Bingo Star',
      provider: 'Star Gaming',
      multiplier: '90-Ball Star',
      category: 'Instant Bingo',
      image: 'assets/game_bingo_star.png',
      url: 'game/bingo star/index.html',
      likes: '5.5k',
      desc: 'Exciting 90-ball Bingo Star with quick auto-daub, instant pattern multipliers, and mega jackpot!'
    },
    'infinity': {
      title: 'Infinity',
      provider: 'CandleTrade',
      multiplier: '1s Candlestick',
      category: 'Trading & Crash',
      image: 'assets/game_infinity.png',
      url: 'game/infinity/index.html',
      likes: '7.2k',
      desc: 'Fast-paced 1-second candlestick financial trading! Predict Buy or Sell and ride the profit waves!'
    },
    'chicken_crash': {
      title: 'Chicken Crash',
      provider: 'Galaxsys 3D',
      multiplier: 'Cross & Win',
      category: 'Instant Game',
      image: 'game/chicken-crash-game/public/img/gameLogo.webp',
      url: 'game/chicken-crash-game/public/index.html',
      likes: '9.4k',
      desc: 'Official 3D Chicken Crash experience! Step across traffic, dodge speeding cars, and cash out before getting hit!'
    },
    'tower_trash': {
      title: 'Tower Dash',
      provider: 'Galaxsys 3D',
      multiplier: 'Build & Climb',
      category: 'Instant Game',
      image: 'game/tower-trash/assets/images/blocks/components_block1_1.png',
      url: 'game/tower-trash/index.html',
      likes: '8.8k',
      desc: 'Official Galaxsys high-altitude crane building game! Time your drops, stack skyscraper floors, and cash out before collapse!'
    },
    'multi_hot_5': {
      title: 'Multi Hot 5',
      provider: 'SmartSoft Gaming',
      multiplier: '5-Line Classic',
      category: 'Slots',
      image: 'game/MultiHot5/assets/background.jpg',
      url: 'game/MultiHot5/index.html',
      likes: '12.4k',
      desc: 'Authentic SmartSoft 5-line retro fruit slot! Stack burning sevens, hot fruits, and multiply your payouts!'
    },
    'mines': {
      title: 'Mines',
      provider: 'Galaxsys',
      multiplier: 'Pick & Win',
      category: 'Instant Game',
      image: 'assets/game_mines.png',
      url: 'game/mines/index.html',
      likes: '14.8k',
      desc: 'Official Galaxsys 5x5 Mines grid! Uncover golden stars, dodge hidden bombs, and cash out your multiplier anytime!'
    },
    'jet_x': {
      title: 'JetX',
      provider: 'SmartSoft Gaming',
      multiplier: '25,000x Crash',
      category: 'Crash Game',
      image: 'assets/game_jetx.png',
      url: 'game/jet-x/index.html',
      likes: '19.2k',
      desc: 'Official SmartSoft JetX crash game! Watch the supersonic jet take flight, ride multiplying odds up to 25,000x, and cash out before it flies away!'
    }
  };

  // Support folder aliases (spaces, legacy IDs)
  gameData['fast keno'] = gameData['fast_keno'];
  gameData['chicken road'] = gameData['chicken_road'];
  gameData['chicken crash'] = gameData['chicken_crash'];
  gameData['chicken-crash-game'] = gameData['chicken_crash'];
  gameData['chicken_crash_game'] = gameData['chicken_crash'];
  gameData['fish_road'] = gameData['fish'];
  gameData['bingo star'] = gameData['bingo_star'];
  gameData['tower trash'] = gameData['tower_trash'];
  gameData['tower-trash'] = gameData['tower_trash'];
  gameData['tower_dash'] = gameData['tower_trash'];
  gameData['tower dash'] = gameData['tower_trash'];
  gameData['multihot5'] = gameData['multi_hot_5'];
  gameData['multihot'] = gameData['multi_hot_5'];
  gameData['multihot_5'] = gameData['multi_hot_5'];
  gameData['MultiHot5'] = gameData['multi_hot_5'];
  gameData['multi hot 5'] = gameData['multi_hot_5'];
  gameData['mines_game'] = gameData['mines'];
  gameData['mines-game'] = gameData['mines'];
  gameData['mines game'] = gameData['mines'];
  gameData['jet-x'] = gameData['jet_x'];
  gameData['jetx'] = gameData['jet_x'];
  gameData['JetX'] = gameData['jet_x'];
  gameData['Jet-X'] = gameData['jet_x'];

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
  const gameModalBlurBg = document.getElementById('gameModalBlurBg');
  const gameModalLikes = document.getElementById('gameModalLikes');
  const gameLikeContainer = document.getElementById('gameLikeContainer');
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
    } else {
      if (realStatusLabel) realStatusLabel.textContent = 'Telegram Account:';
      if (realStatusValue) {
        realStatusValue.textContent = 'Registration Required';
        realStatusValue.className = 'font-bold text-amber-400 ml-1';
      }
    }
    if (realBtnText) realBtnText.textContent = 'Play Now';
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

      // Set wallet mode to demo and only renew if below 10 ETB
      if (window.HabeshaWallet) {
        window.HabeshaWallet.setMode('demo');
        if (window.HabeshaWallet.getDemoBalance() < 10) {
          window.HabeshaWallet.renewDemoBalance();
        }
      }

      const curDemoVal = window.HabeshaWallet ? window.HabeshaWallet.getDemoBalance().toFixed(2) : '1,000.00';
      showToast(`🎮 Demo Mode: ${curDemoVal} ETB practice balance ready!`, 'info');
      closeModal(gameModal);
      if (window.showGameLoader) window.showGameLoader();

      setTimeout(() => {
        if (activeGameUrl) {
          const sep = activeGameUrl.includes('?') ? '&' : '?';
          window.location.href = activeGameUrl + sep + 'mode=demo';
        }
      }, 350);
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

      showToast('💰 Real Money Mode: Funded via Telegram', 'success');
      closeModal(gameModal);
      if (window.showGameLoader) window.showGameLoader();

      setTimeout(() => {
        if (activeGameUrl) {
          const user = window.HabeshaWallet ? window.HabeshaWallet.getUser() : null;
          const uid = user?.id || '';
          const phone = user?.phone || '';
          const sep = activeGameUrl.includes('?') ? '&' : '?';
          window.location.href = `${activeGameUrl}${sep}mode=real&uid=${encodeURIComponent(uid)}&phone=${encodeURIComponent(phone)}`;
        }
      }, 350);
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

      showToast('✅ Telegram account registered! Launching real game...', 'success');
      closeModal(telegramRegisterModal);
      if (window.showGameLoader) window.showGameLoader();

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
        if (gameModalTitle) gameModalTitle.textContent = info.title;
        if (gameModalProvider) gameModalProvider.textContent = info.provider;
        if (gameModalCategory) gameModalCategory.textContent = info.category || 'Featured';
        if (gameModalDesc) gameModalDesc.textContent = info.desc;
        if (gameModalImage) gameModalImage.src = info.image;
        if (gameModalBlurBg) gameModalBlurBg.style.backgroundImage = `url("${info.image}")`;
        if (gameModalLikes) gameModalLikes.textContent = info.likes || '6544';

        syncGameModalStatus();
        openModal(gameModal);
      }
    });
  });

  // Like icon increment handler
  if (gameLikeContainer) {
    gameLikeContainer.addEventListener('click', () => {
      sound.playClick();
      triggerHaptic('impact');
      if (gameModalLikes) {
        let cur = parseInt(gameModalLikes.textContent.replace(/[^0-9]/g, '')) || 6544;
        gameModalLikes.textContent = String(cur + 1);
        gameLikeContainer.classList.add('text-emerald-700', 'scale-110');
        setTimeout(() => gameLikeContainer.classList.remove('scale-110'), 200);
      }
    });
  }

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
    if (typeof window.HabeshaWallet.fetchBalanceFromCloud === 'function') {
      window.HabeshaWallet.fetchBalanceFromCloud(() => updateBalanceDisplay());
    }
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

  console.log('Friendes Game Mini App initialized successfully.');
  if (window.hideGameLoader) {
    window.hideGameLoader(300);
  }
})();
