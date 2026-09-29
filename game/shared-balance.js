/**
 * Habesha Games - Unified Shared Balance Engine
 * Provides a single source of truth for the player's wallet across all games.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'habesha_balance';
  const ADMIN_CONFIG_KEY = 'habesha_admin_config_v1';
  const DEFAULT_BALANCE = 1000.0;
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

  // Get current shared balance
  function get() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null || raw === '' || isNaN(parseFloat(raw))) {
        set(DEFAULT_BALANCE);
        return DEFAULT_BALANCE;
      }
      return round2(parseFloat(raw));
    } catch (e) {
      console.warn('HabeshaWallet get error:', e);
      return DEFAULT_BALANCE;
    }
  }

  // Set shared balance and broadcast
  function set(amount) {
    const safeAmount = Math.max(0, round2(amount));
    try {
      localStorage.setItem(STORAGE_KEY, safeAmount.toFixed(2));
    } catch (e) {
      console.warn('HabeshaWallet set error:', e);
    }

    // Sync legacy game storage keys for 100% backward compatibility
    syncLegacyStorages(safeAmount);

    // Notify local window
    try {
      window.dispatchEvent(
        new CustomEvent('habesha_balance_updated', {
          detail: { balance: safeAmount }
        })
      );
    } catch (e) {}

    // Notify parent window (if game is running in an iframe)
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          {
            type: 'HABESHA_BALANCE_UPDATE',
            balance: safeAmount
          },
          '*'
        );
      }
    } catch (e) {}

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

  // Expose API
  const HabeshaWallet = {
    KEY: STORAGE_KEY,
    ADMIN_CONFIG_KEY: ADMIN_CONFIG_KEY,
    get: get,
    set: set,
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
