/**
 * Tower Dash / Tower Crash - UI App Controller
 * Binds DOM Elements, User Events & Multiplayer Live Feeds
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Game Engine
  const game = new window.TowerCrashGame('towerCanvas');
  game.updateBalanceUI();

  // 2. Main Action Buttons (BUILD / DROP & CASH OUT)
  const btnMain = document.getElementById('btnActionMain');
  if (btnMain) {
    btnMain.addEventListener('click', () => {
      if (game.state === 'IDLE') {
        game.startRound();
      } else if (game.state === 'PLAYING') {
        game.dropBlock();
      }
    });
  }

  const btnCollect = document.getElementById('btnActionCollect');
  if (btnCollect) {
    btnCollect.addEventListener('click', () => {
      if (game.state === 'PLAYING' || game.state === 'DROPPING') {
        game.cashOut();
      }
    });
  }

  // 3. Bet Stepper (+ / -) & Quick Chips
  const betDisplay = document.getElementById('betAmountDisplay');
  const minusBtn = document.getElementById('btnBetMinus');
  const plusBtn = document.getElementById('btnBetPlus');

  function setStake(amount) {
    const curBal = game.getBalance();
    const maxAllowed = curBal > 0 ? Math.max(1.0, curBal) : 1000.0;
    amount = Math.max(1.0, Math.min(maxAllowed, amount));
    game.betAmount = Math.round(amount);
    if (betDisplay) betDisplay.innerText = game.betAmount;
  }

  if (minusBtn) {
    minusBtn.addEventListener('click', () => {
      setStake(game.betAmount - 5.0);
    });
  }

  if (plusBtn) {
    plusBtn.addEventListener('click', () => {
      setStake(game.betAmount + 5.0);
    });
  }

  // Quick Chips (2X, 4X, ALL IN)
  document.querySelectorAll('.chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === '2x') {
        setStake(game.betAmount * 2);
      } else if (action === '4x') {
        setStake(game.betAmount * 4);
      } else if (action === 'allin') {
        setStake(game.getBalance());
      }
    });
  });

  // 4. Risk Selector (EASY / MEDIUM / HARD)
  document.querySelectorAll('.risk-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      if (game.state === 'PLAYING' || game.state === 'DROPPING') return;
      document.querySelectorAll('.risk-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      game.riskLevel = btn.dataset.risk;
      const multLadder = game.multipliers[game.riskLevel];
      const multEl = document.getElementById('hudMultiplierVal');
      if (multEl && game.currentFloor > 0) {
        multEl.innerText = `${multLadder[Math.min(game.currentFloor - 1, multLadder.length - 1)].toFixed(2)}x`;
      }
    });
  });

  // 5. Sound Mute Toggle
  const soundBtn = document.getElementById('btnSoundToggle');
  const iconOn = document.getElementById('iconSoundOn');
  const iconOff = document.getElementById('iconSoundOff');

  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      game.muted = !game.muted;
      if (game.audioEngine.bgMusic) {
        if (game.muted) game.audioEngine.bgMusic.pause();
        else game.audioEngine.bgMusic.play().catch(() => {});
      }
      if (iconOn && iconOff) {
        iconOn.style.display = game.muted ? 'none' : 'block';
        iconOff.style.display = game.muted ? 'block' : 'none';
      }
    });
  }

  // 6. Keyboard Controls (Space / Enter to Drop, C to Cashout)
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (game.state === 'IDLE') {
        game.startRound();
      } else if (game.state === 'PLAYING') {
        game.dropBlock();
      }
    } else if (e.code === 'KeyC') {
      if (game.state === 'PLAYING' || game.state === 'DROPPING') {
        game.cashOut();
      }
    }
  });

  // 7. Live Multiplayer Feed Ambiance
  const tableBody = document.getElementById('livePlayersTableBody');
  if (tableBody) {
    const sampleUsers = ['44***82', 'bb***19', '89***33', 'x7***01', '12***99', 'et***55', '71***44'];
    setInterval(() => {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const user = sampleUsers[Math.floor(Math.random() * sampleUsers.length)];
      const bet = (Math.random() * 40 + 10).toFixed(1);
      const isWin = Math.random() > 0.38;
      const mult = (Math.random() * 3.5 + 1.3).toFixed(2);
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
    }, 4200);
  }
});
