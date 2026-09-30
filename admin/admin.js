(function () {
  'use strict';

  const CONFIG_KEY = 'habesha_admin_config_v1';
  const QUEUE_KEY = 'habesha_admin_message_queue_v1';
  const SEED_KEY = 'habesha_admin_demo_seed_v1';
  const GAMES = [
    { id: 'aviator', name: 'Aviator', provider: 'SPRIBE', category: 'Crash game', image: '../assets/game_aviator.gif', defaultMargin: 3.5 },
    { id: 'fast_keno', name: 'Fast Keno', provider: 'Habesha Gaming', category: 'Keno & lottery', image: '../assets/game_fast_keno.gif', defaultMargin: 4 },
    { id: 'chicken_road', name: 'Chicken Road', provider: 'InOut Games', category: 'Instant game', image: '../assets/game_chicken_road.png', defaultMargin: 3 },
    { id: 'fish', name: 'Fish Road', provider: 'SeaGames', category: 'Casual arcade', image: '../assets/game_fish.png', defaultMargin: 4 },
    { id: 'bingo', name: 'Dallol Bingo', provider: 'Ethiopia Bingo', category: 'Bingo 90', image: '../assets/game_bingo.png', defaultMargin: 5 },
    { id: 'bingo_star', name: 'Bingo Star', provider: 'Star Gaming', category: 'Instant bingo', image: '../assets/game_bingo_star.png', defaultMargin: 4.5 },
    { id: 'infinity', name: 'Infinity', provider: 'CandleTrade', category: 'Trading & crash', image: '../assets/game_infinity.png', defaultMargin: 3.5 },
  ];
  const DEMO_TRANSACTIONS = [
    { id: 'TX-80291', playerId: 'TG-849204', player: 'Abebe Kebede', username: '@abebe_k', type: 'stake', method: 'Aviator', amount: 250, status: 'completed', time: 'Today, 10:42' },
    { id: 'TX-80290', playerId: 'TG-774120', player: 'Selam Tesfaye', username: '@selam_t', type: 'win', method: 'JetX', amount: 840, status: 'completed', time: 'Today, 10:39' },
    { id: 'TX-80289', playerId: 'TG-339821', player: 'Yonas Addisu', username: '@yonas_a', type: 'deposit', method: 'Telebirr', amount: 1500, status: 'pending', time: 'Today, 10:31' },
    { id: 'TX-80288', playerId: 'TG-110293', player: 'Mimi Worku', username: '@mimi_worku', type: 'stake', method: 'Fast Keno', amount: 100, status: 'completed', time: 'Today, 10:24' },
    { id: 'TX-80287', playerId: 'TG-502981', player: 'Dawit Kassa', username: '@dawit_k', type: 'withdraw', method: 'CBE Birr', amount: 600, status: 'pending', time: 'Today, 10:18' },
    { id: 'TX-80286', playerId: 'TG-849204', player: 'Abebe Kebede', username: '@abebe_k', type: 'stake', method: 'Dallol Bingo', amount: 50, status: 'completed', time: 'Today, 10:12' },
  ];

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
  function loadTransactions() {
    let records = [];
    try {
      const bingo = JSON.parse(localStorage.getItem('lucky-bingo-admin-state-v1') || '{}');
      if (Array.isArray(bingo.transactions)) records = bingo.transactions.map((item) => ({ ...item, time: item.requested || 'Recent' }));
    } catch (error) { /* optional game records */ }
    return records.length ? records : (localStorage.getItem(SEED_KEY) ? DEMO_TRANSACTIONS : []);
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
    const stakes = transactions.filter((item) => item.type === 'stake').reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const deposits = transactions.filter((item) => item.type === 'deposit').reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const profit = transactions.filter((item) => item.type === 'stake').reduce((sum, item) => { const game = GAMES.find((entry) => entry.name.toLowerCase() === String(item.method || '').toLowerCase()); return sum + Number(item.amount || 0) * (getGameSettings(game || GAMES[0]).margin / 100); }, 0);
    const players = new Set(transactions.map((item) => item.playerId || item.player || item.username).filter(Boolean)).size;
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
    $('recentActivity').innerHTML = items.length ? items.map((item) => `<div class="activity-item"><span class="activity-icon">${item.type === 'win' ? '★' : item.type === 'deposit' ? '↓' : item.type === 'withdraw' ? '↑' : '▦'}</span><div><strong>${escapeHTML(item.player || 'Player')}</strong><small>${escapeHTML(item.method || 'Wallet')} · ${escapeHTML(item.time || 'Recently')}</small></div><span class="amount">${item.type === 'win' || item.type === 'deposit' ? '+' : '-'}${money(item.amount)}</span></div>`).join('') : '<p class="muted">No transaction activity yet. Load demo reporting data in Settings to preview the dashboard.</p>';
  }
  function renderChart() {
    const days = Number($('chartRange').value || 7); const values = Array.from({ length: days }, (_, index) => { const base = getMetrics().profit; return Math.max(0, base * (0.38 + ((index * 17) % 51) / 100)); }); const max = Math.max(1000, ...values); const points = values.map((value, index) => `${(index / Math.max(1, days - 1)) * 700},${225 - (value / max) * 195}`).join(' '); $('chartLine').setAttribute('d', `M${points.replace(/ /g, ' L')}`); $('chartArea').setAttribute('d', `M${points.replace(/ /g, ' L')} L700,240 L0,240 Z`); $('chartLabels').innerHTML = values.map((_, index) => `<span>${days <= 7 ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index] || `D${index + 1}` : `D${index + 1}`}</span>`).join('');
  }

  function renderPlayers() {
    const players = [...new Map(transactions.map((item) => [item.playerId || item.player, item])).values()]; const query = String($('playerSearch').value || '').toLowerCase(); const filtered = players.filter((player) => `${player.player} ${player.username} ${player.playerId}`.toLowerCase().includes(query)); $('playerCount').textContent = `${filtered.length} player${filtered.length === 1 ? '' : 's'}`; $('playersTable').innerHTML = filtered.length ? filtered.map((player) => { const playerRecords = transactions.filter((item) => (item.playerId || item.player) === (player.playerId || player.player)); const balance = playerRecords.reduce((sum, item) => sum + (item.type === 'deposit' || item.type === 'win' ? Number(item.amount) : -Number(item.amount || 0)), 0); return `<tr><td><strong>${escapeHTML(player.player || 'Unknown player')}</strong><small>${escapeHTML(player.username || 'Telegram user')}</small></td><td>${escapeHTML(player.playerId || 'Local')}</td><td><strong>${money(Math.max(0, balance))}</strong></td><td>${playerRecords.length} record${playerRecords.length === 1 ? '' : 's'}</td><td>${escapeHTML(player.time || 'Recently')}</td><td><span class="status-tag">ACTIVE</span></td></tr>`; }).join('') : '<tr><td colspan="6"><span class="muted">No matching players. Player records appear when the connected game ledger contains activity.</span></td></tr>'; }
  function renderTransactions() { const filter = $('transactionFilter').value; const records = transactions.filter((item) => filter === 'all' || item.type === filter); $('transactionCount').textContent = `${records.length} record${records.length === 1 ? '' : 's'}`; $('transactionsTable').innerHTML = records.length ? records.map((item) => `<tr><td><strong>${escapeHTML(item.id || 'TX-LOCAL')}</strong></td><td>${escapeHTML(item.player || 'Player')}<small>${escapeHTML(item.playerId || '')}</small></td><td><span class="type-label type-${escapeHTML(item.type)}">${escapeHTML(item.type || 'activity')}</span></td><td>${escapeHTML(item.method || 'Wallet')}</td><td><strong>${money(item.amount)}</strong></td><td><span class="status-tag ${item.status === 'pending' ? 'off' : ''}">${escapeHTML(item.status || 'completed')}</span></td><td>${escapeHTML(item.time || item.requested || 'Recent')}</td></tr>`).join('') : '<tr><td colspan="7"><span class="muted">No records found.</span></td></tr>'; }

  function renderQueue() { $('messageQueue').innerHTML = queue.length ? queue.map((item) => `<div class="queue-item"><div class="queue-item-top"><strong>${item.audience === 'selected' ? `Chat ${escapeHTML(item.chatId)}` : escapeHTML(item.audience)} </strong><span class="queue-status">${escapeHTML(item.status)}</span></div><p>${escapeHTML(item.message)}</p><small>${escapeHTML(item.createdAt)}</small></div>`).join('') : '<p class="muted">No messages in the queue.</p>'; }
  function exportCSV(filename, rows) { const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'); const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; link.click(); URL.revokeObjectURL(link.href); }

  window.addEventListener('storage', (event) => {
    if ([CONFIG_KEY, QUEUE_KEY, 'lucky-bingo-admin-state-v1'].includes(event.key)) refreshFromStorage();
  });
  window.addEventListener('habesha_admin_config_updated', refreshFromStorage);
  document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => showSection(button.dataset.section)));
  document.querySelectorAll('[data-section-link]').forEach((button) => button.addEventListener('click', () => showSection(button.dataset.sectionLink)));
  $('globalMarginRange').addEventListener('input', (event) => { config.globalMargin = clamp(event.target.value, 0, 25); $('globalMarginValue').textContent = `${Number(config.globalMargin).toFixed(1)}%`; $('settingsMargin').value = config.globalMargin; });
  $('globalMarginToggle').addEventListener('change', (event) => { config.globalMarginEnabled = event.target.checked; saveConfig(); renderGameControls(); showToast('Global margin setting updated'); });
  $('maintenanceToggle').addEventListener('change', (event) => { config.maintenanceMode = event.target.checked; saveConfig(); renderGameControls(); renderOverview(); showToast(config.maintenanceMode ? 'All games paused' : 'Games are live again'); });
  $('saveGameSettings').addEventListener('click', () => { collectGameSettings(); saveConfig(); renderGameControls(); renderOverview(); showToast('Game controls saved and published'); });
  $('saveSettings').addEventListener('click', () => { config.globalMargin = clamp($('settingsMargin').value, 0, 25); config.globalMarginEnabled = $('settingsMarginToggle').checked; config.maintenanceMode = $('settingsMaintenanceToggle').checked; saveConfig(); renderGameControls(); renderOverview(); showToast('Platform settings saved'); });
  $('chartRange').addEventListener('change', renderChart); $('refreshDashboard').addEventListener('click', () => { transactions = loadTransactions(); renderOverview(); showToast('Dashboard refreshed'); });
  $('playerSearch').addEventListener('input', renderPlayers); $('transactionFilter').addEventListener('change', renderTransactions);
  $('messageAudience').addEventListener('change', (event) => $('chatIdField').classList.toggle('hidden', event.target.value !== 'selected'));
  $('messageText').addEventListener('input', (event) => { $('charCount').textContent = `${event.target.value.length} / 4096`; });
  $('clearMessage').addEventListener('click', () => { $('messageText').value = ''; $('charCount').textContent = '0 / 4096'; });
  $('queueMessage').addEventListener('click', () => { const message = $('messageText').value.trim(); const audience = $('messageAudience').value; const chatId = $('messageChatId').value.trim(); if (!message) return showToast('Write a message first'); if (audience === 'selected' && !chatId) return showToast('Enter a Telegram chat ID'); queue.unshift({ id: `MSG-${Date.now()}`, audience, chatId, message, status: 'Queued', createdAt: new Date().toLocaleString() }); saveQueue(); renderQueue(); $('clearMessage').click(); showToast('Message added to secure delivery queue'); });
  $('clearQueue').addEventListener('click', () => { queue = queue.filter((item) => item.status !== 'Sent'); saveQueue(); renderQueue(); showToast('Completed messages cleared'); });
  $('seedDemoData').addEventListener('click', () => { transactions = DEMO_TRANSACTIONS; localStorage.setItem(SEED_KEY, '1'); renderOverview(); renderPlayers(); renderTransactions(); showToast('Demo reporting data loaded'); });
  $('resetAdminData').addEventListener('click', () => { if (!window.confirm('Reset all admin settings and queued messages?')) return; config = defaultConfig(); queue = []; localStorage.removeItem(CONFIG_KEY); localStorage.removeItem(QUEUE_KEY); renderGameControls(); renderQueue(); renderOverview(); showToast('Admin configuration reset'); });
  $('exportPlayers').addEventListener('click', () => exportCSV('habesha-players.csv', [['Player', 'Username', 'ID', 'Last seen'], ...[...new Map(transactions.map((item) => [item.playerId || item.player, item])).values()].map((item) => [item.player, item.username, item.playerId, item.time])]));
  $('exportTransactions').addEventListener('click', () => exportCSV('habesha-transactions.csv', [['Reference', 'Player', 'Type', 'Method', 'Amount', 'Status', 'Time'], ...transactions.map((item) => [item.id, item.player, item.type, item.method, item.amount, item.status, item.time])]));

  renderGameControls(); renderOverview(); renderPlayers(); renderTransactions(); renderQueue();
  const initialSection = (location.hash || '#overview').slice(1); showSection(document.getElementById(`section-${initialSection}`) ? initialSection : 'overview');
})();
