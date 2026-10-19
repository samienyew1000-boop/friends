/**
 * Chicken Crash - Standalone App Controller
 * Connects Canvas Game Engine to Interactive UI Controls
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Live Clock
  function updateClock() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const clockEl = document.getElementById('ingameClock');
    if (clockEl) clockEl.innerText = `${hh}:${mm}`;
  }
  updateClock();
  setInterval(updateClock, 1000);

  // 2. Initialize Game Engine
  const game = new window.ChickenCrashGame('chickenCanvas');
  game.updateBalanceUI();

  // 3. Action Buttons Binding (GO! & COLLECT)
  const goBtn = document.getElementById('btnActionGo');
  if (goBtn) {
    goBtn.addEventListener('click', () => {
      if (game.state === 'IDLE') {
        game.startRound();
      } else if (game.state === 'RUNNING') {
        game.advanceLane();
      }
    });
  }

  const collectBtn = document.getElementById('btnActionCollect');
  if (collectBtn) {
    collectBtn.addEventListener('click', () => {
      if (game.state === 'RUNNING') {
        game.cashOut();
      }
    });
  }

  const flipBtn = document.getElementById('btnFlipMode');
  if (flipBtn) {
    flipBtn.addEventListener('click', () => {
      game.toggleDisplayMode();
    });
  }

  // 4. Bet Stepper (+ / -)
  const betDisplay = document.getElementById('betAmountDisplay');
  const betInput = document.getElementById('betAmountInput');
  const minusBtn = document.getElementById('btnBetMinus');
  const plusBtn = document.getElementById('btnBetPlus');

  function setStake(amount) {
    const curBal = game.getBalance();
    const maxAllowed = curBal > 0 ? Math.max(1.0, curBal) : 1000.0;
    amount = Math.max(1.0, Math.min(maxAllowed, amount));
    game.setBetAmount(amount);
    if (betDisplay) betDisplay.innerText = Math.round(amount);
    if (betInput) betInput.value = amount.toFixed(2);
  }

  if (minusBtn) {
    minusBtn.addEventListener('click', () => {
      let cur = parseFloat(betInput?.value || 6.0);
      setStake(cur - 1.0);
    });
  }

  if (plusBtn) {
    plusBtn.addEventListener('click', () => {
      let cur = parseFloat(betInput?.value || 6.0);
      setStake(cur + 1.0);
    });
  }

  // Quick Chips (2X, 4X, ALL IN)
  document.querySelectorAll('.chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      let cur = parseFloat(betInput?.value || 6.0);
      if (action === '2x') {
        setStake(cur * 2);
      } else if (action === '4x') {
        setStake(cur * 4);
      } else if (action === 'allin') {
        setStake(game.getBalance());
      }
    });
  });

  // 5. Traffic Light Risk Level (EASY, MEDIUM, HARD)
  document.querySelectorAll('.traffic-lamp').forEach(btn => {
    btn.addEventListener('click', () => {
      if (game.state === 'RUNNING') return; // Locked during run
      document.querySelectorAll('.traffic-lamp').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      game.setRiskLevel(btn.dataset.risk);
    });
  });

  // 6. Sound Mute Toggle
  const soundBtn = document.getElementById('btnSoundToggle');
  const iconOn = document.getElementById('iconSoundOn');
  const iconOff = document.getElementById('iconSoundOff');
  let isMuted = false;

  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      isMuted = !isMuted;
      game.muted = isMuted;
      if (game.bgMusic) {
        if (isMuted) game.bgMusic.pause();
        else game.bgMusic.play().catch(() => {});
      }
      if (iconOn && iconOff) {
        iconOn.style.display = isMuted ? 'none' : 'block';
        iconOff.style.display = isMuted ? 'block' : 'none';
      }
    });
  }

  // 7. Keyboard Shortcuts (Space/Enter to GO, C to Collect)
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (game.state === 'IDLE') {
        game.startRound();
      } else if (game.state === 'RUNNING') {
        game.advanceLane();
      }
    } else if (e.code === 'KeyC') {
      if (game.state === 'RUNNING') {
        game.cashOut();
      }
    }
  });

  // 8. Simulated Live Multiplayer Bets Ambiance
  const tableBody = document.getElementById('livePlayersTableBody');
  if (tableBody) {
    const sampleUsers = ['98***21', 'ab***77', '55***19', 'xX***02', '31***88', '74***12', 'kk***99'];
    setInterval(() => {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const user = sampleUsers[Math.floor(Math.random() * sampleUsers.length)];
      const bet = (Math.random() * 50 + 5).toFixed(2);
      const isWin = Math.random() > 0.35;
      const mult = (Math.random() * 2.5 + 1.2).toFixed(2);
      const win = isWin ? (bet * mult).toFixed(2) + ' ETB' : '-';

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${user}</td>
        <td>${bet} ETB</td>
        <td class="${isWin ? 'win' : ''}">${win}</td>
        <td>${timeStr}</td>
      `;
      tableBody.insertBefore(row, tableBody.firstChild);
      if (tableBody.children.length > 15) {
        tableBody.removeChild(tableBody.lastChild);
      }
    }, 4500);
  }
});
