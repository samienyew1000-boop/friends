/**
 * Friendes Game - Unified Shared Balance Engine
 * Provides a single source of truth for the player's wallet across all games.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY_REAL = 'habesha_balance';
  const STORAGE_KEY_BONUS = 'habesha_bonus_balance';
  const STORAGE_KEY_DEMO = 'habesha_demo_balance';
  const MODE_KEY = 'habesha_wallet_mode';
  const USER_KEY = 'habesha_registered_user';
  const ADMIN_CONFIG_KEY = 'habesha_admin_config_v1';
  const DEFAULT_DEMO_BALANCE = 1000.0;
  const DEFAULT_REAL_BALANCE = 0.0;
  const DEFAULT_BONUS_BALANCE = 0.0;

  // Auto-detect mode from URL param (?mode=demo or ?mode=real).
  // IMPORTANT: If mode is not present in URL (e.g. Back button or Lobby link), preserve the existing user mode!
  (function initUrlMode() {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlMode = params.get('mode');
      if (urlMode === 'demo') {
        localStorage.setItem(MODE_KEY, 'demo');
      } else if (urlMode === 'real') {
        localStorage.setItem(MODE_KEY, 'real');
      }

      const qUid = params.get('uid');
      if (qUid) {
        localStorage.setItem('habesha_uid', qUid);
      }
      const urlBal = params.get('balance');
      const urlBonus = params.get('bonus_balance');
      const urlTs = parseInt(params.get('ts') || '0', 10);
      const localTs = parseInt(localStorage.getItem('habesha_balance_ts') || '0', 10);
      const hasLocalReal = localStorage.getItem(STORAGE_KEY_REAL) !== null && localStorage.getItem(STORAGE_KEY_REAL) !== '';

      // Only accept urlBal if local storage has no balance, or if urlTs is explicitly newer than local gameplay
      if (urlBal !== null && !isNaN(parseFloat(urlBal))) {
        if (!hasLocalReal || (urlTs > 0 && urlTs > localTs)) {
          const parsed = Math.max(0, round2(parseFloat(urlBal)));
          localStorage.setItem(STORAGE_KEY_REAL, parsed.toFixed(2));
          localStorage.setItem('habesha_balance_ts', String(urlTs > 0 ? urlTs : Date.now()));
          syncLegacyStorages(parsed);
        }
      }

      if (urlBonus !== null && !isNaN(parseFloat(urlBonus))) {
        if (!hasLocalReal || (urlTs > 0 && urlTs > localTs)) {
          const parsedBonus = Math.max(0, round2(parseFloat(urlBonus)));
          localStorage.setItem(STORAGE_KEY_BONUS, parsedBonus.toFixed(2));
        }
      }

      // Clean query params so subsequent refreshes or navigation don't re-read stale URL balance
      if (window.history && window.history.replaceState) {
        try {
          const cleanUrl = new URL(window.location.href);
          let cleaned = false;
          ['balance', 'bonus_balance', 'ts'].forEach((k) => {
            if (cleanUrl.searchParams.has(k)) {
              cleanUrl.searchParams.delete(k);
              cleaned = true;
            }
          });
          if (cleaned) {
            window.history.replaceState({}, document.title, cleanUrl.toString());
          }
        } catch (e) {}
      }
    } catch (e) {}
  })();

  function getMode() {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlMode = params.get('mode');
      if (urlMode === 'demo') return 'demo';
      if (urlMode === 'real') return 'real';
      const m = localStorage.getItem(MODE_KEY);
      return m === 'demo' ? 'demo' : 'real';
    } catch (e) {
      return 'real';
    }
  }

  function setMode(mode) {
    const safeMode = mode === 'demo' ? 'demo' : 'real';
    try {
      localStorage.setItem(MODE_KEY, safeMode);
    } catch (e) {}
    // If demo mode is selected and demo balance is below 10, renew to 1,000 ETB
    if (safeMode === 'demo') {
      const curDemo = getDemoBalance();
      if (curDemo < 10) {
        setDemoBalance(DEFAULT_DEMO_BALANCE);
      }
    }
    syncLegacyStorages(get());
    notifyAll(get());
    return safeMode;
  }

  function getDemoBalance() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_DEMO);
      if (raw === null || raw === '' || isNaN(parseFloat(raw))) {
        localStorage.setItem(STORAGE_KEY_DEMO, DEFAULT_DEMO_BALANCE.toFixed(2));
        return DEFAULT_DEMO_BALANCE;
      }
      return round2(parseFloat(raw));
    } catch (e) {
      return DEFAULT_DEMO_BALANCE;
    }
  }

  function setDemoBalance(amount) {
    const safe = Math.max(0, round2(amount));
    try {
      localStorage.setItem(STORAGE_KEY_DEMO, safe.toFixed(2));
    } catch (e) {}
    return safe;
  }

  function renewDemoBalance() {
    return setDemoBalance(DEFAULT_DEMO_BALANCE);
  }
  const DEFAULT_ADMIN_CONFIG = {
    globalMargin: 3.5,
    globalMarginEnabled: true,
    maintenanceMode: false,
    games: {},
    updatedAt: null,
  };

  // Helper to safely round to 2 decimals
  function round2(val) {
    const num = parseFloat(val);
    return isNaN(num) ? 0.0 : Math.round(num * 100) / 100;
  }

  function getRealBalance() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_REAL);
      if (raw === null || raw === '' || isNaN(parseFloat(raw)) || parseFloat(raw) === 50000 || parseFloat(raw) === 10000 || parseFloat(raw) === 5000) {
        localStorage.setItem(STORAGE_KEY_REAL, DEFAULT_REAL_BALANCE.toFixed(2));
        return DEFAULT_REAL_BALANCE;
      }
      return round2(parseFloat(raw));
    } catch (e) {
      return DEFAULT_REAL_BALANCE;
    }
  }

  function setRealBalance(amount) {
    const safe = Math.max(0, round2(amount));
    try {
      localStorage.setItem(STORAGE_KEY_REAL, safe.toFixed(2));
      if (window.Telegram?.WebApp?.CloudStorage) {
        window.Telegram.WebApp.CloudStorage.setItem('habesha_balance', safe.toFixed(2), () => {});
      }
    } catch (e) {}
    syncLegacyStorages(get());
    notifyAll(get());
    return safe;
  }

  function getBonusBalance() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_BONUS);
      if (raw === null || raw === '' || isNaN(parseFloat(raw))) {
        return DEFAULT_BONUS_BALANCE;
      }
      return round2(parseFloat(raw));
    } catch (e) {
      return DEFAULT_BONUS_BALANCE;
    }
  }

  function setBonusBalance(amount) {
    const safe = Math.max(0, round2(amount));
    try {
      localStorage.setItem(STORAGE_KEY_BONUS, safe.toFixed(2));
      if (window.Telegram?.WebApp?.CloudStorage) {
        window.Telegram.WebApp.CloudStorage.setItem('habesha_bonus_balance', safe.toFixed(2), () => {});
      }
    } catch (e) {}
    syncLegacyStorages(get());
    notifyAll(get());
    return safe;
  }

  // Get current shared balance:
  // In demo mode: returns demo balance
  // In real mode: returns total playable balance (Real Balance + Bonus Balance)
  function get() {
    const mode = getMode();
    if (mode === 'demo') {
      let demoBal = getDemoBalance();
      // Automatic renewable: if demo balance drops below 5, automatically renew to 1,000 Birr
      if (demoBal < 5) {
        demoBal = renewDemoBalance();
      }
      return demoBal;
    }

    const realBal = getRealBalance();
    const bonusBal = getBonusBalance();
    return round2(realBal + bonusBal);
  }

  function notifyAll(safeAmount) {
    try {
      window.dispatchEvent(
        new CustomEvent('habesha_balance_updated', {
          detail: {
            balance: safeAmount,
            realBalance: getRealBalance(),
            bonusBalance: getBonusBalance(),
            mode: getMode()
          }
        })
      );
    } catch (e) {}

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          {
            type: 'HABESHA_BALANCE_UPDATE',
            balance: safeAmount,
            realBalance: getRealBalance(),
            bonusBalance: getBonusBalance(),
            mode: getMode()
          },
          '*'
        );
      }
    } catch (e) {}
  }

  // Set shared balance and broadcast
  function set(amount) {
    const mode = getMode();
    const safeAmount = Math.max(0, round2(amount));

    if (mode === 'demo') {
      setDemoBalance(safeAmount);
      syncLegacyStorages(safeAmount);
      notifyAll(safeAmount);
      return safeAmount;
    }

    const currentTotal = get();
    const diff = round2(safeAmount - currentTotal);
    if (diff !== 0) {
      return modify(diff);
    }
    return safeAmount;
  }

  // Modify balance by delta (+ for wins, - for bets)
  // RULE:
  // - When placing a bet (delta < 0): deduct from Bonus Balance first, then Real Balance!
  // - When winning (delta > 0): ALL winnings/profits are credited to REAL BALANCE!
  //   (Bonus balance is play-only money; winnings convert to withdrawable Real Balance).
  function detectCurrentGameName() {
    try {
      const p = (window.location.pathname || '').toLowerCase();
      if (p.includes('aviator')) return 'Aviator';
      if (p.includes('jet-x') || p.includes('jetx')) return 'JetX';
      if (p.includes('mines')) return 'Mines';
      if (p.includes('multihot5') || p.includes('multi_hot_5')) return 'Multi Hot 5';
      if (p.includes('fast keno') || p.includes('fast-keno') || p.includes('fast_keno')) return 'Fast Keno';
      if (p.includes('chicken road') || p.includes('chicken-road') || p.includes('chicken_road')) return 'Chicken Road';
      if (p.includes('chicken-crash') || p.includes('chicken_crash')) return 'Chicken Crash';
      if (p.includes('tower-trash') || p.includes('tower_trash') || p.includes('tower-dash')) return 'Tower Dash';
      if (p.includes('fish')) return 'Fish Road';
      if (p.includes('bingo star') || p.includes('bingo-star')) return 'Bingo Star';
      if (p.includes('bingo')) return 'Dallol Bingo';
      if (p.includes('infinity')) return 'Infinity';
      const title = (document.title || '').toLowerCase();
      if (title.includes('aviator')) return 'Aviator';
      if (title.includes('jetx')) return 'JetX';
      if (title.includes('mines')) return 'Mines';
      if (title.includes('bingo star')) return 'Bingo Star';
      if (title.includes('bingo')) return 'Dallol Bingo';
      if (title.includes('chicken')) return 'Chicken Road';
      if (title.includes('tower')) return 'Tower Dash';
      if (title.includes('keno')) return 'Fast Keno';
      if (title.includes('slot') || title.includes('hot 5')) return 'Multi Hot 5';
    } catch(e) {}
    return 'Casino Game';
  }

  const SHARED_TX_KEY = 'habesha_shared_transactions_v1';
  let betSyncDebounceTimer = null;
  let pendingBetBatch = { stakes: 0, wins: 0, count: 0, items: [] };

  function recordBetTransaction(gameName, stake, win) {
    try {
      const u = getUser();
      const uid = u?.id || new URLSearchParams(window.location.search).get('uid') || localStorage.getItem('habesha_uid') || 'Guest';
      const name = u?.name || u?.first_name || (localStorage.getItem('habesha_registered_user') ? JSON.parse(localStorage.getItem('habesha_registered_user')).first_name : '') || `Player ${String(uid).slice(-4)}`;
      const username = u?.username ? `@${u.username}` : '';
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      let localTxs = [];
      try {
        localTxs = JSON.parse(localStorage.getItem(SHARED_TX_KEY) || '[]');
        if (!Array.isArray(localTxs)) localTxs = [];
      } catch(e) { localTxs = []; }

      const ts = Date.now();
      if (stake > 0) {
        const txStake = {
          id: `TX-${Math.floor(10000 + Math.random() * 90000)}`,
          playerId: `TG-${uid}`,
          player: name,
          username: username,
          type: 'stake',
          method: gameName,
          amount: round2(stake),
          status: 'completed',
          time: `Today, ${nowStr}`,
          timestamp: ts
        };
        localTxs.unshift(txStake);
        pendingBetBatch.stakes = round2(pendingBetBatch.stakes + stake);
        pendingBetBatch.count += 1;
        pendingBetBatch.items.unshift(txStake);
      }

      if (win > 0) {
        const txWin = {
          id: `TX-${Math.floor(10000 + Math.random() * 90000)}`,
          playerId: `TG-${uid}`,
          player: name,
          username: username,
          type: 'win',
          method: gameName,
          amount: round2(win),
          status: 'completed',
          time: `Today, ${nowStr}`,
          timestamp: ts + 1
        };
        localTxs.unshift(txWin);
        pendingBetBatch.wins = round2(pendingBetBatch.wins + win);
        pendingBetBatch.items.unshift(txWin);
      }

      localStorage.setItem(SHARED_TX_KEY, JSON.stringify(localTxs.slice(0, 200)));
      scheduleBetCloudSync();
    } catch(e) {}
  }

  function scheduleBetCloudSync() {
    if (betSyncDebounceTimer) clearTimeout(betSyncDebounceTimer);
    betSyncDebounceTimer = setTimeout(() => {
      if (pendingBetBatch.count === 0 && pendingBetBatch.wins === 0) return;
      const batchToSync = { ...pendingBetBatch, items: [...pendingBetBatch.items] };
      pendingBetBatch = { stakes: 0, wins: 0, count: 0, items: [] };

      fetch('https://africa-bingo.ethiodeploy.com/api/settings', {
        headers: { 'Accept': 'application/json' }
      })
        .then(r => r.json())
        .then(settings => {
          const ledger = settings.friends_betting_ledger || {
            gross_volume: 0,
            total_payouts: 0,
            house_profit: 0,
            total_bets: 0,
            recent_bets: []
          };
          const newVol = round2((Number(ledger.gross_volume) || 0) + batchToSync.stakes);
          const newPayouts = round2((Number(ledger.total_payouts) || 0) + batchToSync.wins);
          const newProfit = round2(Math.max(0, newVol - newPayouts));
          const newCount = (Number(ledger.total_bets) || 0) + batchToSync.count;
          const mergedRecent = [...batchToSync.items, ...(Array.isArray(ledger.recent_bets) ? ledger.recent_bets : [])].slice(0, 150);

          return fetch('https://africa-bingo.ethiodeploy.com/api/admin/settings/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              friends_betting_ledger: {
                gross_volume: newVol,
                total_payouts: newPayouts,
                house_profit: newProfit,
                total_bets: newCount,
                recent_bets: mergedRecent,
                updatedAt: new Date().toISOString()
              }
            })
          });
        })
        .catch(() => {});
    }, 1200);
  }

  // Cloud sync for Admin Configuration (authoritative house control across all games)
  function syncAdminConfigFromCloud() {
    try {
      fetch('https://africa-bingo.ethiodeploy.com/api/settings', {
        headers: { 'Accept': 'application/json' }
      })
      .then(r => r.json())
      .then(data => {
        if (data && data.friends_admin_config && typeof data.friends_admin_config === 'object') {
          const cfg = data.friends_admin_config;
          localStorage.setItem(ADMIN_CONFIG_KEY, JSON.stringify(cfg));
          window.dispatchEvent(new CustomEvent('habesha_admin_config_updated', { detail: cfg }));
        }
      })
      .catch(() => {});
    } catch (e) {}
  }
  if (typeof window !== 'undefined') {
    syncAdminConfigFromCloud();
    setInterval(syncAdminConfigFromCloud, 8000);
  }

  function modify(delta, arg2, arg3) {
    const numDelta = parseFloat(delta);
    if (isNaN(numDelta) || numDelta === 0) return get();

    const mode = getMode();
    if (mode === 'demo') {
      const curDemo = getDemoBalance();
      const newDemo = Math.max(0, round2(curDemo + numDelta));
      setDemoBalance(newDemo);
      syncLegacyStorages(newDemo);
      notifyAll(newDemo);
      return newDemo;
    }

    let realBal = getRealBalance();
    let bonusBal = getBonusBalance();

    const gameName = (typeof arg2 === 'string' && arg2 !== 'stake' && arg2 !== 'win') ? arg2 :
                     (typeof arg3 === 'string' && arg3 !== 'stake' && arg3 !== 'win') ? arg3 : detectCurrentGameName();

    let lastBonusRatio = parseFloat(localStorage.getItem('habesha_bet_bonus_ratio') || '0');

    if (numDelta < 0) {
      // Player is placing a bet (spending money)
      const betAmt = Math.abs(numDelta);
      let takeBonus = 0;
      let takeReal = 0;
      if (bonusBal > 0) {
        takeBonus = Math.min(bonusBal, betAmt);
        bonusBal = round2(bonusBal - takeBonus);
        takeReal = round2(betAmt - takeBonus);
        realBal = Math.max(0, round2(realBal - takeReal));
      } else {
        takeReal = betAmt;
        realBal = Math.max(0, round2(realBal - betAmt));
      }
      // Track bonus ratio so bets funded by bonus return winnings to bonus balance!
      lastBonusRatio = betAmt > 0 ? round2(takeBonus / betAmt) : 0;
      try { localStorage.setItem('habesha_bet_bonus_ratio', String(lastBonusRatio)); } catch (e) {}
      recordBetTransaction(gameName, betAmt, 0);
    } else {
      // Player won! Credited proportionally to funding source (bonus wagers stay in bonus)
      const winAmt = numDelta;
      const bonusWin = round2(winAmt * lastBonusRatio);
      const realWin = round2(winAmt - bonusWin);

      bonusBal = round2(bonusBal + bonusWin);
      realBal = round2(realBal + realWin);
      recordBetTransaction(gameName, 0, numDelta);
    }

    try {
      localStorage.setItem(STORAGE_KEY_REAL, realBal.toFixed(2));
      localStorage.setItem(STORAGE_KEY_BONUS, bonusBal.toFixed(2));
      localStorage.setItem('habesha_balance_ts', String(Date.now()));
      if (window.Telegram?.WebApp?.CloudStorage) {
        window.Telegram.WebApp.CloudStorage.setItem('habesha_balance', realBal.toFixed(2), () => {});
        window.Telegram.WebApp.CloudStorage.setItem('habesha_bonus_balance', bonusBal.toFixed(2), () => {});
      }
    } catch (e) {
      console.warn('HabeshaWallet modify storage error:', e);
    }

    const newTotal = round2(realBal + bonusBal);
    syncLegacyStorages(newTotal);
    notifyAll(newTotal);
    syncLiveBalanceToCloud();
    return newTotal;
  }

  let syncDebounceTimer = null;
  function syncLiveBalanceToCloud() {
    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
      try {
        const u = getUser();
        const uid = u?.id || new URLSearchParams(window.location.search).get('uid') || localStorage.getItem('habesha_uid');
        if (uid && /^\d+$/.test(String(uid))) {
          const realBal = getRealBalance();
          const bonusBal = getBonusBalance();
          fetch("https://africa-bingo.ethiodeploy.com/api/admin/user/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: String(uid),
              balance: realBal,
              bonus_balance: bonusBal
            })
          }).catch(() => {});
        }
      } catch (e) {}
    }, 200);
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        syncLiveBalanceToCloud();
      } else {
        syncAdminConfigFromCloud();
      }
    });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', syncLiveBalanceToCloud);
    window.addEventListener('beforeunload', syncLiveBalanceToCloud);
    window.addEventListener('focus', syncAdminConfigFromCloud);
  }

  function exitAndSave() {
    const realBal = getRealBalance();
    const bonusBal = getBonusBalance();
    syncLiveBalanceToCloud();
    let sent = false;
    try {
      if (window.Telegram?.WebApp?.sendData) {
        window.Telegram.WebApp.sendData(JSON.stringify({
          action: 'sync_balance',
          balance: realBal,
          bonus_balance: bonusBal
        }));
        sent = true;
      }
    } catch (e) {
      sent = false;
    }

    if (!sent) {
      try {
        if (window.Telegram?.WebApp?.openTelegramLink) {
          window.Telegram.WebApp.openTelegramLink('https://t.me/Friends64_BOT?start=sync_' + realBal.toFixed(2) + '_' + bonusBal.toFixed(2));
          return;
        }
      } catch (e) {}
      try {
        if (window.Telegram?.WebApp?.close) {
          window.Telegram.WebApp.close();
        }
      } catch (e) {}
    }
  }

  // Hook Telegram's native BackButton across all pages
  if (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) {
    try {
      if (window.Telegram.WebApp.BackButton) {
        window.Telegram.WebApp.BackButton.show();
        window.Telegram.WebApp.BackButton.onClick(function () {
          const path = (window.location.pathname || '').toLowerCase();
          const inGame = path.includes('/game/');
          if (inGame) {
            window.location.href = '../../index.html';
          } else {
            exitAndSave();
          }
        });
      }
    } catch (e) {}
  }

  // Check if player has at least specified amount
  function has(amount) {
    return get() >= round2(amount);
  }

  // Sync with specific legacy keys used by individual games
  function syncLegacyStorages(val) {
    try {
      // 1. Aviator (aviator_offline_users)
      const avRaw = localStorage.getItem('aviator_offline_users');
      if (avRaw) {
        try {
          const avUsers = JSON.parse(avRaw);
          if (Array.isArray(avUsers) && avUsers.length > 0) {
            avUsers.forEach((u) => {
              u.balance = val;
            });
            localStorage.setItem('aviator_offline_users', JSON.stringify(avUsers));
          }
        } catch (err) {}
      } else {
        const defaultAvUser = [{
          id: 'offline-admin',
          username: 'admin',
          displayName: 'Player',
          role: 'admin',
          balance: val,
          password: 'admin',
          createdAt: new Date().toISOString()
        }];
        localStorage.setItem('aviator_offline_users', JSON.stringify(defaultAvUser));
      }

      // 2. Fast Keno (fast_keno_v1)
      const kenoRaw = localStorage.getItem('fast_keno_v1');
      if (kenoRaw) {
        try {
          const kenoData = JSON.parse(kenoRaw);
          kenoData.balance = val;
          localStorage.setItem('fast_keno_v1', JSON.stringify(kenoData));
        } catch (err) {}
      } else {
        localStorage.setItem('fast_keno_v1', JSON.stringify({ balance: val }));
      }

      // 3. Fish (fish-balance)
      localStorage.setItem('fish-balance', String(val));

      // 4. Infinity (infinity_demo_v1)
      const infRaw = localStorage.getItem('infinity_demo_v1');
      if (infRaw) {
        try {
          const infData = JSON.parse(infRaw);
          infData.balance = val;
          localStorage.setItem('infinity_demo_v1', JSON.stringify(infData));
        } catch (err) {}
      } else {
        localStorage.setItem('infinity_demo_v1', JSON.stringify({ balance: val }));
      }

      // 5. Bingo Star (bingo-star-balance)
      localStorage.setItem('bingo-star-balance', String(val));

      // 6. Lucky Bingo (lucky-bingo-balance)
      localStorage.setItem('lucky-bingo-balance', String(val));

      // 7. Multi Hot 5 (multi_hot_balance)
      localStorage.setItem('multi_hot_balance', String(val));

      // 8. Tower Dash (tower_balance)
      localStorage.setItem('tower_balance', String(val));
    } catch (e) {
      console.warn('Error syncing legacy keys:', e);
    }
  }

  // Subscribe to external balance changes
  function subscribe(callback) {
    if (typeof callback !== 'function') return;

    // Listen to storage event (changes from another tab or window)
    window.addEventListener('storage', function (e) {
      if ((e.key === STORAGE_KEY_REAL || e.key === STORAGE_KEY_DEMO || e.key === 'lucky-bingo-balance' || e.key === 'fast_keno_v1' || e.key === 'infinity_demo_v1') && e.newValue !== null) {
        callback(get());
      }
    });

    // Listen to local custom event
    window.addEventListener('habesha_balance_updated', function (e) {
      if (e.detail && typeof e.detail.balance === 'number') {
        callback(e.detail.balance);
      }
    });

    // Listen to postMessage from iframes
    window.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'HABESHA_BALANCE_UPDATE') {
        callback(round2(e.data.balance));
      }
    });
  }

  // Read the shared operator configuration. This is intentionally a policy/config
  // layer only; it does not alter random outcomes or settle player bets.
  function getAdminConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(ADMIN_CONFIG_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return { ...DEFAULT_ADMIN_CONFIG, games: {} };
      return {
        ...DEFAULT_ADMIN_CONFIG,
        ...saved,
        globalMargin: Math.min(100, Math.max(0, Number(saved.globalMargin) || 0)),
        games: saved.games && typeof saved.games === 'object' ? saved.games : {},
      };
    } catch (e) {
      return { ...DEFAULT_ADMIN_CONFIG, games: {} };
    }
  }

  function getGameMargin(gameId, fallback = 3.5) {
    const config = getAdminConfig();
    if (!config) return fallback;
    const raw = String(gameId || '').toLowerCase().trim();
    const cleanId = raw.replace(/[\s-]/g, '_');
    const games = config.games || {};
    const gameObj = games[cleanId] || games[raw] || games[raw.replace(/_/g, '-')] || games[raw.replace(/_/g, '')];
    if (gameObj && gameObj.margin !== undefined && gameObj.margin !== null && !isNaN(parseFloat(gameObj.margin))) {
      return Math.min(100, Math.max(0, parseFloat(gameObj.margin)));
    }
    if (config.globalMarginEnabled !== false && config.globalMargin !== undefined && !isNaN(parseFloat(config.globalMargin))) {
      return Math.min(100, Math.max(0, parseFloat(config.globalMargin)));
    }
    return fallback;
  }

  function isGameEnabled(gameId) {
    const config = getAdminConfig();
    if (config.maintenanceMode === true) return false;
    const raw = String(gameId || '').toLowerCase().trim();
    const cleanId = raw.replace(/[\s-]/g, '_');
    const games = config.games || {};
    const gameObj = games[cleanId] || games[raw] || games[raw.replace(/_/g, '-')] || games[raw.replace(/_/g, '')];
    if (gameObj && gameObj.enabled !== undefined) {
      return Boolean(gameObj.enabled);
    }
    return true;
  }

  function subscribeAdminConfig(callback) {
    if (typeof callback !== 'function') return;
    const notify = () => callback(getAdminConfig());
    window.addEventListener('storage', (event) => {
      if (event.key === ADMIN_CONFIG_KEY) notify();
    });
    window.addEventListener('habesha_admin_config_updated', notify);
  }

  // Format currency display
  function format(amount) {
    const val = amount !== undefined ? amount : get();
    return Number(val).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // Telegram Registration Helpers
  function getUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (raw) {
        const u = JSON.parse(raw);
        try {
          const params = new URLSearchParams(window.location.search);
          const p = params.get('phone');
          if (p && (!u.phone || u.phone !== p)) {
            u.phone = p;
            localStorage.setItem(USER_KEY, JSON.stringify(u));
          }
        } catch (err) {}
        return u;
      }
    } catch (e) {}

    let qPhone = '';
    let qUid = '';
    let qName = '';
    try {
      const params = new URLSearchParams(window.location.search);
      qPhone = params.get('phone') || '';
      qUid = params.get('uid') || '';
      qName = params.get('name') || '';
    } catch (err) {}

    // If inside Telegram WebApp or URL has phone/uid
    if (typeof window !== 'undefined' && (window.Telegram?.WebApp?.initDataUnsafe?.user || qPhone || qUid)) {
      const tg = window.Telegram?.WebApp?.initDataUnsafe?.user || {};
      const u = {
        id: tg.id || qUid || ('tg_' + Math.floor(100000000 + Math.random() * 900000000)),
        username: tg.username || '',
        name: qName || (tg.first_name ? tg.first_name + (tg.last_name ? ' ' + tg.last_name : '') : 'Friendes Game Player'),
        phone: qPhone,
        isTelegram: true,
        isRegistered: true
      };
      try {
        localStorage.setItem(USER_KEY, JSON.stringify(u));
      } catch (e) {}
      return u;
    }
    return null;
  }

  function isRegistered() {
    return getUser() !== null;
  }

  function registerTelegramUser(data) {
    const user = {
      id: data.id || ('tg_' + Math.floor(100000000 + Math.random() * 900000000)),
      username: data.username ? data.username.replace('@', '') : '',
      name: data.name || data.username || 'Friendes Game Player',
      phone: data.phone || '',
      registeredAt: new Date().toISOString(),
      isRegistered: true
    };
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (e) {}
    return user;
  }

  // Expose API
  const HabeshaWallet = {
    KEY: STORAGE_KEY_REAL,
    STORAGE_KEY_REAL: STORAGE_KEY_REAL,
    STORAGE_KEY_BONUS: STORAGE_KEY_BONUS,
    STORAGE_KEY_DEMO: STORAGE_KEY_DEMO,
    ADMIN_CONFIG_KEY: ADMIN_CONFIG_KEY,
    get: get,
    set: set,
    getRealBalance: getRealBalance,
    setRealBalance: setRealBalance,
    getBonusBalance: getBonusBalance,
    setBonusBalance: setBonusBalance,
    getMode: getMode,
    setMode: setMode,
    renewDemoBalance: renewDemoBalance,
    getUser: getUser,
    isRegistered: isRegistered,
    registerTelegramUser: registerTelegramUser,
    modify: modify,
    has: has,
    format: format,
    subscribe: subscribe,
    getAdminConfig: getAdminConfig,
    isGameEnabled: isGameEnabled,
    getGameMargin: getGameMargin,
    subscribeAdminConfig: subscribeAdminConfig,
    syncLegacyStorages: syncLegacyStorages,
    exitAndSave: exitAndSave,
    recordBet: recordBetTransaction,
    syncAdminConfigFromCloud: syncAdminConfigFromCloud
  };

  global.HabeshaWallet = HabeshaWallet;
  global.FriendesWallet = HabeshaWallet;

  // Initialize and synchronize immediately
  const initialBal = get();
  syncLegacyStorages(initialBal);

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
