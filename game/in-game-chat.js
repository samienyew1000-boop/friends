/**
 * InGameChat - Universal Realtime Chat & Rain System
 * Compatible with Spribe Aviator, Chicken Road, and Jet-X
 * Features:
 * - Live Player Messages & Verified Bet Win Cards
 * - Rain Dropping & Rain Claiming into HabeshaWallet
 * - Emoji picker, audio fx, and unread notification badge
 */
(function(global) {
  'use strict';

  const AVATARS = [
    { icon: '🍀', bg: '#14532d' },
    { icon: '🦒', bg: '#713f12' },
    { icon: '🦉', bg: '#1e293b' },
    { icon: '🦁', bg: '#854d0e' },
    { icon: '😎', bg: '#1e3a8a' },
    { icon: '🚀', bg: '#4c1d95' },
    { icon: '🌴', bg: '#064e3b' },
    { icon: '⭐', bg: '#78350f' },
    { icon: '💎', bg: '#083344' },
    { icon: '👑', bg: '#581c87' }
  ];

  const SIMULATED_PLAYERS = [
    { name: '+***6', avatar: AVATARS[0] },
    { name: '+***5', avatar: AVATARS[1] },
    { name: '+***1', avatar: AVATARS[2] },
    { name: '+***7', avatar: AVATARS[3] },
    { name: 'Abebe_T', avatar: AVATARS[4] },
    { name: 'Selam_K', avatar: AVATARS[5] },
    { name: 'Yonas_9', avatar: AVATARS[6] },
    { name: 'D••••2', avatar: AVATARS[7] },
    { name: 'Biniyam', avatar: AVATARS[8] },
    { name: 'D••••4', avatar: AVATARS[9] }
  ];

  const CHAT_COMMENTS = [
    'Congratulations 👏',
    'Wow! 😮',
    'Nice cashout! 🔥',
    'Let\'s gooo! 🚀',
    'Big win right there 💰',
    'Good luck guys 👍',
    'Waiting for the 100x ✈️',
    'Boom! What a round 🥳',
    'Thanks for the rain! 🙏',
    'Cross safely everyone 🐔'
  ];

  const EMOJIS = ['👏', '🔥', '😮', '🚀', '💰', '😎', '🎉', '👍', '❤️', '🤑', '🍀', '✈️', '🐔', '🥳'];

  class InGameChat {
    constructor(options = {}) {
      this.gameName = options.gameName || 'aviator'; // 'aviator' | 'chicken_road'
      this.mountBtn = options.mountBtn || '#chatToggleBtn';
      this.isOpen = false;
      this.unreadCount = 0;
      this.onlineCount = 8;
      this.claimedRainIds = new Set();
      this.messages = [];
      this.dividerIcon = this.gameName.includes('chicken') ? '🐔' : '✈️';

      this.initDOM();
      this.bindEvents();
      this.seedInitialMessages();
      this.startSimulatedActivity();
      this.startRainScheduler();
    }

    getWallet() {
      return window.FriendesWallet || window.HabeshaWallet || null;
    }

    formatTime(date = new Date()) {
      const h = String(date.getHours()).padStart(2, '0');
      const m = String(date.getMinutes()).padStart(2, '0');
      const s = String(date.getSeconds()).padStart(2, '0');
      return `${h}:${m}:${s}`;
    }

    initDOM() {
      // 1. Create Dimmer
      this.dimmer = document.createElement('div');
      this.dimmer.className = 'chat-backdrop-dimmer';
      document.body.appendChild(this.dimmer);

      // 2. Create Drawer
      this.drawer = document.createElement('aside');
      this.drawer.className = 'ingame-chat-drawer';
      this.drawer.setAttribute('aria-label', 'In-Game Live Chat');

      this.drawer.innerHTML = `
        <!-- Header -->
        <header class="chat-drawer-header">
          <button type="button" class="chat-header-btn" id="chatInfoBtn" title="Chat Rules">i</button>
          <div class="chat-online-badge">
            <span class="chat-online-dot"></span>
            <span id="chatOnlineText">Online: ${this.onlineCount}</span>
          </div>
          <button type="button" class="chat-header-btn" id="chatCloseBtn" title="Close Chat">✕</button>
        </header>

        <!-- Message List -->
        <div class="chat-messages-container" id="chatMessagesContainer"></div>

        <!-- Emoji Bar -->
        <div class="chat-emoji-strip" id="chatEmojiStrip">
          ${EMOJIS.map(e => `<button type="button" class="chat-emoji-btn" data-emoji="${e}">${e}</button>`).join('')}
        </div>

        <!-- Footer Input Bar -->
        <footer class="chat-drawer-footer">
          <div class="chat-input-capsule">
            <button type="button" class="chat-capsule-btn" id="chatEmojiToggleBtn" title="Emojis">😊</button>
            <button type="button" class="chat-capsule-btn rain-trigger" id="chatRainTriggerBtn" title="Drop Rain">🌧️</button>
            <input type="text" class="chat-text-input" id="chatTextInput" placeholder="Your message..." maxlength="160" autocomplete="off" />
            <span class="chat-char-counter" id="chatCharCounter">160</span>
            <button type="button" class="chat-send-btn" id="chatSendBtn" title="Send Message">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>
        </footer>
      `;
      document.body.appendChild(this.drawer);

      // 3. Make it Rain Modal
      this.rainModal = document.createElement('div');
      this.rainModal.className = 'chat-rain-modal';
      this.rainModal.id = 'chatRainModal';
      this.rainModal.innerHTML = `
        <div class="chat-rain-modal-card">
          <div class="chat-rain-modal-title">🌧️ Make it Rain</div>
          <p class="chat-rain-modal-desc">Share ETB with other active players in the game chat!</p>
          
          <label style="font-size: 11px; color: #94a3b8; font-weight: 700; text-transform: uppercase;">Amount (ETB)</label>
          <div class="chat-rain-options-row" id="rainAmountRow">
            <button type="button" class="chat-rain-chip selected" data-amt="5">5 ETB</button>
            <button type="button" class="chat-rain-chip" data-amt="10">10 ETB</button>
            <button type="button" class="chat-rain-chip" data-amt="25">25 ETB</button>
            <button type="button" class="chat-rain-chip" data-amt="50">50 ETB</button>
          </div>

          <label style="font-size: 11px; color: #94a3b8; font-weight: 700; text-transform: uppercase;">Number of Players</label>
          <div class="chat-rain-options-row" id="rainPlayersRow">
            <button type="button" class="chat-rain-chip" data-players="2">2 Players</button>
            <button type="button" class="chat-rain-chip selected" data-players="5">5 Players</button>
            <button type="button" class="chat-rain-chip" data-players="10">10 Players</button>
          </div>

          <button type="button" class="chat-rain-drop-submit" id="btnSubmitDropRain">Drop 5.00 ETB Rain 🌧️</button>
          <button type="button" class="chat-rain-cancel-btn" id="btnCancelRainModal">Cancel</button>
        </div>
      `;
      document.body.appendChild(this.rainModal);

      // 4. Toast Notification
      this.toast = document.createElement('div');
      this.toast.className = 'chat-toast';
      this.toast.id = 'chatToast';
      document.body.appendChild(this.toast);

      // Cache DOM references
      this.msgContainer = this.drawer.querySelector('#chatMessagesContainer');
      this.textInput = this.drawer.querySelector('#chatTextInput');
      this.charCounter = this.drawer.querySelector('#chatCharCounter');
      this.emojiStrip = this.drawer.querySelector('#chatEmojiStrip');
      this.onlineText = this.drawer.querySelector('#chatOnlineText');
      this.sendBtn = this.drawer.querySelector('#chatSendBtn');
    }

    bindEvents() {
      // Toggle button
      const setupToggleBtn = () => {
        const btn = document.querySelector(this.mountBtn);
        if (btn) {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggle();
          });
        }
      };
      setupToggleBtn();
      document.addEventListener('DOMContentLoaded', setupToggleBtn);

      // Close buttons
      const closeBtn = this.drawer.querySelector('#chatCloseBtn'); if (closeBtn) closeBtn.addEventListener('click', () => this.close());
      if (this.dimmer) this.dimmer.addEventListener('click', () => this.close());

      // Rules info button
      const infoBtn = this.drawer.querySelector('#chatInfoBtn'); if (infoBtn) infoBtn.addEventListener('click', () => {
        alert("💬 Game Chat Rules:\n1. Be friendly and respectful.\n2. No spam or advertising.\n3. Grab Free Rain drops when they appear!\nEnjoy the game!");
      });

      // Character counter
      if (this.textInput) this.textInput.addEventListener('input', () => {
        const remaining = 160 - this.textInput.value.length;
        this.charCounter.textContent = remaining;
      });

      // Send on Enter
      if (this.textInput) this.textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleSendMessage();
        }
      });

      // Send button click
      if (this.sendBtn) this.sendBtn.addEventListener('click', () => this.handleSendMessage());

      // Emoji strip toggle
      const emojiToggleBtn = this.drawer.querySelector('#chatEmojiToggleBtn'); if (emojiToggleBtn) emojiToggleBtn.addEventListener('click', () => {
        this.emojiStrip.classList.toggle('open');
      });

      // Emoji click
      if (this.emojiStrip) this.emojiStrip.addEventListener('click', (e) => {
        const btn = e.target.closest('.chat-emoji-btn');
        if (btn) {
          const emoji = btn.dataset.emoji;
          this.textInput.value += emoji;
          this.textInput.focus();
          const remaining = 160 - this.textInput.value.length;
          this.charCounter.textContent = remaining;
        }
      });

      // Rain trigger button
      const rainTriggerBtn = this.drawer.querySelector('#chatRainTriggerBtn'); if (rainTriggerBtn) rainTriggerBtn.addEventListener('click', () => {
        this.openRainModal();
      });

      // Rain modal cancel
      const cancelRainBtn = this.rainModal.querySelector('#btnCancelRainModal'); if (cancelRainBtn) cancelRainBtn.addEventListener('click', () => {
        this.closeRainModal();
      });
      if (this.rainModal) this.rainModal.addEventListener('click', (e) => {
        if (e.target === this.rainModal) this.closeRainModal();
      });

      // Rain modal options selection
      let selectedAmt = 5;
      let selectedPlayers = 5;

      const updateSubmitBtn = () => {
        const sub = this.rainModal.querySelector('#btnSubmitDropRain');
        if (sub) sub.textContent = `Drop ${selectedAmt}.00 ETB Rain 🌧️`;
      };

      this.rainModal.querySelectorAll('#rainAmountRow .chat-rain-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          this.rainModal.querySelectorAll('#rainAmountRow .chat-rain-chip').forEach(c => c.classList.remove('selected'));
          chip.classList.add('selected');
          selectedAmt = parseFloat(chip.dataset.amt);
          updateSubmitBtn();
        });
      });

      this.rainModal.querySelectorAll('#rainPlayersRow .chat-rain-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          this.rainModal.querySelectorAll('#rainPlayersRow .chat-rain-chip').forEach(c => c.classList.remove('selected'));
          chip.classList.add('selected');
          selectedPlayers = parseInt(chip.dataset.players, 10);
          updateSubmitBtn();
        });
      });

      // Submit Rain drop
      const submitRainBtn = this.rainModal.querySelector('#btnSubmitDropRain'); if (submitRainBtn) submitRainBtn.addEventListener('click', () => {
        const wallet = this.getWallet();
        if (wallet) {
          if (wallet.get() < selectedAmt) {
            alert(`Insufficient balance (${wallet.get().toFixed(2)} ETB). Please deposit ETB to drop rain.`);
            return;
          }
          wallet.modify(-selectedAmt);
        }
        this.closeRainModal();
        this.showToast(`🌧️ You dropped ${selectedAmt.toFixed(2)} ETB Rain!`);
        
        // Broadcast rain card
        this.addRainCard({
          id: 'rain_' + Date.now(),
          sender: 'You',
          totalAmount: selectedAmt,
          playersCount: selectedPlayers,
          eachAmount: Number((selectedAmt / selectedPlayers).toFixed(2)),
          isSelf: true
        });

        // Other simulated players thank the user
        setTimeout(() => {
          const thanks = ['Thank you so much! 🙏', 'Bless you! ❤️', 'Thanks for the rain! 🔥', 'Appreciate it boss! 💰'];
          const p = SIMULATED_PLAYERS[Math.floor(Math.random() * SIMULATED_PLAYERS.length)];
          this.addTextMessage({
            sender: p.name,
            avatar: p.avatar,
            text: thanks[Math.floor(Math.random() * thanks.length)],
            time: this.formatTime()
          });
        }, 2200);
      });

      // Claim rain clicks
      if (this.msgContainer) this.msgContainer.addEventListener('click', (e) => {
        // Heart Like click
        const likeBtn = e.target.closest('.chat-like-btn');
        if (likeBtn) {
          likeBtn.classList.toggle('liked');
          const isLiked = likeBtn.classList.contains('liked');
          likeBtn.innerHTML = isLiked ? '❤️ 1' : '🤍';
          return;
        }

        // Rain claim click
        const claimBtn = e.target.closest('.chat-rain-claim-btn');
        if (claimBtn && !claimBtn.classList.contains('claimed')) {
          const rainId = claimBtn.dataset.rainId;
          const amt = parseFloat(claimBtn.dataset.amount) || 2.0;
          this.claimRain(rainId, amt, claimBtn);
        }
      });
    }

    openRainModal() {
      this.rainModal.classList.add('open');
    }

    closeRainModal() {
      this.rainModal.classList.remove('open');
    }

    showToast(message) {
      this.toast.textContent = message;
      this.toast.classList.add('show');
      setTimeout(() => {
        this.toast.classList.remove('show');
      }, 2500);
    }

    toggle() {
      if (this.isOpen) {
        this.close();
      } else {
        this.open();
      }
    }

    open() {
      this.isOpen = true;
      this.drawer.classList.add('open');
      this.dimmer.classList.add('open');
      this.clearUnreadBadge();
      this.scrollToBottom();
      setTimeout(() => this.textInput.focus(), 300);
    }

    close() {
      this.isOpen = false;
      this.drawer.classList.remove('open');
      this.dimmer.classList.remove('open');
      this.emojiStrip.classList.remove('open');
      this.closeRainModal();
    }

    incrementUnreadBadge() {
      if (this.isOpen) return;
      this.unreadCount++;
      const badge = document.querySelector('#chatUnreadBadge');
      if (badge) {
        badge.textContent = this.unreadCount;
        badge.classList.remove('hidden');
      }
    }

    clearUnreadBadge() {
      this.unreadCount = 0;
      const badge = document.querySelector('#chatUnreadBadge');
      if (badge) {
        badge.textContent = '0';
        badge.classList.add('hidden');
      }
    }

    scrollToBottom() {
      requestAnimationFrame(() => {
        this.msgContainer.scrollTop = this.msgContainer.scrollHeight;
      });
    }

    claimRain(rainId, amount, btnEl) {
      if (this.claimedRainIds.has(rainId)) return;
      this.claimedRainIds.add(rainId);

      const wallet = this.getWallet();
      if (wallet) {
        wallet.modify(amount);
      }

      btnEl.classList.add('claimed');
      btnEl.textContent = `✔ Claimed (+${amount.toFixed(2)} ETB)`;
      this.showToast(`🎉 +${amount.toFixed(2)} ETB added to balance!`);

      // Sound fx
      this.playCoinSound();
    }

    playCoinSound() {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        [987.77, 1318.51].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.08);
          gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.08 + 0.15);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + i * 0.08);
          osc.stop(ctx.currentTime + i * 0.08 + 0.15);
        });
      } catch (e) {}
    }

    handleSendMessage() {
      const text = this.textInput.value.trim();
      if (!text) return;

      this.textInput.value = '';
      this.charCounter.textContent = '160';
      this.emojiStrip.classList.remove('open');

      // Add user message
      this.addTextMessage({
        sender: 'You',
        avatar: { icon: '😎', bg: '#4c1d95' },
        text: text,
        time: this.formatTime(),
        isOwn: true
      });

      // Periodically trigger a simulated response
      setTimeout(() => {
        const p = SIMULATED_PLAYERS[Math.floor(Math.random() * SIMULATED_PLAYERS.length)];
        const responses = ['Nice one!', 'Good luck!', 'Let\'s go!', '💰💰', 'Keep rolling! 🔥'];
        this.addTextMessage({
          sender: p.name,
          avatar: p.avatar,
          text: responses[Math.floor(Math.random() * responses.length)],
          time: this.formatTime()
        });
      }, 1800 + Math.random() * 2000);
    }

    addTextMessage({ sender, avatar, text, time, isOwn = false }) {
      if (!this.msgContainer) return;
      const row = document.createElement('div');
      row.className = `chat-msg-row ${isOwn ? 'own-msg' : ''}`;

      row.innerHTML = `
        <div class="chat-avatar" style="background:${avatar.bg}">${avatar.icon}</div>
        <div class="chat-msg-body">
          <div class="chat-msg-meta">
            <span class="chat-username">
              ${sender}
              ${!isOwn ? '<span class="chat-verified-badge" title="Verified Player">✔</span>' : ''}
            </span>
            <span class="chat-time">${time}</span>
          </div>
          <div class="chat-text-bubble">${this.escapeHTML(text)}</div>
        </div>
      `;

      this.msgContainer.appendChild(row);
      this.scrollToBottom();
      this.incrementUnreadBadge();
    }

    addWinCard({ sender, avatar, comment, cashedOut, winAmount, roundMult, betAmount, time }) {
      if (!this.msgContainer) return;
      const row = document.createElement('div');
      row.className = 'chat-msg-row';

      row.innerHTML = `
        <div class="chat-avatar" style="background:${avatar.bg}">${avatar.icon}</div>
        <div class="chat-msg-body">
          <div class="chat-msg-meta">
            <span class="chat-username">
              ${sender}
              <span class="chat-verified-badge" title="Verified Winner">✔</span>
            </span>
            <span class="chat-time">${time}</span>
          </div>
          ${comment ? `<div class="chat-comment">${this.escapeHTML(comment)}</div>` : ''}
          <div class="chat-win-card">
            <button type="button" class="chat-like-btn" title="Like">🤍</button>
            <div class="chat-win-grid">
              <div class="chat-win-col">
                <span class="chat-win-label">Cashed out:</span>
                <span class="chat-win-val-mult">${cashedOut.toFixed(2)}x</span>
              </div>
              <div class="chat-win-col right">
                <span class="chat-win-label green">Win ETB:</span>
                <span class="chat-win-val-etb">${winAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div class="chat-win-divider">
              <span class="chat-win-divider-icon">${this.dividerIcon}</span>
            </div>

            <div class="chat-win-grid">
              <div class="chat-win-col">
                <span class="chat-win-label muted">Round:</span>
                <span class="chat-win-val-sub">${roundMult.toFixed(2)}x</span>
              </div>
              <div class="chat-win-col right">
                <span class="chat-win-label muted">Bet ETB:</span>
                <span class="chat-win-val-sub">${betAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      `;

      this.msgContainer.appendChild(row);
      this.scrollToBottom();
      this.incrementUnreadBadge();
    }

    addRainCard({ id, sender, totalAmount, playersCount, eachAmount, isSelf = false }) {
      if (!this.msgContainer) return;
      const row = document.createElement('div');
      row.className = 'chat-msg-row';
      const avatar = isSelf ? { icon: '🌧️', bg: '#0284c7' } : { icon: '🌧️', bg: '#0369a1' };

      row.innerHTML = `
        <div class="chat-avatar" style="background:${avatar.bg}">${avatar.icon}</div>
        <div class="chat-msg-body">
          <div class="chat-msg-meta">
            <span class="chat-username" style="color: #38bdf8;">
              ${sender}
              <span class="chat-verified-badge">✔</span>
            </span>
            <span class="chat-time">${this.formatTime()}</span>
          </div>
          <div class="chat-rain-card">
            <div class="chat-rain-header">
              <span class="chat-rain-title">🌧️ Rain Dropped!</span>
            </div>
            <div class="chat-rain-subtitle">
              ${totalAmount.toFixed(2)} ETB distributed to ${playersCount} players (${eachAmount.toFixed(2)} ETB each)
            </div>
            <button type="button" class="chat-rain-claim-btn" data-rain-id="${id}" data-amount="${eachAmount}">
              Claim ${eachAmount.toFixed(2)} ETB
            </button>
          </div>
        </div>
      `;

      this.msgContainer.appendChild(row);
      this.scrollToBottom();
      this.incrementUnreadBadge();
    }

    shareWin({ multiplier, win, bet, round = null }) {
      const finalRound = round || (multiplier + Number((Math.random() * 2).toFixed(2)));
      this.addWinCard({
        sender: 'You',
        avatar: { icon: '😎', bg: '#4c1d95' },
        comment: 'I just cashed out! 🚀',
        cashedOut: multiplier,
        winAmount: win,
        roundMult: finalRound,
        betAmount: bet,
        time: this.formatTime()
      });
      this.showToast('🚀 Your win was shared in chat!');
    }

    seedInitialMessages() {
      // Exactly matches the user's uploaded Image 2 screenshot!
      this.addWinCard({
        sender: '+***6',
        avatar: AVATARS[0],
        comment: 'Congratulations 👏',
        cashedOut: 90.24,
        winAmount: 902.40,
        roundMult: 211.14,
        betAmount: 10.00,
        time: '20:51:03'
      });

      this.addWinCard({
        sender: '+***5',
        avatar: AVATARS[1],
        comment: 'Wow! 😮',
        cashedOut: 40.00,
        winAmount: 800.00,
        roundMult: 45.05,
        betAmount: 20.00,
        time: '21:05:33'
      });

      this.addTextMessage({
        sender: '+***1',
        avatar: AVATARS[2],
        text: 'Hi',
        time: '08:18:18'
      });

      // Sample Rain Card in history
      this.addRainCard({
        id: 'initial_rain_1',
        sender: '+***7',
        totalAmount: 10.00,
        playersCount: 5,
        eachAmount: 2.00
      });
    }

    startSimulatedActivity() {
      const triggerSimulated = () => {
        // Fluctuate online players
        this.onlineCount = Math.max(5, Math.min(24, this.onlineCount + (Math.random() > 0.5 ? 1 : -1)));
        if (this.onlineText) {
          this.onlineText.textContent = `Online: ${this.onlineCount}`;
        }

        const p = SIMULATED_PLAYERS[Math.floor(Math.random() * SIMULATED_PLAYERS.length)];
        const isWin = Math.random() < 0.45;

        if (isWin) {
          const mult = Number((1.5 + Math.random() * 8.5).toFixed(2));
          const bet = [10, 20, 50, 100][Math.floor(Math.random() * 4)];
          const win = Number((mult * bet).toFixed(2));
          this.addWinCard({
            sender: p.name,
            avatar: p.avatar,
            comment: CHAT_COMMENTS[Math.floor(Math.random() * CHAT_COMMENTS.length)],
            cashedOut: mult,
            winAmount: win,
            roundMult: Number((mult + Math.random() * 2).toFixed(2)),
            betAmount: bet,
            time: this.formatTime()
          });
        } else {
          this.addTextMessage({
            sender: p.name,
            avatar: p.avatar,
            text: CHAT_COMMENTS[Math.floor(Math.random() * CHAT_COMMENTS.length)],
            time: this.formatTime()
          });
        }

        const nextDelay = 15000 + Math.random() * 25000;
        setTimeout(triggerSimulated, nextDelay);
      };

      setTimeout(triggerSimulated, 10000);
    }

    startRainScheduler() {
      // Periodically drop automated rain every 2.5 minutes
      const scheduleNextRain = () => {
        const p = SIMULATED_PLAYERS[Math.floor(Math.random() * SIMULATED_PLAYERS.length)];
        const amt = [10, 15, 20, 25][Math.floor(Math.random() * 4)];
        const players = 5;
        this.addRainCard({
          id: 'rain_' + Date.now(),
          sender: p.name,
          totalAmount: amt,
          playersCount: players,
          eachAmount: Number((amt / players).toFixed(2))
        });

        const nextRainDelay = 120000 + Math.random() * 60000; // 2 to 3 mins
        setTimeout(scheduleNextRain, nextRainDelay);
      };

      setTimeout(scheduleNextRain, 45000);
    }

    escapeHTML(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
  }

  global.InGameChat = InGameChat;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = InGameChat;
  }
})(typeof window !== 'undefined' ? window : this);
