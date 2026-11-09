/**
 * Friendes Game - Unified Shared Balance Engine
 * Provides a single source of truth for the player's wallet across all games.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY_REAL = 'habesha_balance';
  const STORAGE_KEY_DEMO = 'habesha_demo_balance';
  const MODE_KEY = 'habesha_wallet_mode';
  const USER_KEY = 'habesha_registered_user';
  const ADMIN_CONFIG_KEY = 'habesha_admin_config_v1';
  const DEFAULT_DEMO_BALANCE = 1000.0;
  const DEFAULT_REAL_BALANCE = 0.0;

  // Auto-detect mode from URL param (?mode=demo or ?mode=real)
  (function initUrlMode() {
    try {
      const path = (window.location.pathname || '').toLowerCase();
      const isRealOnlyGame = path.includes('jet-x') || path.includes('multihot5');
      if (isRealOnlyGame) {
        if (!isRegistered()) {
          // If trying to access JetX or Multi Hot 5 without login, block and redirect
          alert('እባክዎ ለመጫወት መጀመሪያ ይግቡ (Please log in to play)');
          window.location.replace('/frontend/#login');
          return;
        }
        // Once logged in, force real mode only!
        localStorage.setItem(MODE_KEY, 'real');
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const urlMode = params.get('mode');
      if (urlMode === 'real') {
        if (!isRegistered()) {
          // If trying to play real mode without being logged in, switch to demo mode!
          localStorage.setItem(MODE_KEY, 'demo');
          return;
        }
        localStorage.setItem(MODE_KEY, 'real');
      } else if (urlMode === 'demo') {
        localStorage.setItem(MODE_KEY, 'demo');
      }
    } catch (e) {}
  })();

  function getMode() {
    try {
      const path = (typeof window !== 'undefined' && window.location.pathname ? window.location.pathname : '').toLowerCase();
      if (path.includes('jet-x') || path.includes('multihot5')) {
        return 'real';
      }
      const m = localStorage.getItem(MODE_KEY);
      if (m === 'real' && !isRegistered()) {
        return 'demo';
      }
      return m === 'demo' ? 'demo' : 'real';
    } catch (e) {
      return isRegistered() ? 'real' : 'demo';
    }
  }

  function setMode(mode) {
    let safeMode = mode === 'demo' ? 'demo' : 'real';
    if (safeMode === 'real' && !isRegistered()) {
      console.warn('Real mode requires login. Defaulting to demo mode.');
      safeMode = 'demo';
    }
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
    globalMargin: 10.0,
    globalRtp: 90.0,
    globalMarginEnabled: true,
    maintenanceMode: false,
    maxPayoutPerRound: 50000,
    autoProfitProtection: true,
    games: {
      aviator: { id: "aviator", name: "Aviator", enabled: true, targetMargin: 10.0, rtp: 90.0, earlyCrashRate: 15.0, maxMultiplier: 100.0, minBet: 1, maxBet: 5000, maxWin: 25000 },
      chicken_road: { id: "chicken_road", name: "Chicken Road", enabled: true, targetMargin: 12.0, rtp: 88.0, crashSpeedFactor: 1.2, maxMultiplier: 50.0, minBet: 1, maxBet: 2000, maxWin: 20000 },
      fast_keno: { id: "fast_keno", name: "Fast Keno", enabled: true, targetMargin: 12.0, rtp: 88.0, maxMultiplier: 1000.0, minBet: 5, maxBet: 1000, maxWin: 30000 },
      bingo: { id: "bingo", name: "Lucky Bingo", enabled: true, targetMargin: 15.0, rtp: 85.0, minBet: 5, maxBet: 500, maxWin: 50000 },
      bingo_star: { id: "bingo_star", name: "Bingo Star", enabled: true, targetMargin: 12.0, rtp: 88.0, bonusStarFrequency: "medium", minBet: 2, maxBet: 1000, maxWin: 25000 },
      fish: { id: "fish", name: "Fish Hunter", enabled: true, targetMargin: 10.0, rtp: 90.0, goldenRingChance: 0.05, minBet: 1, maxBet: 6000, maxWin: 30000 },
      infinity: { id: "infinity", name: "Infinity Coeff", enabled: true, targetMargin: 10.0, rtp: 90.0, minBet: 1, maxBet: 5000, maxWin: 20000 },
      jet_x: { id: "jet_x", name: "JetX", category: "Crash", icon: "🚀", enabled: true, targetMargin: 10.0, rtp: 90.0, earlyCrashRate: 15.0, maxMultiplier: 250.0, minBet: 1, maxBet: 5000, maxWin: 25000 },
      multihot5: { id: "multihot5", name: "Multi Hot 5", category: "Classic Slot", icon: "🍒", enabled: true, targetMargin: 10.0, rtp: 90.0, maxMultiplier: 1000.0, minBet: 1, maxBet: 2000, maxWin: 50000 }
    },
    updatedAt: null,
  };

  // Helper to safely round to 2 decimals
  function round2(val) {
    const num = parseFloat(val);
    return isNaN(num) ? 0.0 : Math.round(num * 100) / 100;
  }

  // Get current shared balance (Demo vs Real)
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

    try {
      const raw = localStorage.getItem(STORAGE_KEY_REAL);
      if (raw === null || raw === '' || isNaN(parseFloat(raw))) {
        localStorage.setItem(STORAGE_KEY_REAL, DEFAULT_REAL_BALANCE.toFixed(2));
        return DEFAULT_REAL_BALANCE;
      }
      return round2(parseFloat(raw));
    } catch (e) {
      return DEFAULT_REAL_BALANCE;
    }
  }

  function notifyAll(safeAmount) {
    try {
      window.dispatchEvent(
        new CustomEvent('habesha_balance_updated', {
          detail: { balance: safeAmount, mode: getMode() }
        })
      );
    } catch (e) {}

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          {
            type: 'HABESHA_BALANCE_UPDATE',
            balance: safeAmount,
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

    try {
      if (mode === 'demo') {
        setDemoBalance(safeAmount);
      } else {
        localStorage.setItem(STORAGE_KEY_REAL, safeAmount.toFixed(2));
      }
    } catch (e) {
      console.warn('HabeshaWallet set error:', e);
    }

    // Sync legacy game storage keys for 100% backward compatibility
    syncLegacyStorages(safeAmount);
    notifyAll(safeAmount);

    return safeAmount;
  }

  // Modify balance by delta (+ for wins, - for bets)
  function modify(delta) {
    const current = get();
    return set(current + parseFloat(delta));
  }

  // Credit balance
  function add(amount, desc) {
    const delta = Math.abs(parseFloat(amount) || 0);
    return modify(delta);
  }

  // Debit balance
  function deduct(amount, desc) {
    const delta = Math.abs(parseFloat(amount) || 0);
    return modify(-delta);
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
      }

      // 5. Bingo Star (bingo-star-balance)
      localStorage.setItem('bingo-star-balance', String(val));

      // 6. Lucky Bingo (lucky-bingo-balance)
      localStorage.setItem('lucky-bingo-balance', String(val));

      // 7. JetX (jetx_local_balance)
      localStorage.setItem('jetx_local_balance', String(val));

      // 8. Multi Hot 5 (multi_hot_balance)
      localStorage.setItem('multi_hot_balance', String(val));
      if (typeof window !== 'undefined' && window.multiHotGame) {
        try {
          window.multiHotGame.currentBalance = Number(val);
          if (window.multiHotGame.hudBar && typeof window.multiHotGame.hudBar.setBalance === 'function') {
            window.multiHotGame.hudBar.setBalance(Number(val));
          }
          if (typeof window.multiHotGame.updateMobileUI === 'function') {
            window.multiHotGame.updateMobileUI();
          }
        } catch (_) {}
      }
    } catch (e) {
      console.warn('Error syncing legacy keys:', e);
    }
  }

  // Subscribe to external balance changes
  function subscribe(callback) {
    if (typeof callback !== 'function') return;

    // Listen to storage event (changes from another tab or window)
    window.addEventListener('storage', function (e) {
      if ((e.key === STORAGE_KEY_REAL || e.key === STORAGE_KEY_DEMO || e.key === 'jetx_local_balance' || e.key === 'multi_hot_balance') && e.newValue !== null) {
        callback(round2(e.newValue));
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
      if (!saved || typeof saved !== 'object') return { ...DEFAULT_ADMIN_CONFIG };
      return {
        ...DEFAULT_ADMIN_CONFIG,
        ...saved,
        globalMargin: Math.min(100, Math.max(0, Number(saved.globalMargin) || 10)),
        games: {
          ...DEFAULT_ADMIN_CONFIG.games,
          ...(saved.games && typeof saved.games === 'object' ? saved.games : {})
        },
      };
    } catch (e) {
      return { ...DEFAULT_ADMIN_CONFIG };
    }
  }

  function getGameConfig(gameId) {
    const config = getAdminConfig();
    const gid = String(gameId).toLowerCase().replace(/[-\s]/g, '_');
    return (config.games && (config.games[gid] || config.games[gameId])) || DEFAULT_ADMIN_CONFIG.games[gid] || { id: gameId, enabled: true, targetMargin: config.globalMargin || 10 };
  }

  function isGameEnabled(gameId) {
    const config = getAdminConfig();
    const game = getGameConfig(gameId);
    return config.maintenanceMode !== true && game.enabled !== false;
  }

  function getGameMargin(gameId, defaultMargin = 10.0) {
    const config = getAdminConfig();
    const gid = String(gameId).toLowerCase().replace(/[-\s]/g, '_');
    const g = (config.games && (config.games[gid] || config.games[gameId])) || DEFAULT_ADMIN_CONFIG.games[gid];
    const m = g && g.targetMargin !== undefined ? Number(g.targetMargin) : (config.globalMargin !== undefined ? Number(config.globalMargin) : defaultMargin);
    return isNaN(m) ? defaultMargin : m;
  }

  function getGameRtp(gameId, defaultRtp = 90.0) {
    const config = getAdminConfig();
    const gid = String(gameId).toLowerCase().replace(/[-\s]/g, '_');
    const g = (config.games && (config.games[gid] || config.games[gameId])) || DEFAULT_ADMIN_CONFIG.games[gid];
    if (g && g.rtp !== undefined && !isNaN(Number(g.rtp))) {
      return Number(g.rtp);
    }
    const margin = getGameMargin(gameId, 100 - defaultRtp);
    return Math.round((100 - margin) * 10) / 10;
  }

  async function refreshConfigFromApi() {
    try {
      const res = await fetch('/api/games/config');
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.games) {
          const merged = {
            ...getAdminConfig(),
            ...(data.global || {}),
            games: data.games,
            updatedAt: data.updatedAt || new Date().toISOString()
          };
          localStorage.setItem(ADMIN_CONFIG_KEY, JSON.stringify(merged));
          window.dispatchEvent(new CustomEvent('habesha_admin_config_updated', { detail: merged }));
        }
      }
    } catch (_) {}
  }

  // Trigger non-blocking config refresh on load
  if (typeof window !== 'undefined' && window.location.protocol !== 'file:') {
    setTimeout(refreshConfigFromApi, 100);
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

  // User Registration & Authentication Helpers
  function getUser() {
    try {
      const hopeUser = JSON.parse(localStorage.getItem('habtam-bet-user') || localStorage.getItem('hope-bet-user') || 'null');
      if (hopeUser && (hopeUser.id || hopeUser.phone || hopeUser.username)) {
        return {
          id: hopeUser.id || hopeUser.phone,
          username: hopeUser.username || hopeUser.phone,
          name: hopeUser.displayName || hopeUser.username || hopeUser.phone,
          phone: hopeUser.phone,
          isHabtamBet: true, isHopeBet: true,
          isRegistered: true
        };
      }
    } catch (e) {}
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    // If inside Telegram WebApp, auto-read telegram user
    if (typeof window !== 'undefined' && window.Telegram?.WebApp?.initDataUnsafe?.user) {
      const tg = window.Telegram.WebApp.initDataUnsafe.user;
      return {
        id: tg.id,
        username: tg.username || '',
        name: tg.first_name + (tg.last_name ? ' ' + tg.last_name : ''),
        isTelegram: true,
        isRegistered: true
      };
    }
    return null;
  }

  function isRegistered() {
    return getUser() !== null;
  }

  function isLoggedIn() {
    return isRegistered();
  }

  function registerTelegramUser(data) {
    const user = {
      id: data.id || ('tg_' + Math.floor(100000000 + Math.random() * 900000000)),
      username: data.username ? data.username.replace('@', '') : '',
      name: data.name || data.username || 'Friendes Game Player',
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
    STORAGE_KEY_DEMO: STORAGE_KEY_DEMO,
    ADMIN_CONFIG_KEY: ADMIN_CONFIG_KEY,
    currency: "ETB",
    get: get,
    set: set,
    add: add,
    deduct: deduct,
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
    getGameConfig: getGameConfig,
    getGameMargin: getGameMargin,
    getGameRtp: getGameRtp,
    refreshConfigFromApi: refreshConfigFromApi,
    isGameEnabled: isGameEnabled,
    subscribeAdminConfig: subscribeAdminConfig,
    syncLegacyStorages: syncLegacyStorages
  };

  global.HabeshaWallet = HabeshaWallet;
  global.FriendesWallet = HabeshaWallet;

  // Initialize and synchronize immediately
  get();

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
