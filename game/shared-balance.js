/**
 * Habesha Games - Unified Shared Balance Engine
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
      const params = new URLSearchParams(window.location.search);
      const urlMode = params.get('mode');
      if (urlMode === 'demo' || urlMode === 'real') {
        localStorage.setItem(MODE_KEY, urlMode);
      }
    } catch (e) {}
  })();

  function getMode() {
    try {
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
    } catch (e) {
      console.warn('Error syncing legacy keys:', e);
    }
  }

  // Subscribe to external balance changes
  function subscribe(callback) {
    if (typeof callback !== 'function') return;

    // Listen to storage event (changes from another tab or window)
    window.addEventListener('storage', function (e) {
      if (e.key === STORAGE_KEY && e.newValue !== null) {
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

  function isGameEnabled(gameId) {
    const config = getAdminConfig();
    const game = config.games[String(gameId)] || {};
    return config.maintenanceMode !== true && game.enabled !== false;
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

  function registerTelegramUser(data) {
    const user = {
      id: data.id || ('tg_' + Math.floor(100000000 + Math.random() * 900000000)),
      username: data.username ? data.username.replace('@', '') : '',
      name: data.name || data.username || 'Habesha Player',
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
    get: get,
    set: set,
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
    subscribeAdminConfig: subscribeAdminConfig,
    syncLegacyStorages: syncLegacyStorages
  };

  global.HabeshaWallet = HabeshaWallet;

  // Initialize and synchronize immediately
  get();

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
