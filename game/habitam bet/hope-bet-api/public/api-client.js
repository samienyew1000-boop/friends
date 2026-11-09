(function () {
  "use strict";

  const cfg = () => window.HABTAM_BET_CONFIG || window.HOPE_BET_CONFIG || {};
  const apiUrl = () => String(cfg().API_URL || "").replace(/\/$/, "");

  function getToken() {
    return localStorage.getItem(cfg().TOKEN_KEY || "habtam-bet-token") || localStorage.getItem("hope-bet-token");
  }

  function setSession(token, user) {
    localStorage.setItem(cfg().TOKEN_KEY || "habtam-bet-token", token);
    localStorage.setItem("hope-bet-token", token);
    localStorage.setItem(cfg().USER_KEY || "habtam-bet-user", JSON.stringify(user || {}));
    localStorage.setItem("hope-bet-user", JSON.stringify(user || {}));
  }

  function clearSession() {
    localStorage.removeItem(cfg().TOKEN_KEY || "habtam-bet-token");
    localStorage.removeItem(cfg().USER_KEY || "habtam-bet-user");
    localStorage.removeItem("hope-bet-token");
    localStorage.removeItem("hope-bet-user");
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(cfg().USER_KEY || "habtam-bet-user") || localStorage.getItem("hope-bet-user") || "null");
    } catch {
      return null;
    }
  }

  function isEnabled() {
    if (typeof window !== "undefined" && window.location.protocol === "file:") {
      return Boolean(apiUrl());
    }
    return true;
  }

  async function request(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const base = apiUrl();
    const targetUrl = base ? `${base}${path}` : path;

    let res;
    try {
      res = await fetch(targetUrl, { ...options, headers });
    } catch {
      const err = new Error("Cannot reach Habtam Bet server. Wait 30 seconds and try again (free server may be waking up).");
      err.status = 0;
      throw err;
    }

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = { ok: false, error: "Invalid server response" };
    }
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function queryString(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        qs.append(key, String(value).trim());
      }
    });
    const query = qs.toString();
    return query ? `?${query}` : "";
  }

  async function register(payload) {
    const data = await request("/api/auth/register", { method: "POST", body: JSON.stringify(payload) });
    setSession(data.token, data.user);
    return data;
  }

  async function login(payload) {
    const data = await request("/api/auth/login", { method: "POST", body: JSON.stringify(payload) });
    setSession(data.token, data.user);
    return data;
  }

  async function fetchBalance() {
    return request("/api/wallet/balance");
  }

  async function placeBet(payload) {
    return request("/api/bets/place", { method: "POST", body: JSON.stringify(payload) });
  }

  async function fetchHistory() {
    return request("/api/bets/history");
  }

  async function devSettle(ticketId, won) {
    return request(`/api/bets/dev/settle/${encodeURIComponent(ticketId)}`, {
      method: "POST",
      body: JSON.stringify({ won }),
    });
  }

  async function settleTicket(ticketId) {
    return request(`/api/bets/settle/${encodeURIComponent(ticketId)}`, {
      method: "POST",
    });
  }

  async function fetchTicket(ticketId) {
    return request(`/api/bets/ticket/${encodeURIComponent(ticketId)}`);
  }

  async function bookBet(payload) {
    return request("/api/bets/book", { method: "POST", body: JSON.stringify(payload) });
  }

  async function fetchBookedBet(code) {
    return request(`/api/bets/book/${encodeURIComponent(code)}`);
  }

  async function fetchDailyResults(date, sport = "football") {
    const qDate = date || new Date().toISOString().slice(0, 10);
    return request(`/api/odds/results?date=${encodeURIComponent(qDate)}&sport=${encodeURIComponent(sport)}`);
  }

  async function fetchStandings(league = 39, season = 2026) {
    return request(`/api/odds/standings?league=${encodeURIComponent(league)}&season=${encodeURIComponent(season)}`);
  }

  async function fetchTeamFixtures(teamId, last = 10) {
    return request(`/api/odds/fixtures/team?team=${encodeURIComponent(teamId)}&last=${encodeURIComponent(last)}`);
  }

  async function fetchH2H(h2h, last = 10) {
    return request(`/api/odds/fixtures/h2h?h2h=${encodeURIComponent(h2h)}&last=${encodeURIComponent(last)}`);
  }

  async function fetchBetSettings() {
    return request("/api/bets/settings");
  }

  async function fetchDepositMethods() {
    return request("/api/deposits/methods");
  }

  async function requestDeposit(payload) {
    return request("/api/deposits/request", { method: "POST", body: JSON.stringify(payload) });
  }

  async function fetchDepositHistory() {
    return request("/api/deposits/history");
  }

  async function superAdminGetUsers() {
    return request("/api/super/users");
  }

  async function superAdminCreateUser(payload) {
    return request("/api/super/users", { method: "POST", body: JSON.stringify(payload) });
  }

  async function superAdminTopUp(userId, amount) {
    return request(`/api/super/users/${encodeURIComponent(userId)}/topup`, { method: "POST", body: JSON.stringify({ amount }) });
  }

  async function superAdminGetDashboard() {
    return request("/api/super/dashboard");
  }

  async function superAdminGetAdmins(params = {}) {
    return request(`/api/super/admins${queryString(params)}`);
  }

  async function superAdminGetShopDetail(adminId) {
    return request(`/api/super/admins/${encodeURIComponent(adminId)}`);
  }

  async function superAdminGetFinance() {
    return request("/api/super/finance");
  }

  async function superAdminGetTransactions(params = {}) {
    return request(`/api/super/transactions${queryString(params)}`);
  }

  async function superAdminGetDeposits(params = {}) {
    return request(`/api/super/deposits${queryString(params)}`);
  }

  async function superAdminGetTickets(params = {}) {
    return request(`/api/super/tickets${queryString(params)}`);
  }

  async function superAdminGetReports(params = {}) {
    return request(`/api/super/reports${queryString(params)}`);
  }

  async function superAdminGetAuditLogs(params = {}) {
    return request(`/api/super/audit${queryString(params)}`);
  }

  async function superAdminCreateAdmin(payload) {
    return request("/api/super/admins", { method: "POST", body: JSON.stringify(payload) });
  }

  async function superAdminTransferAdmin(adminId, payload) {
    return request(`/api/super/admins/${encodeURIComponent(adminId)}/transfer`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function superAdminChangeAdminPassword(adminId, password) {
    return request(`/api/super/admins/${encodeURIComponent(adminId)}/password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    });
  }

  async function superAdminSetAdminStatus(adminId, status) {
    return request(`/api/super/admins/${encodeURIComponent(adminId)}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
  }

  async function superAdminDeleteAdmin(adminId) {
    return request(`/api/super/admins/${encodeURIComponent(adminId)}`, {
      method: "DELETE",
    });
  }

  async function superAdminChangePassword(currentPassword, newPassword) {
    return request("/api/super/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  async function superAdminGetPlayers(params = {}) {
    return request(`/api/super/players${queryString(params)}`);
  }

  async function superAdminTransferPlayer(playerId, payload) {
    return request(`/api/super/players/${encodeURIComponent(playerId)}/transfer`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function superAdminSetPlayerStatus(playerId, status) {
    return request(`/api/super/players/${encodeURIComponent(playerId)}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
  }

  async function superAdminGetSettings() {
    return request("/api/super/settings");
  }

  async function superAdminSaveSettings(settings) {
    return request("/api/super/settings", {
      method: "POST",
      body: JSON.stringify(settings),
    });
  }

  async function superAdminGetBonusRules() {
    return request("/api/super/bonus-rules");
  }

  async function superAdminSaveBonusRule(payload) {
    return request("/api/super/bonus-rules", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function superAdminUpdateBonusRule(id, updates) {
    return request(`/api/super/bonus-rules/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  }

  async function superAdminDeleteBonusRule(id) {
    return request(`/api/super/bonus-rules/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  async function superAdminToggleBonus(enabled) {
    return request("/api/super/bonus-rules/toggle", {
      method: "POST",
      body: JSON.stringify({ enabled }),
    });
  }

  async function superAdminGetGameControls() {
    return request("/api/super/game-controls");
  }

  async function superAdminSaveGameControls(payload) {
    return request("/api/super/game-controls", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function superAdminSetGamePreset(preset) {
    return request("/api/super/game-controls/preset", {
      method: "POST",
      body: JSON.stringify({ preset }),
    });
  }

  async function superAdminToggleGame(gameId, enabled) {
    return request("/api/super/game-controls/toggle", {
      method: "POST",
      body: JSON.stringify({ gameId, enabled }),
    });
  }

  async function getPublicGameConfig() {
    return request("/api/games/config");
  }

  async function sysGetSuperAdmins() {
    return request("/api/sys/superadmins");
  }

  async function sysCreateSuperAdmin(payload) {
    return request("/api/sys/superadmins", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function sysChangeSuperAdminPassword(id, password) {
    return request(`/api/sys/superadmins/${encodeURIComponent(id)}/password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    });
  }

  async function sysSetSuperAdminStatus(id, status) {
    return request(`/api/sys/superadmins/${encodeURIComponent(id)}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
  }

  async function fetchFixtureScores(ids) {
    const q = Array.isArray(ids) ? ids.join("-") : ids;
    return request(`/api/odds/fixtures/scores?ids=${encodeURIComponent(q)}`);
  }

  async function fetchAdminDashboard() {
    return request("/api/admin/dashboard");
  }

  async function fetchAdminPlayers(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        qs.append(k, String(v).trim());
      }
    });
    const query = qs.toString();
    return request(`/api/admin/players${query ? `?${query}` : ""}`);
  }

  async function createAdminPlayer(payload) {
    return request("/api/admin/players", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function topUpPlayer(userId, amount) {
    return request(`/api/admin/players/${encodeURIComponent(userId)}/topup`, {
      method: "POST",
      body: JSON.stringify({ amount }),
    });
  }

  async function fetchAdminCoupons(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        qs.append(k, String(v).trim());
      }
    });
    const query = qs.toString();
    return request(`/api/admin/coupons${query ? `?${query}` : ""}`);
  }

  async function adminCancelCoupon(ticketId, reason) {
    return request(`/api/admin/coupons/${encodeURIComponent(ticketId)}/cancel`, {
      method: "POST",
      body: JSON.stringify(reason ? { reason } : {}),
    });
  }

  async function adminTransferFunds(userId, payload) {
    return request(`/api/admin/players/${encodeURIComponent(userId)}/transfer`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function fetchAdminTransactions(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        qs.append(k, String(v).trim());
      }
    });
    const query = qs.toString();
    return request(`/api/admin/transactions${query ? `?${query}` : ""}`);
  }

  async function fetchAdminBonusPayments(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        qs.append(k, String(v).trim());
      }
    });
    const query = qs.toString();
    return request(`/api/admin/bonus-payments${query ? `?${query}` : ""}`);
  }

  async function adminVoucherTransaction(payload) {
    return request("/api/admin/transactions/voucher", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function submitMatchResult(payload) {
    return request("/api/admin/match-result", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function fetchAdminTicket(ticketId) {
    return request(`/api/admin/tickets/${encodeURIComponent(ticketId)}`);
  }

  async function adminEditSettleTicket(ticketId, payload) {
    return request(`/api/admin/tickets/${encodeURIComponent(ticketId)}/edit-settle`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  window.HabtamBetAPI = {
    // Backwards-compatible alias
    HopeBetAPI: true,

    isEnabled,
    getToken,
    getUser,
    clearSession,
    register,
    login,
    fetchBalance,
    placeBet,
    fetchHistory,
    fetchFixtureScores,
    fetchDailyResults,
    fetchStandings,
    fetchTeamFixtures,
    fetchH2H,
    devSettle,
    settleTicket,
    fetchTicket,
    bookBet,
    fetchBookedBet,
    fetchDepositMethods,
    requestDeposit,
    fetchDepositHistory,
    superAdminGetUsers,
    superAdminCreateUser,
    superAdminTopUp,
    superAdminGetDashboard,
    superAdminGetAdmins,
    superAdminGetShopDetail,
    superAdminGetFinance,
    superAdminGetTransactions,
    superAdminGetDeposits,
    superAdminGetTickets,
    superAdminGetReports,
    superAdminGetAuditLogs,
    superAdminCreateAdmin,
    superAdminTransferAdmin,
    superAdminChangeAdminPassword,
    superAdminSetAdminStatus,
    superAdminDeleteAdmin,
    superAdminChangePassword,
    superAdminGetPlayers,
    superAdminTransferPlayer,
    superAdminSetPlayerStatus,
    superAdminGetSettings,
    superAdminSaveSettings,
    fetchBetSettings,
    superAdminGetBonusRules,
    superAdminSaveBonusRule,
    superAdminUpdateBonusRule,
    superAdminDeleteBonusRule,
    superAdminToggleBonus,
    superAdminGetGameControls,
    superAdminSaveGameControls,
    superAdminSetGamePreset,
    superAdminToggleGame,
    getPublicGameConfig,
    sysGetSuperAdmins,
    sysCreateSuperAdmin,
    sysChangeSuperAdminPassword,
    sysSetSuperAdminStatus,
    fetchAdminDashboard,
    fetchAdminPlayers,
    createAdminPlayer,
    topUpPlayer,
    adminTransferFunds,
    fetchAdminCoupons,
    adminCancelCoupon,
    fetchAdminTransactions,
    fetchAdminBonusPayments,
    adminVoucherTransaction,
    submitMatchResult,
    fetchAdminTicket,
    adminEditSettleTicket,
    apiUrl,
  };
})();

window.HopeBetAPI = window.HabtamBetAPI;
