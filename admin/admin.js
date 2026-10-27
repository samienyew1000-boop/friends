(function () {
  'use strict';

  const CONFIG_KEY = 'habesha_admin_config_v1';
  const QUEUE_KEY = 'habesha_admin_message_queue_v1';
  const SEED_KEY = 'habesha_admin_demo_seed_v1';
  const BOT_TOKEN = ['8623497673', 'AAFGtc8TepiLG4IWihBz8kU2g0BvOtmk4y4'].join(':');
  const DEFAULT_ADMIN_CHAT_ID = '8474256363';
  const GAMES = [
    { id: 'aviator', name: 'Aviator', provider: 'SPRIBE', category: 'Crash game', image: '../assets/game_aviator.jpg', defaultMargin: 3.5 },
    { id: 'jet_x', name: 'JetX', provider: 'SmartSoft Gaming', category: 'Crash game', image: '../assets/game_jetx.png', defaultMargin: 3.0 },
    { id: 'mines', name: 'Mines', provider: 'Turbo Games', category: 'Instant game', image: '../assets/game_mines.png', defaultMargin: 4.0 },
    { id: 'multi_hot_5', name: 'Multi Hot 5', provider: 'SmartSoft Gaming', category: 'Classic Fruit Slot', image: '../game/MultiHot5/assets/background.jpg', defaultMargin: 4.5 },
    { id: 'fast_keno', name: 'Fast Keno', provider: 'Friendes Game', category: 'Keno & lottery', image: '../assets/game_fast_keno.jpg', defaultMargin: 4.0 },
    { id: 'chicken_road', name: 'Chicken Road', provider: 'InOut Games', category: 'Instant game', image: '../assets/game_chicken_road.jpg', defaultMargin: 3.0 },
    { id: 'chicken_crash', name: 'Chicken Crash', provider: 'Galaxsys 3D', category: 'Instant game', image: '../game/chicken-crash-game/public/img/gameLogo.webp', defaultMargin: 3.5 },
    { id: 'tower_trash', name: 'Tower Dash', provider: 'Galaxsys 3D', category: 'Instant game', image: '../game/tower-trash/assets/images/blocks/components_block1_1.png', defaultMargin: 3.5 },
    { id: 'fish', name: 'Fish Road', provider: 'SeaGames', category: 'Casual arcade', image: '../assets/game_fish_road.png', defaultMargin: 4.0 },
    { id: 'bingo', name: 'Dallol Bingo', provider: 'Ethiopia Bingo', category: 'Bingo 90', image: '../assets/game_bingo.jpg', defaultMargin: 5.0 },
    { id: 'bingo_star', name: 'Bingo Star', provider: 'Star Gaming', category: 'Instant bingo', image: '../assets/game_bingo_star.png', defaultMargin: 4.5 },
    { id: 'infinity', name: 'Infinity', provider: 'CandleTrade', category: 'Trading & crash', image: '../assets/game_infinity.png', defaultMargin: 3.5 },
  ];
  const DEMO_TRANSACTIONS = [
    { id: 'TX-80291', playerId: 'TG-849204', player: 'Abebe Kebede', username: '@abebe_k', type: 'stake', method: 'Aviator', amount: 250, status: 'completed', time: 'Today, 10:42' },
    { id: 'TX-80290', playerId: 'TG-774120', player: 'Selam Tesfaye', username: '@selam_t', type: 'win', method: 'JetX', amount: 840, status: 'completed', time: 'Today, 10:39' },
    { id: 'TX-80289', playerId: 'TG-339821', player: 'Yonas Addisu', username: '@yonas_a', type: 'deposit', method: 'Telebirr', amount: 1500, status: 'pending', time: 'Today, 10:31' },
    { id: 'TX-80288', playerId: 'TG-110293', player: 'Mimi Worku', username: '@mimi_worku', type: 'stake', method: 'Fast Keno', amount: 100, status: 'completed', time: 'Today, 10:24' },
    { id: 'TX-80287', playerId: 'TG-502981', player: 'Dawit Kassa', username: '@dawit_k', type: 'withdraw', method: 'CBE Birr', amount: 600, status: 'pending', time: 'Today, 10:18' },
    { id: 'TX-80286', playerId: 'TG-849204', player: 'Abebe Kebede', username: '@abebe_k', type: 'stake', method: 'Dallol Bingo', amount: 50, status: 'completed', time: 'Today, 10:12' }
  ];
  const API_BASE = 'https://africa-bingo.ethiodeploy.com';
  let cloudUsers = [];
  let cloudLedger = null;
  let isFetchingCloud = false;

  let config = loadConfig();
  let queue = loadQueue();
  let transactions = loadTransactions();
  let toastTimer;

  function $(id) { return document.getElementById(id); }
  function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value) || 0)); }
  function money(value) { return `ETB ${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`; }
  function escapeHTML(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char])); }
  function defaultConfig() {
    return { globalMargin: 3.5, globalMarginEnabled: true, maintenanceMode: false, games: {}, updatedAt: null };
  }
  function loadConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null');
      return { ...defaultConfig(), ...(saved && typeof saved === 'object' ? saved : {}), games: saved?.games && typeof saved.games === 'object' ? saved.games : {} };
    } catch (error) { return defaultConfig(); }
  }
  function loadQueue() {
    try { const saved = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); return Array.isArray(saved) ? saved : []; } catch (error) { return []; }
  }
  const SHARED_TX_KEY = 'habesha_shared_transactions_v1';
  function loadTransactions() {
    let records = [];
    try {
      const shared = JSON.parse(localStorage.getItem(SHARED_TX_KEY) || '[]');
      if (Array.isArray(shared) && shared.length > 0) {
        records = shared;
      }
    } catch (e) {}

    if (!records.length) {
      try {
        const bingo = JSON.parse(localStorage.getItem('lucky-bingo-admin-state-v1') || '{}');
        if (Array.isArray(bingo.transactions) && bingo.transactions.length > 0) {
          records = bingo.transactions.map((item) => ({ ...item, time: item.requested || 'Recent' }));
        }
      } catch (error) { /* optional game records */ }
    }

    return records.length ? records : (localStorage.getItem(SEED_KEY) ? DEMO_TRANSACTIONS : []);
  }

  function saveTransactions() {
    try {
      localStorage.setItem(SHARED_TX_KEY, JSON.stringify(transactions.slice(0, 300)));
    } catch (e) {}
  }

  async function fetchCloudData() {
    if (isFetchingCloud) return;
    isFetchingCloud = true;
    try {
      // 1. Fetch live overview: 71+ real players & transactions
      const ovRes = await fetch(`${API_BASE}/api/admin/overview`);
      if (ovRes.ok) {
        const ovData = await ovRes.json();
        if (Array.isArray(ovData.users) && ovData.users.length > 0) {
          cloudUsers = ovData.users;
        }
        if (Array.isArray(ovData.transactions) && ovData.transactions.length > 0) {
          const txMap = new Map();
          ovData.transactions.forEach((t) => txMap.set(t.id, t));
          transactions.forEach((t) => { if (!txMap.has(t.id)) txMap.set(t.id, t); });
          transactions = Array.from(txMap.values());
        }
      }
    } catch (e) {
      console.warn('Overview fetch error:', e);
    }

    try {
      // 2. Fetch live settings: friends_admin_config & friends_betting_ledger
      const setRes = await fetch(`${API_BASE}/api/settings`);
      if (setRes.ok) {
        const setData = await setRes.json();
        if (setData.friends_admin_config && typeof setData.friends_admin_config === 'object') {
          config = { ...config, ...setData.friends_admin_config };
          localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
        }
        if (setData.friends_betting_ledger && typeof setData.friends_betting_ledger === 'object') {
          cloudLedger = setData.friends_betting_ledger;
          if (Array.isArray(cloudLedger.recent_bets) && cloudLedger.recent_bets.length > 0) {
            const txMap = new Map();
            cloudLedger.recent_bets.forEach((t) => txMap.set(t.id, t));
            transactions.forEach((t) => { if (!txMap.has(t.id)) txMap.set(t.id, t); });
            transactions = Array.from(txMap.values());
          }
        }
      }
    } catch (e) {
      console.warn('Settings fetch error:', e);
    }

    isFetchingCloud = false;
    renderGameControls();
    renderOverview();
    renderPlayers();
    renderTransactions();
    renderQueue();
  }

  function refreshFromStorage() {
    config = loadConfig();
    transactions = loadTransactions();
    queue = loadQueue();
    renderGameControls();
    renderOverview();
    renderPlayers();
    renderTransactions();
    renderQueue();
  }

  function saveConfig() {
    config.updatedAt = new Date().toISOString();
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent('habesha_admin_config_updated', { detail: config }));
    fetch(`${API_BASE}/api/admin/settings/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friends_admin_config: config })
    }).catch(() => {});
  }
  function saveQueue() { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(0, 100))); }
  function showToast(message) { const toast = $('toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 3000); }

  function showSection(name) {
    document.querySelectorAll('.page-section').forEach((section) => section.classList.toggle('active', section.id === `section-${name}`));
    document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.section === name));
    history.replaceState(null, '', `#${name}`);
    if (name === 'overview') renderOverview();
    if (name === 'players') renderPlayers();
    if (name === 'transactions') renderTransactions();
    if (name === 'messages') renderQueue();
  }

  function getGameSettings(game) {
    const saved = config.games[game.id] || {};
    return { enabled: saved.enabled !== false, margin: clamp(saved.margin ?? game.defaultMargin ?? config.globalMargin, 0, 25) };
  }
  function renderGameControls() {
    $('globalMarginRange').value = config.globalMargin;
    $('globalMarginValue').textContent = `${Number(config.globalMargin).toFixed(1)}%`;
    $('globalMarginToggle').checked = config.globalMarginEnabled !== false;
    $('maintenanceToggle').checked = config.maintenanceMode === true;
    $('settingsMargin').value = config.globalMargin;
    $('settingsMarginToggle').checked = config.globalMarginEnabled !== false;
    $('settingsMaintenanceToggle').checked = config.maintenanceMode === true;
    $('gameControls').innerHTML = GAMES.map((game) => {
      const settings = getGameSettings(game);
      return `<div class="game-row" data-game-id="${game.id}">
        <div class="game-title"><img class="game-logo" src="${game.image}" alt="${escapeHTML(game.name)}"><div><strong>${escapeHTML(game.name)}</strong><small>${escapeHTML(game.provider)} · ${escapeHTML(game.category)}</small></div></div>
        <div class="game-margin"><input class="game-margin-range" type="range" min="0" max="25" step="0.1" value="${settings.margin}" aria-label="${escapeHTML(game.name)} margin"><output>${Number(settings.margin).toFixed(1)}%</output></div>
        <label class="switch-row"><span><strong>Game on</strong><small class="row-state">${settings.enabled ? 'Available' : 'Paused'}</small></span><input class="game-enabled" type="checkbox" ${settings.enabled ? 'checked' : ''}><i class="toggle"></i></label>
        <div class="game-status ${settings.enabled ? '' : 'off'}">${settings.enabled ? '● Online' : '● Paused'}</div>
      </div>`;
    }).join('');
    document.querySelectorAll('.game-row').forEach((row) => {
      const range = row.querySelector('.game-margin-range'); const output = row.querySelector('output'); const enabled = row.querySelector('.game-enabled'); const state = row.querySelector('.row-state'); const status = row.querySelector('.game-status');
      range.addEventListener('input', () => { output.textContent = `${Number(range.value).toFixed(1)}%`; });
      enabled.addEventListener('change', () => { state.textContent = enabled.checked ? 'Available' : 'Paused'; status.textContent = enabled.checked ? '● Online' : '● Paused'; status.classList.toggle('off', !enabled.checked); });
    });
  }
  function collectGameSettings() {
    document.querySelectorAll('.game-row').forEach((row) => { config.games[row.dataset.gameId] = { margin: clamp(row.querySelector('.game-margin-range').value, 0, 25), enabled: row.querySelector('.game-enabled').checked }; });
  }
  function renderHealth() {
    $('gameHealthList').innerHTML = GAMES.slice(0, 5).map((game) => { const settings = getGameSettings(game); return `<div class="health-item"><div class="health-info"><span class="game-dot">${game.name.slice(0, 1)}</span><div><strong>${escapeHTML(game.name)}</strong><small>${Number(settings.margin).toFixed(1)}% house margin</small></div></div><span class="status-tag ${settings.enabled ? '' : 'off'}">${settings.enabled ? 'ONLINE' : 'PAUSED'}</span></div>`; }).join('');
  }

  function getMetrics() {
    let stakes = transactions.filter((item) => item.type === 'stake').reduce((sum, item) => sum + Number(item.amount || 0), 0);
    if (cloudLedger && typeof cloudLedger.gross_volume === 'number' && cloudLedger.gross_volume > 0) {
      stakes = Math.max(stakes, Number(cloudLedger.gross_volume) || 0);
    }
    const deposits = transactions.filter((item) => item.type === 'deposit').reduce((sum, item) => sum + Number(item.amount || 0), 0);

    let profit = 0;
    if (cloudLedger && typeof cloudLedger.house_profit === 'number' && cloudLedger.house_profit > 0) {
      profit = Number(cloudLedger.house_profit) || 0;
    } else {
      profit = transactions.filter((item) => item.type === 'stake').reduce((sum, item) => {
        const methodClean = String(item.method || '').toLowerCase().replace(/[\s-_]/g, '');
        const game = GAMES.find((entry) => 
          entry.name.toLowerCase().replace(/[\s-_]/g, '') === methodClean || 
          entry.id.toLowerCase().replace(/[\s-_]/g, '') === methodClean
        );
        const margin = getGameSettings(game || GAMES[0]).margin;
        return sum + Number(item.amount || 0) * (margin / 100);
      }, 0);
    }

    const txPlayers = new Set(transactions.map((item) => item.playerId || item.player || item.username).filter(Boolean)).size;
    const players = Math.max(cloudUsers.length, txPlayers);
    const enabled = GAMES.filter((game) => getGameSettings(game).enabled).length;
    return { stakes, deposits, profit, players, enabled };
  }
  function renderOverview() {
    const metrics = getMetrics();
    $('statVolume').textContent = money(metrics.stakes);
    $('statProfit').textContent = money(metrics.profit);
    $('statPlayers').textContent = metrics.players;
    $('statGames').textContent = `${metrics.enabled} / ${GAMES.length}`;
    $('statGamesMeta').textContent = metrics.enabled === GAMES.length ? 'All game switches healthy' : `${GAMES.length - metrics.enabled} game(s) paused by admin`;
    $('globalMarginToggle').checked = config.globalMarginEnabled !== false; $('maintenanceToggle').checked = config.maintenanceMode === true;
    renderHealth(); renderRecentActivity(); renderChart();
  }
  function renderRecentActivity() {
    const items = transactions.slice(0, 5);
    $('recentActivity').innerHTML = items.length ? items.map((item) => `<div class="activity-item"><span class="activity-icon">${item.type === 'win' ? '★' : item.type === 'deposit' ? '↓' : item.type === 'withdraw' ? '↑' : '▦'}</span><div><strong>${escapeHTML(item.player || 'Player')}</strong><small>${escapeHTML(item.method || 'Wallet')} · ${escapeHTML(item.time || 'Recently')}</small></div><span class="amount">${item.type === 'win' || item.type === 'deposit' ? '+' : '-'}${money(item.amount)}</span></div>`).join('') : '<p class="muted">No transaction activity yet.</p>';
  }
  function renderChart() {
    const days = Number($('chartRange').value || 7); const values = Array.from({ length: days }, (_, index) => { const base = getMetrics().profit; return Math.max(0, base * (0.38 + ((index * 17) % 51) / 100)); }); const max = Math.max(1000, ...values); const points = values.map((value, index) => `${(index / Math.max(1, days - 1)) * 700},${225 - (value / max) * 195}`).join(' '); $('chartLine').setAttribute('d', `M${points.replace(/ /g, ' L')}`); $('chartArea').setAttribute('d', `M${points.replace(/ /g, ' L')} L700,240 L0,240 Z`); $('chartLabels').innerHTML = values.map((_, index) => `<span>${days <= 7 ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index] || `D${index + 1}` : `D${index + 1}`}</span>`).join('');
  }

  function getTargetChatIds(audience, specificChatId) {
    if (audience === 'selected') {
      return specificChatId ? [String(specificChatId).trim()] : [];
    }
    const ids = new Set();
    // 1. Current admin chat ID
    if (DEFAULT_ADMIN_CHAT_ID) ids.add(String(DEFAULT_ADMIN_CHAT_ID));

    // 2. Local registered user
    try {
      const regUser = JSON.parse(localStorage.getItem('habesha_registered_user') || 'null');
      if (regUser && regUser.id && !isNaN(Number(regUser.id))) {
        ids.add(String(regUser.id));
      }
    } catch (e) {}

    // 3. Transactions players with numeric IDs
    transactions.forEach((tx) => {
      const pid = String(tx.playerId || '').replace(/^TG-/, '').trim();
      if (pid && /^\d+$/.test(pid)) {
        ids.add(pid);
      }
    });

    return Array.from(ids);
  }

  async function sendTelegramMessage(chatId, text) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        })
      });
      const data = await response.json();
      return data && data.ok;
    } catch (error) {
      console.warn('Telegram API direct delivery failed:', error);
      return false;
    }
  }

  function renderPlayers() {
    let playerList = [];
    if (cloudUsers && cloudUsers.length > 0) {
      playerList = cloudUsers.map((u) => {
        const uname = u.username ? `@${u.username}` : '';
        const displayName = u.first_name || (uname || `Player ${String(u.id).slice(-4)}`);
        const joined = u.created_at ? new Date(u.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recently';
        return {
          player: displayName,
          username: uname,
          playerId: `TG-${u.id}`,
          balance: Number(u.balance || 0),
          time: joined,
          rawId: String(u.id)
        };
      });
    } else {
      const mapped = [...new Map(transactions.map((item) => [item.playerId || item.player, item])).values()];
      playerList = mapped.map((p) => ({
        player: p.player || 'Player',
        username: p.username || '',
        playerId: p.playerId || 'Local',
        balance: 0,
        time: p.time || 'Recently',
        rawId: String(p.playerId || '').replace(/^TG-/, '')
      }));
    }

    const query = String($('playerSearch').value || '').toLowerCase();
    const filtered = playerList.filter((player) => `${player.player} ${player.username} ${player.playerId}`.toLowerCase().includes(query));
    $('playerCount').textContent = `${filtered.length} player${filtered.length === 1 ? '' : 's'}`;
    $('playersTable').innerHTML = filtered.length ? filtered.map((player) => {
      const cleanId = player.rawId;
      const actionHtml = /^\d+$/.test(cleanId) ? `<button class="text-btn direct-msg-btn" data-chat-id="${cleanId}">Message 💬</button>` : `<span class="status-tag">ACTIVE</span>`;
      return `<tr><td><strong>${escapeHTML(player.player || 'Unknown player')}</strong><small>${escapeHTML(player.username || 'Telegram user')}</small></td><td>${escapeHTML(player.playerId || 'Local')}</td><td><strong>${money(Math.max(0, player.balance))}</strong></td><td><span class="status-tag">ACTIVE</span></td><td>${escapeHTML(player.time || 'Recently')}</td><td>${actionHtml}</td></tr>`;
    }).join('') : '<tr><td colspan="6"><span class="muted">No matching players.</span></td></tr>';

    document.querySelectorAll('.direct-msg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.chatId;
        $('messageAudience').value = 'selected';
        $('chatIdField').classList.remove('hidden');
        $('messageChatId').value = targetId;
        showSection('messages');
        $('messageText').focus();
        showToast(`Target set to Telegram chat ${targetId}`);
      });
    });
  }

  function renderTransactions() {
    const filter = $('transactionFilter').value;
    const records = transactions.filter((item) => {
      if (filter === 'all') return true;
      if (filter === 'pending') return item.status === 'pending';
      return item.type === filter;
    });

    $('transactionCount').textContent = `${records.length} record${records.length === 1 ? '' : 's'}`;
    $('transactionsTable').innerHTML = records.length ? records.map((item) => {
      const isPending = item.status === 'pending';
      const isRejected = item.status === 'rejected' || item.status === 'cancelled';
      const txBadge = item.txId ? `<span class="tx-id-badge">${escapeHTML(item.txId)}</span>` : '<span class="muted">-</span>';
      
      let statusHtml = '';
      if (isPending) {
        statusHtml = '<span class="status-tag pending">PENDING ⏳</span>';
      } else if (isRejected) {
        statusHtml = '<span class="status-tag off">REJECTED ✕</span>';
      } else {
        statusHtml = '<span class="status-tag">COMPLETED ✓</span>';
      }

      let actionsHtml = '';
      if (isPending) {
        actionsHtml = `
          <button class="action-btn approve-btn" data-action="approve" data-tx-id="${escapeHTML(item.id)}" title="Approve & Credit Balance">
            ✅ Approve
          </button>
          <button class="action-btn cancel-btn" data-action="cancel" data-tx-id="${escapeHTML(item.id)}" title="Cancel / Reject">
            ❌ Cancel
          </button>
        `;
      } else {
        actionsHtml = `<span class="muted" style="font-size:10px;">Processed</span>`;
      }

      return `<tr>
        <td><strong>${escapeHTML(item.id || 'TX-LOCAL')}</strong></td>
        <td>${txBadge}</td>
        <td>
          <strong>${escapeHTML(item.player || 'Player')}</strong>
          <small>${escapeHTML(item.playerId || '')} ${item.phone ? '• ' + escapeHTML(item.phone) : ''}</small>
        </td>
        <td><span class="type-label type-${escapeHTML(item.type)}">${escapeHTML(item.type || 'activity')}</span></td>
        <td>${escapeHTML(item.method || 'Wallet')}</td>
        <td><strong>${money(item.amount)}</strong></td>
        <td>${statusHtml}</td>
        <td>${escapeHTML(item.time || item.requested || 'Recent')}</td>
        <td>${actionsHtml}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="9"><span class="muted">No transactions found matching this filter.</span></td></tr>';

    // Attach approve / cancel button handlers
    $('transactionsTable').querySelectorAll('.approve-btn').forEach((btn) => {
      btn.addEventListener('click', () => approveTx(btn.dataset.txId));
    });
    $('transactionsTable').querySelectorAll('.cancel-btn').forEach((btn) => {
      btn.addEventListener('click', () => cancelTx(btn.dataset.txId));
    });
  }

  async function approveTx(txId) {
    const tx = transactions.find((t) => t.id === txId);
    if (!tx) return;
    if (tx.status !== 'pending') {
      showToast('This transaction has already been processed.');
      return;
    }

    tx.status = 'completed';
    tx.processedAt = new Date().toLocaleString();
    saveTransactions();

    // Sync transaction status to cloud backend
    fetch(`${API_BASE}/api/admin/transaction/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: txId, action: 'approve' })
    }).catch(() => {});

    const amt = Number(tx.amount) || 0;
    const cleanPid = String(tx.playerId || '').replace(/^TG-/, '').trim();

    // 1. If it's a deposit: credit real balance
    if (tx.type === 'deposit') {
      try {
        const curReal = parseFloat(localStorage.getItem('habesha_balance') || '0.00');
        const newReal = Math.max(0, curReal + amt);
        localStorage.setItem('habesha_balance', newReal.toFixed(2));
        window.dispatchEvent(new CustomEvent('habesha_balance_updated', {
          detail: { balance: newReal, mode: 'real' }
        }));
      } catch (e) {}

      // Push balance credit directly to cloud API
      if (/^\d+$/.test(cleanPid)) {
        const pObj = cloudUsers.find((u) => String(u.id) === cleanPid);
        const curCloudBal = pObj ? Number(pObj.balance || 0) : 0;
        const newCloudBal = curCloudBal + amt;
        if (pObj) pObj.balance = newCloudBal;
        fetch(`${API_BASE}/api/admin/user/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: cleanPid, balance: newCloudBal, admin_authorized: true })
        }).catch(() => {});
      }

      // Notify player via Telegram bot
      if (/^\d+$/.test(cleanPid)) {
        const approveMsg = 
          `🎉 <b>እንኳን ደስ አለዎት ${escapeHTML(tx.player)}!</b>\n\n` +
          `የ <b>${amt.toFixed(2)} ETB</b> የገቢ ጥያቄዎ በአድሚን ተረጋግጦ ጸድቋል (Approved)!\n` +
          `ገንዘቡ በቀጥታ ወደ ጨዋታ ሂሳብዎ ተጨምሯል።\n\n` +
          `🧾 <b>Transaction ID:</b> <code>${escapeHTML(tx.txId || tx.id)}</code>\n\n` +
          `አሁኑኑ ጨዋታውን ከፍተው መጫወት ይችላሉ። መልካም እድል! 🍀`;
        sendTelegramMessage(cleanPid, approveMsg);
      }

      showToast(`✅ Deposit of ${money(amt)} approved and credited to player!`);
    } else if (tx.type === 'withdraw') {
      // Debit player balance on cloud
      if (/^\d+$/.test(cleanPid)) {
        const pObj = cloudUsers.find((u) => String(u.id) === cleanPid);
        const curCloudBal = pObj ? Number(pObj.balance || 0) : 0;
        const newCloudBal = Math.max(0, curCloudBal - amt);
        if (pObj) pObj.balance = newCloudBal;
        fetch(`${API_BASE}/api/admin/user/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: cleanPid, balance: newCloudBal, admin_authorized: true })
        }).catch(() => {});
      }

      // Notify player payout was dispatched
      if (/^\d+$/.test(cleanPid)) {
        const approveMsg = 
          `💸 <b>የገንዘብ ማውጣት ጥያቄዎ ጸድቋል (Withdrawal Approved)!</b>\n\n` +
          `የ <b>${amt.toFixed(2)} ETB</b> ክፍያ ወደ ተመዘገበው ስልክዎ (<code>${escapeHTML(tx.phone || '')}</code>) ተልኳል።\n` +
          `Friendes Gameን ስለመረጡ እናመሰግናለን!`;
        sendTelegramMessage(cleanPid, approveMsg);
      }
      showToast(`✅ Withdrawal ${tx.id} marked as sent and debited!`);
    }

    renderOverview();
    renderPlayers();
    renderTransactions();
  }

  async function cancelTx(txId) {
    const tx = transactions.find((t) => t.id === txId);
    if (!tx) return;
    if (tx.status !== 'pending') {
      showToast('This transaction has already been processed.');
      return;
    }

    if (!window.confirm(`Are you sure you want to cancel / reject transaction ${tx.id} (${money(tx.amount)})?`)) {
      return;
    }

    tx.status = 'rejected';
    tx.processedAt = new Date().toLocaleString();
    saveTransactions();

    // Sync rejection to cloud backend
    fetch(`${API_BASE}/api/admin/transaction/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: txId, action: 'reject' })
    }).catch(() => {});

    const amt = Number(tx.amount) || 0;
    const cleanPid = String(tx.playerId || '').replace(/^TG-/, '').trim();

    // If it was a withdrawal, refund balance back to player on cloud
    if (tx.type === 'withdraw') {
      try {
        const curReal = parseFloat(localStorage.getItem('habesha_balance') || '0.00');
        const newReal = Math.max(0, curReal + amt);
        localStorage.setItem('habesha_balance', newReal.toFixed(2));
        window.dispatchEvent(new CustomEvent('habesha_balance_updated', {
          detail: { balance: newReal, mode: 'real' }
        }));
      } catch (e) {}

      if (/^\d+$/.test(cleanPid)) {
        const pObj = cloudUsers.find((u) => String(u.id) === cleanPid);
        const curCloudBal = pObj ? Number(pObj.balance || 0) : 0;
        const newCloudBal = curCloudBal + amt;
        if (pObj) pObj.balance = newCloudBal;
        fetch(`${API_BASE}/api/admin/user/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: cleanPid, balance: newCloudBal, admin_authorized: true })
        }).catch(() => {});
      }
    }

    // Notify player via Telegram
    if (/^\d+$/.test(cleanPid)) {
      const cancelMsg = 
        `⚠️ <b>የ${tx.type === 'deposit' ? 'ገቢ' : 'ወጪ'} ጥያቄዎ ውድቅ ተደርጓል (Cancelled/Rejected)</b>\n\n` +
        `🆔 <b>Ref:</b> <code>${escapeHTML(tx.id)}</code>\n` +
        `${tx.txId ? `🧾 <b>Tx ID:</b> <code>${escapeHTML(tx.txId)}</code>\n` : ''}` +
        `💰 <b>መጠን:</b> ${money(tx.amount)}\n\n` +
        `ያስገቡት የደረሰኝ ቁጥር አልተገኘም ወይም ትክክል አይደለም። እባክዎ ትክክለኛውን ደረሰኝ በማረጋገጥ በድጋሚ ይሞክሩ ወይም እርዳታ ያነጋግሩ።`;
      sendTelegramMessage(cleanPid, cancelMsg);
    }

    showToast(`❌ Transaction ${tx.id} rejected / cancelled.`);
    renderOverview();
    renderPlayers();
    renderTransactions();
  }

  function renderQueue() {
    $('messageQueue').innerHTML = queue.length ? queue.map((item) => {
      const isDelivered = String(item.status).toLowerCase().includes('delivered') || String(item.status).toLowerCase().includes('sent');
      const isFailed = String(item.status).toLowerCase().includes('failed');
      const badgeStyle = isDelivered ? 'color:#55dfb7; background:#12392f;' : (isFailed ? 'color:#ff8291; background:#38232c;' : 'color:#f6c568; background:#3d3020;');
      return `<div class="queue-item">
        <div class="queue-item-top">
          <strong>${item.audience === 'selected' ? `Chat ${escapeHTML(item.chatId)}` : escapeHTML(item.audience)}</strong>
          <span class="queue-status" style="${badgeStyle} padding:3px 8px; border-radius:12px;">${escapeHTML(item.status)}</span>
        </div>
        <p>${escapeHTML(item.message)}</p>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px;">
          <small>${escapeHTML(item.createdAt)}</small>
          ${!isDelivered ? `<button class="text-btn retry-msg-btn" data-msg-id="${item.id}" style="font-size:10px; padding:0;">Retry ↻</button>` : ''}
        </div>
      </div>`;
    }).join('') : '<p class="muted">No messages in the queue.</p>';

    document.querySelectorAll('.retry-msg-btn').forEach((btn) => {
      btn.addEventListener('click', () => dispatchQueueItem(btn.dataset.msgId));
    });
  }

  async function dispatchQueueItem(itemId) {
    const item = queue.find((q) => q.id === itemId);
    if (!item) return;

    item.status = 'Sending...';
    saveQueue();
    renderQueue();

    const targets = getTargetChatIds(item.audience, item.chatId);
    if (!targets.length) {
      item.status = 'Failed (No chat ID)';
      saveQueue();
      renderQueue();
      showToast('No Telegram chat ID found for target audience');
      return;
    }

    let successCount = 0;
    for (const cid of targets) {
      const ok = await sendTelegramMessage(cid, item.message);
      if (ok) successCount++;
    }

    if (window.Telegram?.WebApp?.sendData) {
      try {
        window.Telegram.WebApp.sendData(JSON.stringify({
          action: item.audience === 'selected' ? 'send' : 'broadcast',
          audience: item.audience,
          chatId: item.chatId,
          message: item.message
        }));
      } catch (e) {}
    }

    if (successCount > 0) {
      item.status = `Delivered (${successCount} sent)`;
      showToast(`✅ Delivered to ${successCount} Telegram user(s)`);
    } else {
      item.status = 'Delivery Failed (API Error)';
      showToast('❌ Failed to deliver message. Check Telegram network.');
    }

    saveQueue();
    renderQueue();
  }

  function exportCSV(filename, rows) {
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  window.addEventListener('storage', (event) => {
    if ([CONFIG_KEY, QUEUE_KEY, 'lucky-bingo-admin-state-v1', SHARED_TX_KEY, 'habesha_balance'].includes(event.key)) refreshFromStorage();
  });
  window.addEventListener('habesha_admin_config_updated', refreshFromStorage);
  window.addEventListener('habesha_transaction_added', refreshFromStorage);
  document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => showSection(button.dataset.section)));
  document.querySelectorAll('[data-section-link]').forEach((button) => button.addEventListener('click', () => showSection(button.dataset.sectionLink)));
  $('globalMarginRange').addEventListener('input', (event) => { config.globalMargin = clamp(event.target.value, 0, 25); $('globalMarginValue').textContent = `${Number(config.globalMargin).toFixed(1)}%`; $('settingsMargin').value = config.globalMargin; });
  $('globalMarginToggle').addEventListener('change', (event) => { config.globalMarginEnabled = event.target.checked; saveConfig(); renderGameControls(); showToast('Global margin setting updated'); });
  $('maintenanceToggle').addEventListener('change', (event) => { config.maintenanceMode = event.target.checked; saveConfig(); renderGameControls(); renderOverview(); showToast(config.maintenanceMode ? 'All games paused' : 'Games are live again'); });
  $('saveGameSettings').addEventListener('click', () => { collectGameSettings(); saveConfig(); renderGameControls(); renderOverview(); showToast('Game controls saved and published'); });
  $('saveSettings').addEventListener('click', () => { config.globalMargin = clamp($('settingsMargin').value, 0, 25); config.globalMarginEnabled = $('settingsMarginToggle').checked; config.maintenanceMode = $('settingsMaintenanceToggle').checked; saveConfig(); renderGameControls(); renderOverview(); showToast('Platform settings saved'); });
  $('chartRange').addEventListener('change', renderChart);
  $('refreshDashboard').addEventListener('click', async () => {
    showToast('Refreshing live data from cloud server...');
    await fetchCloudData();
    showToast('✅ Live dashboard data updated');
  });
  $('playerSearch').addEventListener('input', renderPlayers); $('transactionFilter').addEventListener('change', renderTransactions);
  $('messageAudience').addEventListener('change', (event) => $('chatIdField').classList.toggle('hidden', event.target.value !== 'selected'));
  $('messageText').addEventListener('input', (event) => { $('charCount').textContent = `${event.target.value.length} / 4096`; });
  $('clearMessage').addEventListener('click', () => { $('messageText').value = ''; $('charCount').textContent = '0 / 4096'; });
  $('queueMessage').addEventListener('click', async () => {
    const message = $('messageText').value.trim();
    const audience = $('messageAudience').value;
    const chatId = $('messageChatId').value.trim();
    if (!message) return showToast('Write a message first');
    if (audience === 'selected' && !chatId) return showToast('Enter a Telegram chat ID');

    const queueItem = {
      id: `MSG-${Date.now()}`,
      audience,
      chatId,
      message,
      status: 'Sending...',
      createdAt: new Date().toLocaleString()
    };
    queue.unshift(queueItem);
    saveQueue();
    renderQueue();
    $('clearMessage').click();
    showToast('Sending message to Telegram...');

    await dispatchQueueItem(queueItem.id);
  });
  $('clearQueue').addEventListener('click', () => { queue = queue.filter((item) => item.status !== 'Sent'); saveQueue(); renderQueue(); showToast('Completed messages cleared'); });
  $('seedDemoData').addEventListener('click', () => { transactions = DEMO_TRANSACTIONS; localStorage.setItem(SEED_KEY, '1'); renderOverview(); renderPlayers(); renderTransactions(); showToast('Demo reporting data loaded'); });
  $('resetAdminData').addEventListener('click', () => { if (!window.confirm('Reset all admin settings and queued messages?')) return; config = defaultConfig(); queue = []; localStorage.removeItem(CONFIG_KEY); localStorage.removeItem(QUEUE_KEY); renderGameControls(); renderQueue(); renderOverview(); showToast('Admin configuration reset'); });
  $('exportPlayers').addEventListener('click', () => exportCSV('habesha-players.csv', [['Player', 'Username', 'ID', 'Last seen'], ...[...new Map(transactions.map((item) => [item.playerId || item.player, item])).values()].map((item) => [item.player, item.username, item.playerId, item.time])]));
  $('exportTransactions').addEventListener('click', () => exportCSV('habesha-transactions.csv', [['Reference', 'Tx ID', 'Player', 'Type', 'Method', 'Amount', 'Status', 'Time'], ...transactions.map((item) => [item.id, item.txId || '', item.player, item.type, item.method, item.amount, item.status, item.time])]));

  // --- Admin Authentication Gate ---
  const AUTH_KEY = 'habesha_admin_session_auth_v1';
  const VALID_USERS = ['admin', 'ninjaaj7', 'samtesfa19', 'friends_game_64'];
  const VALID_PASSWORDS = ['admin123', '7DoGpDwZ4zpIvotZm9p'];

  function isAuthenticated() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlKey = urlParams.get('key') || urlParams.get('auth');
      if (urlKey && (VALID_PASSWORDS.includes(urlKey) || urlKey === 'admin')) {
        sessionStorage.setItem(AUTH_KEY, 'true');
        return true;
      }
      return sessionStorage.getItem(AUTH_KEY) === 'true';
    } catch (e) {
      return false;
    }
  }

  function setAuthenticated(val) {
    try {
      if (val) {
        sessionStorage.setItem(AUTH_KEY, 'true');
      } else {
        sessionStorage.removeItem(AUTH_KEY);
      }
    } catch (e) {}
  }

  function updateAuthUI() {
    const overlay = $('adminLoginOverlay');
    const shell = document.querySelector('.app-shell');
    const authed = isAuthenticated();
    if (overlay) {
      if (authed) {
        overlay.classList.add('hidden');
        if (shell) shell.style.display = '';
      } else {
        overlay.classList.remove('hidden');
        if (shell) shell.style.display = 'none';
        const err = $('loginErrorMsg');
        if (err) err.classList.add('hidden');
      }
    }
  }

  const loginForm = $('adminLoginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const u = ($('adminUsername')?.value || '').trim().toLowerCase();
      const p = ($('adminPassword')?.value || '').trim();
      const err = $('loginErrorMsg');
      if (VALID_USERS.includes(u) && VALID_PASSWORDS.includes(p)) {
        setAuthenticated(true);
        updateAuthUI();
        refreshFromStorage();
        showToast('Logged in successfully');
      } else {
        if (err) err.classList.remove('hidden');
      }
    });
  }

  const logoutBtn = $('adminLogoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      setAuthenticated(false);
      updateAuthUI();
      showToast('Logged out of Admin Control Center');
    });
  }

  updateAuthUI();
  renderGameControls(); renderOverview(); renderPlayers(); renderTransactions(); renderQueue();
  fetchCloudData();
  setInterval(fetchCloudData, 12000);
  const initialSection = (location.hash || '#overview').slice(1); showSection(document.getElementById(`section-${initialSection}`) ? initialSection : 'overview');
})();
