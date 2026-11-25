/**
 * Friendes Game - Agent Dashboard Controller
 */
(function() {
  'use strict';

  const API_BASE = 'https://konjobetcom.et/bingo';

  // --- Telegram WebApp Setup ---
  if (window.Telegram && window.Telegram.WebApp) {
    try {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
      window.Telegram.WebApp.setHeaderColor('#0d1829');
      window.Telegram.WebApp.setBackgroundColor('#070d18');
    } catch(e) {}
  }

  // --- State ---
  const state = {
    agentId: null,
    agent: null,
    searchedPlayer: null,
    mode: 'deposit', // 'deposit' | 'withdraw'
    selectedAmount: 100,
    transactions: [],
    filter: 'all',
    isSubmitting: false
  };

  // --- DOM Elements ---
  const agentInfoText = document.getElementById('agentInfoText');
  const agentBalanceText = document.getElementById('agentBalanceText');
  const agentStatusBadge = document.getElementById('agentStatusBadge');
  const todayDepText = document.getElementById('todayDepText');
  const todayWithText = document.getElementById('todayWithText');
  const refreshBtn = document.getElementById('refreshBtn');
  const refreshIcon = document.getElementById('refreshIcon');
  const closeBtn = document.getElementById('closeBtn');

  const searchForm = document.getElementById('searchForm');
  const phoneInput = document.getElementById('phoneInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const searchSubmitBtn = document.getElementById('searchSubmitBtn');

  const playerCard = document.getElementById('playerCard');
  const playerAvatar = document.getElementById('playerAvatar');
  const playerNameText = document.getElementById('playerNameText');
  const playerPhoneText = document.getElementById('playerPhoneText');
  const playerBalText = document.getElementById('playerBalText');

  const tabDepositBtn = document.getElementById('tabDepositBtn');
  const tabWithdrawBtn = document.getElementById('tabWithdrawBtn');
  const amountChips = document.querySelectorAll('.amount-chip');
  const amountInput = document.getElementById('amountInput');
  const actionHintBox = document.getElementById('actionHintBox');
  const executeActionBtn = document.getElementById('executeActionBtn');
  const executeBtnText = document.getElementById('executeBtnText');

  const txCountBadge = document.getElementById('txCountBadge');
  const txList = document.getElementById('txList');
  const txFilters = document.querySelectorAll('.tx-filter');

  const confirmModal = document.getElementById('confirmModal');
  const modalIcon = document.getElementById('modalIcon');
  const modalTitle = document.getElementById('modalTitle');
  const modalDesc = document.getElementById('modalDesc');
  const modalTxType = document.getElementById('modalTxType');
  const modalPlayerName = document.getElementById('modalPlayerName');
  const modalPlayerPhone = document.getElementById('modalPlayerPhone');
  const modalAmount = document.getElementById('modalAmount');
  const modalCancelBtn = document.getElementById('modalCancelBtn');
  const modalConfirmBtn = document.getElementById('modalConfirmBtn');
  const modalConfirmBtnText = document.getElementById('modalConfirmBtnText');

  const toast = document.getElementById('toast');
  const toastInner = document.getElementById('toastInner');
  const toastIcon = document.getElementById('toastIcon');
  const toastMsg = document.getElementById('toastMsg');

  // --- Haptic Feedback Helper ---
  function triggerHaptic(type = 'light') {
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
      try {
        if (type === 'success' || type === 'error' || type === 'warning') {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred(type);
        } else {
          window.Telegram.WebApp.HapticFeedback.impactOccurred(type);
        }
      } catch (e) {}
    }
  }

  // --- Toast ---
  let toastTimer = null;
  function showToast(message, type = 'info') {
    if (toastTimer) clearTimeout(toastTimer);
    toastMsg.textContent = message;

    if (type === 'success') {
      toastIcon.textContent = '✅';
      toastInner.className = 'bg-emerald-900/90 border border-emerald-500 text-white text-xs px-4 py-3 rounded-xl shadow-2xl flex items-center space-x-2';
      triggerHaptic('success');
    } else if (type === 'error') {
      toastIcon.textContent = '❌';
      toastInner.className = 'bg-rose-950/90 border border-rose-500 text-white text-xs px-4 py-3 rounded-xl shadow-2xl flex items-center space-x-2';
      triggerHaptic('error');
    } else {
      toastIcon.textContent = 'ℹ️';
      toastInner.className = 'bg-slate-800 border border-slate-700 text-white text-xs px-4 py-3 rounded-xl shadow-2xl flex items-center space-x-2';
      triggerHaptic('light');
    }

    toast.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-4');
    toast.classList.add('opacity-100', 'translate-y-0');

    toastTimer = setTimeout(() => {
      toast.classList.remove('opacity-100', 'translate-y-0');
      toast.classList.add('opacity-0', 'pointer-events-none', 'translate-y-4');
    }, 3200);
  }

  // --- Init Identity ---
  function initAgentId() {
    const urlParams = new URLSearchParams(window.location.search);
    const qAgent = urlParams.get('agent_id') || urlParams.get('uid') || urlParams.get('id');
    const tgAgent = window.Telegram?.WebApp?.initDataUnsafe?.user?.id ? String(window.Telegram.WebApp.initDataUnsafe.user.id) : null;
    state.agentId = qAgent || tgAgent || localStorage.getItem('habtam_agent_id') || '8474256363';
    localStorage.setItem('habtam_agent_id', state.agentId);
  }

  // --- Fetch Agent Profile ---
  async function fetchAgentProfile() {
    if (!state.agentId) return;
    refreshIcon.classList.add('animate-spin');

    try {
      const res = await fetch(`${API_BASE}/api/agent/info?agent_id=${encodeURIComponent(state.agentId)}&_t=${Date.now()}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();

      if (data && data.ok && data.agent) {
        state.agent = data.agent;
        updateAgentUI();
      } else {
        // Fallback demo/admin display
        state.agent = {
          id: state.agentId,
          name: data?.name || 'Habtam Bet Agent',
          phone: data?.phone || '+251717482251',
          balance: Number(data?.balance ?? 10000.0),
          status: 'active',
          total_deposited: Number(data?.total_deposited ?? 0.0),
          total_withdrawn: Number(data?.total_withdrawn ?? 0.0)
        };
        updateAgentUI();
      }
    } catch (e) {
      console.warn('Failed to fetch agent profile from API, checking local storage:', e);
      if (!state.agent) {
        state.agent = {
          id: state.agentId,
          name: 'Habtam Bet Agent',
          phone: '+251717482251',
          balance: 10000.0,
          status: 'active',
          total_deposited: 0.0,
          total_withdrawn: 0.0
        };
        updateAgentUI();
      }
    } finally {
      setTimeout(() => refreshIcon.classList.remove('animate-spin'), 600);
    }
  }

  function updateAgentUI() {
    if (!state.agent) return;
    agentInfoText.textContent = `${state.agent.name || 'Agent'} (${state.agent.phone || state.agent.id})`;
    agentBalanceText.textContent = (state.agent.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    agentStatusBadge.textContent = state.agent.status === 'active' ? 'Active' : 'Suspended';
    agentStatusBadge.className = state.agent.status === 'active'
      ? 'px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
      : 'px-2 py-0.5 rounded-full text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30';

    todayDepText.textContent = `${(state.agent.total_deposited || 0).toFixed(2)} ETB`;
    todayWithText.textContent = `${(state.agent.total_withdrawn || 0).toFixed(2)} ETB`;

    updateActionBtn();
  }

  // --- Fetch Recent Transactions ---
  async function fetchRecentTransactions() {
    if (!state.agentId) return;
    try {
      const res = await fetch(`${API_BASE}/api/agent/transactions?agent_id=${encodeURIComponent(state.agentId)}&_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.transactions)) {
          state.transactions = data.transactions;
          renderTransactions();
        }
      }
    } catch(e) {}
  }

  function renderTransactions() {
    txCountBadge.textContent = `${state.transactions.length} Records`;
    let filtered = state.transactions;
    if (state.filter === 'deposit') {
      filtered = state.transactions.filter(t => t.type === 'deposit');
    } else if (state.filter === 'withdraw') {
      filtered = state.transactions.filter(t => t.type === 'withdraw');
    }

    if (!filtered || filtered.length === 0) {
      txList.innerHTML = `
        <div class="text-center py-8 text-slate-500 text-xs">
          እስካሁን የተመዘገበ ግብይት የለም።
        </div>
      `;
      return;
    }

    txList.innerHTML = filtered.map(tx => {
      const isDep = tx.type === 'deposit';
      const typeBadge = isDep
        ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">ገቢ (Dep)</span>'
        : '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">ወጪ (Wth)</span>';

      const amtSign = isDep ? '+' : '-';
      const amtColor = isDep ? 'text-emerald-400' : 'text-rose-400';
      const timeStr = tx.created_at || new Date(tx.timestamp ? tx.timestamp * 1000 : Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      return `
        <div class="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between hover:border-slate-700 transition-all">
          <div class="flex items-center space-x-2.5">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm ${isDep ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}">
              ${isDep ? '↓' : '↑'}
            </div>
            <div>
              <div class="flex items-center space-x-1.5">
                <span class="text-xs font-bold text-white">${tx.player_name || 'Player'}</span>
                ${typeBadge}
              </div>
              <span class="text-[10px] font-mono text-slate-400 block">${tx.player_phone || tx.player_id || ''} • ${timeStr}</span>
            </div>
          </div>
          <div class="text-right">
            <span class="text-xs font-black ${amtColor} block">${amtSign}${(tx.amount || 0).toFixed(2)} ETB</span>
            <span class="text-[9px] font-mono text-slate-500">${tx.id ? tx.id.slice(-8) : ''}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // --- Search Player ---
  async function searchPlayer(phoneQuery) {
    if (!phoneQuery || !phoneQuery.trim()) {
      showToast('እባክዎ የተጫዋች ስልክ ቁጥር ያስገቡ', 'error');
      phoneInput.focus();
      return;
    }

    const cleanPhone = phoneQuery.trim().replace(/[\s\-()]+/g, '');
    searchSubmitBtn.disabled = true;
    searchSubmitBtn.classList.add('opacity-75');

    try {
      const res = await fetch(`${API_BASE}/api/agent/search-player?phone=${encodeURIComponent(cleanPhone)}&_t=${Date.now()}`);
      const data = await res.json();

      if (data && data.ok && data.player) {
        state.searchedPlayer = data.player;
        displayPlayer(data.player);
        showToast(`ተጫዋች ተገኝቷል፦ ${data.player.name || data.player.first_name}`, 'success');
      } else {
        playerCard.classList.add('hidden');
        state.searchedPlayer = null;
        showToast('❌ ተጫዋች አልተገኘም! ስልክ ቁጥሩ በትክክል መመዝገቡን ያረጋግጡ።', 'error');
      }
    } catch(e) {
      console.warn('Player search fetch error, checking fallback:', e);
      showToast('የኔትወርክ ችግር አጋጥሟል፤ እባክዎ እንደገና ይሞክሩ።', 'error');
    } finally {
      searchSubmitBtn.disabled = false;
      searchSubmitBtn.classList.remove('opacity-75');
    }
  }

  function displayPlayer(player) {
    const dispName = player.name || player.first_name || `Player ${String(player.id).slice(-4)}`;
    playerNameText.textContent = dispName;
    playerPhoneText.textContent = player.phone || `ID: ${player.id}`;
    playerBalText.textContent = `${(Number(player.balance) || 0).toFixed(2)} ETB`;

    const initial = (dispName.trim()[0] || 'P').toUpperCase();
    playerAvatar.textContent = initial;

    playerCard.classList.remove('hidden');
    playerCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    updateActionBtn();
  }

  // --- Mode & Amount Selection ---
  function setMode(newMode) {
    state.mode = newMode;
    if (newMode === 'deposit') {
      tabDepositBtn.className = 'py-2 text-xs font-bold rounded-lg transition-all bg-emerald-500 text-slate-950 shadow-sm';
      tabWithdrawBtn.className = 'py-2 text-xs font-bold rounded-lg transition-all text-slate-400 hover:text-white';
      actionHintBox.className = 'p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/20 text-[11px] text-emerald-300';
      actionHintBox.innerHTML = '💡 <strong>ዲፖዚት ማሳሰቢያ፦</strong> ገንዘቡ ከእርስዎ የወኪል ባላንስ ተቀንሶ ለተጫዋቹ Real Balance ገቢ ይደረጋል።';
      executeActionBtn.className = 'w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold py-3 px-4 rounded-xl shadow-lg shadow-emerald-500/20 active:scale-[0.99] transition-all flex items-center justify-center space-x-2 text-sm';
    } else {
      tabWithdrawBtn.className = 'py-2 text-xs font-bold rounded-lg transition-all bg-rose-500 text-white shadow-sm';
      tabDepositBtn.className = 'py-2 text-xs font-bold rounded-lg transition-all text-slate-400 hover:text-white';
      actionHintBox.className = 'p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/20 text-[11px] text-rose-300';
      actionHintBox.innerHTML = '⚠️ <strong>ወጪ ማሳሰቢያ፦</strong> ገንዘቡ ከተጫዋቹ Real Balance ተቀንሶ ወደ እርስዎ ባላንስ ይገባል፤ ጥሬ ገንዘብ ለተጫዋቹ በእጅ ይሰጣሉ።';
      executeActionBtn.className = 'w-full bg-rose-500 hover:bg-rose-600 text-white font-extrabold py-3 px-4 rounded-xl shadow-lg shadow-rose-500/20 active:scale-[0.99] transition-all flex items-center justify-center space-x-2 text-sm';
    }
    updateActionBtn();
  }

  function setAmount(amt) {
    state.selectedAmount = Math.max(10, Number(amt));
    amountInput.value = state.selectedAmount;

    amountChips.forEach(chip => {
      if (Number(chip.dataset.amount) === state.selectedAmount) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });

    updateActionBtn();
  }

  function updateActionBtn() {
    const amt = state.selectedAmount || 100;
    const isDep = state.mode === 'deposit';
    if (isDep) {
      executeBtnText.textContent = `ለተጫዋቹ ${amt.toFixed(2)} ETB ገቢ አድርግ (Deposit)`;
    } else {
      executeBtnText.textContent = `ከተጫዋቹ ${amt.toFixed(2)} ETB ወጪ አድርግ (Withdraw)`;
    }
  }

  // --- Confirm Modal & Execution ---
  function openConfirmModal() {
    if (!state.searchedPlayer) {
      showToast('እባክዎ መጀመሪያ ተጫዋች በስልክ ቁጥር ይፈልጉ', 'error');
      return;
    }

    const amt = Number(state.selectedAmount);
    if (!amt || amt < 10) {
      showToast('ዝቅተኛው መጠን 10 ብር ነው!', 'error');
      amountInput.focus();
      return;
    }

    const agentBal = Number(state.agent?.balance || 0);
    const playerBal = Number(state.searchedPlayer?.balance || 0);

    if (state.mode === 'deposit') {
      if (amt > agentBal) {
        showToast(`የእርስዎ የወኪል ባላንስ በቂ አይደለም! ያለዎት: ${agentBal.toFixed(2)} ETB`, 'error');
        return;
      }
      modalIcon.textContent = '🟢';
      modalIcon.className = 'w-12 h-12 rounded-full mx-auto flex items-center justify-center text-xl bg-emerald-500/20 text-emerald-400';
      modalTitle.textContent = 'ገቢ ማድረጊያ ማረጋገጫ';
      modalDesc.textContent = 'ገንዘቡ ከእርስዎ ባላንስ ተቀንሶ ለተጫዋቹ ገቢ ይደረጋል።';
      modalTxType.textContent = 'ዲፖዚት (Deposit to Player)';
      modalTxType.className = 'font-bold text-emerald-400';
      modalAmount.className = 'font-extrabold text-emerald-400';
      modalConfirmBtn.className = 'py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-extrabold shadow-md transition-all flex items-center justify-center space-x-1';
      modalConfirmBtnText.textContent = 'ገቢ አድርግ (Confirm Deposit)';
    } else {
      if (amt > playerBal) {
        showToast(`ተጫዋቹ በቂ ባላንስ የለውም! የተጫዋቹ ባላንስ: ${playerBal.toFixed(2)} ETB`, 'error');
        return;
      }
      modalIcon.textContent = '🔴';
      modalIcon.className = 'w-12 h-12 rounded-full mx-auto flex items-center justify-center text-xl bg-rose-500/20 text-rose-400';
      modalTitle.textContent = 'ወጪ ማድረጊያ ማረጋገጫ';
      modalDesc.textContent = 'ገንዘቡ ከተጫዋቹ ተቀንሶ ለእርስዎ ገቢ ይሆናል፤ ጥሬ ገንዘብ በእጅ ይክፈሉ።';
      modalTxType.textContent = 'ወጪ (Withdraw from Player)';
      modalTxType.className = 'font-bold text-rose-400';
      modalAmount.className = 'font-extrabold text-rose-400';
      modalConfirmBtn.className = 'py-2.5 px-4 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-extrabold shadow-md transition-all flex items-center justify-center space-x-1';
      modalConfirmBtnText.textContent = 'ወጪ አድርግ (Confirm Payout)';
    }

    modalPlayerName.textContent = state.searchedPlayer.name || state.searchedPlayer.first_name || 'Player';
    modalPlayerPhone.textContent = state.searchedPlayer.phone || `ID: ${state.searchedPlayer.id}`;
    modalAmount.textContent = `${amt.toFixed(2)} ETB`;

    confirmModal.classList.remove('hidden');
    triggerHaptic('medium');
  }

  function closeConfirmModal() {
    confirmModal.classList.add('hidden');
  }

  async function executeTransaction() {
    if (state.isSubmitting) return;
    state.isSubmitting = true;
    modalConfirmBtn.disabled = true;
    modalConfirmBtnText.textContent = 'በማስኬድ ላይ...';

    const amt = Number(state.selectedAmount);
    const isDep = state.mode === 'deposit';
    const endpoint = isDep ? `${API_BASE}/api/agent/deposit` : `${API_BASE}/api/agent/withdraw`;

    const payload = {
      agent_id: String(state.agentId),
      player_id: String(state.searchedPlayer.id),
      player_phone: state.searchedPlayer.phone || '',
      player_name: state.searchedPlayer.name || state.searchedPlayer.first_name || '',
      amount: amt
    };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data && data.ok) {
        closeConfirmModal();
        triggerHaptic('success');

        // Update local balances
        if (typeof data.agent_balance === 'number') {
          state.agent.balance = data.agent_balance;
        } else {
          state.agent.balance += isDep ? -amt : amt;
        }

        if (typeof data.player_balance === 'number') {
          state.searchedPlayer.balance = data.player_balance;
        } else {
          state.searchedPlayer.balance += isDep ? amt : -amt;
        }

        if (isDep) {
          state.agent.total_deposited = (state.agent.total_deposited || 0) + amt;
        } else {
          state.agent.total_withdrawn = (state.agent.total_withdrawn || 0) + amt;
        }

        updateAgentUI();
        displayPlayer(state.searchedPlayer);

        // Prepend to transaction list
        const newTx = {
          id: data.tx_id || (isDep ? `AGT-DEP-${Date.now().toString().slice(-6)}` : `AGT-WTH-${Date.now().toString().slice(-6)}`),
          type: isDep ? 'deposit' : 'withdraw',
          player_id: state.searchedPlayer.id,
          player_name: state.searchedPlayer.name || state.searchedPlayer.first_name,
          player_phone: state.searchedPlayer.phone,
          amount: amt,
          created_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          timestamp: Math.floor(Date.now() / 1000)
        };
        state.transactions.unshift(newTx);
        renderTransactions();

        if (isDep) {
          showToast(`✅ ${amt.toFixed(2)} ETB ለተጫዋቹ በተሳካ ሁኔታ ገቢ ተደርጓል!`, 'success');
        } else {
          showToast(`✅ ${amt.toFixed(2)} ETB ከተጫዋቹ ወጪ ተደርጓል፤ ጥሬ ገንዘብ በእጅ ይክፈሉ!`, 'success');
        }

        // Send Telegram WebApp Data notification if available
        if (window.Telegram?.WebApp?.sendData) {
          try {
            window.Telegram.WebApp.sendData(JSON.stringify({
              action: isDep ? 'agent_deposit' : 'agent_withdraw',
              agent_id: state.agentId,
              player_id: state.searchedPlayer.id,
              amount: amt,
              tx_id: newTx.id
            }));
          } catch(e) {}
        }
      } else {
        throw new Error(data?.message || data?.error || 'Transaction failed');
      }
    } catch(err) {
      console.error('Agent transaction error:', err);
      showToast(`❌ ስህተት፦ ${err.message || 'ግብይቱን ማጠናቀቅ አልተቻለም'}`, 'error');
    } finally {
      state.isSubmitting = false;
      modalConfirmBtn.disabled = false;
      modalConfirmBtnText.textContent = isDep ? 'ገቢ አድርግ (Confirm Deposit)' : 'ወጪ አድርግ (Confirm Payout)';
    }
  }

  // --- Event Listeners ---
  function setupEventListeners() {
    refreshBtn.addEventListener('click', () => {
      triggerHaptic('light');
      fetchAgentProfile();
      fetchRecentTransactions();
      if (state.searchedPlayer && state.searchedPlayer.phone) {
        searchPlayer(state.searchedPlayer.phone);
      }
    });

    closeBtn.addEventListener('click', () => {
      if (window.Telegram?.WebApp?.close) {
        window.Telegram.WebApp.close();
      } else {
        window.history.back();
      }
    });

    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      searchPlayer(phoneInput.value);
    });

    phoneInput.addEventListener('input', () => {
      if (phoneInput.value.length > 0) {
        clearSearchBtn.classList.remove('hidden');
      } else {
        clearSearchBtn.classList.add('hidden');
      }
    });

    clearSearchBtn.addEventListener('click', () => {
      phoneInput.value = '';
      clearSearchBtn.classList.add('hidden');
      phoneInput.focus();
    });

    tabDepositBtn.addEventListener('click', () => {
      triggerHaptic('selection');
      setMode('deposit');
    });

    tabWithdrawBtn.addEventListener('click', () => {
      triggerHaptic('selection');
      setMode('withdraw');
    });

    amountChips.forEach(chip => {
      chip.addEventListener('click', () => {
        triggerHaptic('selection');
        setAmount(chip.dataset.amount);
      });
    });

    amountInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val) && val > 0) {
        state.selectedAmount = val;
        amountChips.forEach(c => c.classList.remove('active'));
        updateActionBtn();
      }
    });

    executeActionBtn.addEventListener('click', () => {
      openConfirmModal();
    });

    modalCancelBtn.addEventListener('click', () => {
      closeConfirmModal();
    });

    modalConfirmBtn.addEventListener('click', () => {
      executeTransaction();
    });

    txFilters.forEach(btn => {
      btn.addEventListener('click', () => {
        triggerHaptic('selection');
        txFilters.forEach(b => {
          b.className = 'tx-filter px-3 py-1 rounded-lg font-medium text-slate-400 hover:text-white';
        });
        btn.className = 'tx-filter px-3 py-1 rounded-lg font-bold bg-slate-800 text-white';
        state.filter = btn.dataset.filter;
        renderTransactions();
      });
    });
  }

  // --- Start Up ---
  initAgentId();
  setupEventListeners();
  setAmount(100);
  fetchAgentProfile();
  fetchRecentTransactions();

  // If phone is in query parameter, auto-search
  const qPhone = new URLSearchParams(window.location.search).get('phone');
  if (qPhone) {
    phoneInput.value = qPhone;
    clearSearchBtn.classList.remove('hidden');
    searchPlayer(qPhone);
  }
})();
