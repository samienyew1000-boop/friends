const express = require("express");
const bcrypt = require("bcryptjs");
const { superAdminRequired } = require("../middleware/auth");
const { withStore, loadStore, creditWallet, debitWallet, nextUserId, addAuditLog, defaultGameControls } = require("../db");

const router = express.Router();
router.use(superAdminRequired);

const ACTIVE_STATUSES = new Set(["active", "enabled", "open"]);
const ADMIN_ROLES = new Set(["admin"]);
const PLAYER_ROLES = new Set(["player", "", null, undefined]);

function nowIso() {
  return new Date().toISOString();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function money(value) {
  return Math.round(toNumber(value) * 100) / 100;
}

function statusOf(row) {
  return String(row && row.status ? row.status : "active").toLowerCase();
}

function isActive(row) {
  return ACTIVE_STATUSES.has(statusOf(row));
}

function userDisplayName(user) {
  if (!user) return "Unknown";
  return user.display_name || user.displayName || user.username || user.email || user.phone || `User #${user.id}`;
}

function walletOf(store, userId) {
  return (store.wallets && store.wallets[String(userId)]) || { user_id: userId, balance: 0, currency: "ETB", updated_at: null };
}

function parseSelections(ticket) {
  try {
    const list = typeof ticket.selections === "string" ? JSON.parse(ticket.selections) : ticket.selections;
    if (Array.isArray(list)) {
      return [...list].sort((a, b) => {
        const ta = a.kickoff ? new Date(a.kickoff).getTime() : 0;
        const tb = b.kickoff ? new Date(b.kickoff).getTime() : 0;
        return ta - tb;
      });
    }
  } catch (_) {}
  return [];
}

function ticketTime(ticket) {
  return ticket.placed_at || ticket.created_at || ticket.createdAt || null;
}

function inDateRange(rawDate, from, to) {
  if (!rawDate) return true;
  const ts = new Date(rawDate).getTime();
  if (!Number.isFinite(ts)) return true;
  if (from) {
    const fromTs = new Date(from).getTime();
    if (Number.isFinite(fromTs) && ts < fromTs) return false;
  }
  if (to) {
    const toTs = new Date(to).getTime();
    if (Number.isFinite(toTs) && ts > toTs + 86400000 - 1) return false;
  }
  return true;
}

function startOfTodayMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayKey(date) {
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return "Unknown";
  return d.toISOString().slice(0, 10);
}

function getPage(req, defaultLimit = 50, maxLimit = 250) {
  const page = Math.max(1, Math.floor(toNumber(req.query.page, 1)));
  const limit = Math.min(maxLimit, Math.max(1, Math.floor(toNumber(req.query.limit, defaultLimit))));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function paginate(items, req, defaultLimit = 50, maxLimit = 250) {
  const { page, limit, offset } = getPage(req, defaultLimit, maxLimit);
  const total = items.length;
  return {
    items: items.slice(offset, offset + limit),
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

function usersById(store) {
  const map = new Map();
  (store.users || []).forEach((u) => map.set(String(u.id), u));
  return map;
}

function adminsOnly(store) {
  return (store.users || []).filter((u) => ADMIN_ROLES.has(u.role));
}

function playersOnly(store) {
  return (store.users || []).filter((u) => PLAYER_ROLES.has(u.role));
}

function shopPlayerIds(store, adminId) {
  return new Set(playersOnly(store).filter((p) => String(p.created_by_admin_id) === String(adminId)).map((p) => String(p.id)));
}

function enrichAdmin(store, admin) {
  const wallet = walletOf(store, admin.id);
  const playerIds = shopPlayerIds(store, admin.id);
  const bets = (store.bets || []).filter((b) => playerIds.has(String(b.user_id)) || String(b.cashier_id) === String(admin.id));
  const stake = bets.reduce((sum, b) => sum + toNumber(b.stake), 0);
  const payout = bets.reduce((sum, b) => sum + (String(b.status || "").toLowerCase() === "won" ? toNumber(b.payout || b.potential_win) : 0), 0);
  const deposits = (store.deposits || []).filter((d) => playerIds.has(String(d.user_id)));
  const pendingDeposits = deposits.filter((d) => d.status === "pending").length;

  return {
    id: admin.id,
    username: admin.username,
    email: admin.email,
    phone: admin.phone || "—",
    displayName: userDisplayName(admin),
    role: admin.role,
    balance: money(wallet.balance),
    currency: wallet.currency || "ETB",
    playersCreated: playerIds.size,
    playersCount: playerIds.size,
    ticketsCount: bets.length,
    pendingDeposits,
    stake: money(stake),
    payout: money(payout),
    profit: money(stake - payout),
    createdAt: admin.created_at || nowIso(),
    updatedAt: admin.updated_at || null,
    status: statusOf(admin),
  };
}

function enrichPlayer(store, player, adminMap) {
  const wallet = walletOf(store, player.id);
  const bets = (store.bets || []).filter((b) => String(b.user_id) === String(player.id));
  const stake = bets.reduce((sum, b) => sum + toNumber(b.stake), 0);
  const payout = bets.reduce((sum, b) => sum + (String(b.status || "").toLowerCase() === "won" ? toNumber(b.payout || b.potential_win) : 0), 0);
  const creator = player.created_by_admin_id ? adminMap.get(String(player.created_by_admin_id)) : null;

  return {
    id: player.id,
    username: player.username || player.phone || player.email,
    name: userDisplayName(player),
    displayName: userDisplayName(player),
    phone: player.phone || "—",
    email: player.email || "—",
    role: player.role || "player",
    balance: money(wallet.balance),
    currency: wallet.currency || "ETB",
    betsCount: bets.length,
    stake: money(stake),
    payout: money(payout),
    profit: money(stake - payout),
    createdByAdminId: player.created_by_admin_id || null,
    createdByAdminName: creator ? userDisplayName(creator) : (player.created_by_admin_name || "Direct Registration"),
    createdAt: player.created_at || nowIso(),
    status: statusOf(player),
  };
}

function enrichDeposit(store, deposit, map = usersById(store)) {
  const user = map.get(String(deposit.user_id));
  const shop = user && user.created_by_admin_id ? map.get(String(user.created_by_admin_id)) : null;
  return {
    ...deposit,
    username: user ? (user.username || userDisplayName(user)) : `User #${deposit.user_id}`,
    userDisplayName: user ? userDisplayName(user) : `User #${deposit.user_id}`,
    userRole: user ? (user.role || "player") : "player",
    shopAdminId: shop ? shop.id : (user ? user.created_by_admin_id || null : null),
    shopAdminName: shop ? userDisplayName(shop) : (user ? user.created_by_admin_name || null : null),
  };
}

function enrichTransaction(store, tx, map = usersById(store)) {
  const user = map.get(String(tx.user_id));
  const meta = tx.meta || {};
  let relatedUser = null;
  if (meta.targetUserId) relatedUser = map.get(String(meta.targetUserId));
  if (!relatedUser && meta.fromUserId) relatedUser = map.get(String(meta.fromUserId));

  return {
    id: tx.id,
    userId: tx.user_id,
    username: user ? (user.username || userDisplayName(user)) : (tx.user_id ? `User #${tx.user_id}` : "System / Voucher"),
    displayName: user ? userDisplayName(user) : (tx.user_id ? `User #${tx.user_id}` : "System / Voucher"),
    userRole: user ? (user.role || "player") : null,
    type: tx.type,
    amount: Math.abs(toNumber(tx.amount)),
    signedAmount: money(tx.amount),
    isDebit: toNumber(tx.amount) < 0 || String(tx.type || "").toLowerCase().includes("withdraw"),
    balanceAfter: money(tx.balance_after),
    reference: tx.reference,
    meta,
    relatedUserId: relatedUser ? relatedUser.id : (meta.targetUserId || meta.fromUserId || null),
    relatedUsername: relatedUser ? (relatedUser.username || userDisplayName(relatedUser)) : null,
    createdAt: tx.created_at,
  };
}

function enrichTicket(store, ticket, map = usersById(store)) {
  const user = map.get(String(ticket.user_id));
  const cashier = map.get(String(ticket.cashier_id));
  const selections = parseSelections(ticket);
  const stake = toNumber(ticket.stake);
  const status = String(ticket.status || "open").toLowerCase();
  const payout = status === "won" ? toNumber(ticket.payout || ticket.potential_win) : toNumber(ticket.payout || 0);

  return {
    id: ticket.ticket_id || ticket.id,
    ticketId: ticket.ticket_id || ticket.id,
    cashierCode: ticket.cashier_code || null,
    userId: ticket.user_id,
    username: user ? (user.username || userDisplayName(user)) : `User #${ticket.user_id}`,
    userDisplayName: user ? userDisplayName(user) : `User #${ticket.user_id}`,
    userPhone: user ? (user.phone || "—") : "—",
    shopAdminId: user ? (user.created_by_admin_id || ticket.cashier_id || null) : (ticket.cashier_id || null),
    shopAdminName: cashier ? userDisplayName(cashier) : (user ? user.created_by_admin_name || null : null),
    cashierId: ticket.cashier_id || null,
    cashierName: cashier ? userDisplayName(cashier) : null,
    stake: money(stake),
    totalOdds: toNumber(ticket.total_odds, 1),
    potentialWin: money(ticket.potential_win),
    payout: money(payout),
    liability: status === "open" ? money(ticket.potential_win) : 0,
    profit: money(stake - payout),
    status,
    mode: ticket.mode || "multiple",
    placedAt: ticketTime(ticket) || nowIso(),
    selections,
    selectionCount: selections.length,
    bonusAwarded: money(ticket.bonus_awarded || ticket.bonusAmount || 0),
  };
}

function filterSearch(items, search, fields) {
  const q = String(search || "").trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => fields.some((field) => String(item[field] || "").toLowerCase().includes(q)));
}

function buildDashboard(store) {
  const admins = adminsOnly(store);
  const players = playersOnly(store);
  const tickets = store.bets || [];
  const deposits = store.deposits || [];
  const txs = store.transactions || [];
  const todayMs = startOfTodayMs();
  const userMap = usersById(store);

  const todayTickets = tickets.filter((b) => {
    const ts = new Date(ticketTime(b) || 0).getTime();
    return Number.isFinite(ts) && ts >= todayMs;
  });

  const totalStake = tickets.reduce((sum, b) => sum + toNumber(b.stake), 0);
  const totalPayout = tickets.reduce((sum, b) => {
    const status = String(b.status || "open").toLowerCase();
    return sum + (status === "won" ? toNumber(b.payout || b.potential_win) : toNumber(b.payout || 0));
  }, 0);
  const todayStake = todayTickets.reduce((sum, b) => sum + toNumber(b.stake), 0);
  const todayPayout = todayTickets.reduce((sum, b) => {
    const status = String(b.status || "open").toLowerCase();
    return sum + (status === "won" ? toNumber(b.payout || b.potential_win) : toNumber(b.payout || 0));
  }, 0);
  const exposure = tickets
    .filter((b) => String(b.status || "open").toLowerCase() === "open")
    .reduce((sum, b) => sum + toNumber(b.potential_win), 0);

  const adminWalletTotal = admins.reduce((sum, a) => sum + toNumber(walletOf(store, a.id).balance), 0);
  const playerWalletTotal = players.reduce((sum, p) => sum + toNumber(walletOf(store, p.id).balance), 0);
  const pendingDepositAmount = deposits.filter((d) => d.status === "pending").reduce((sum, d) => sum + toNumber(d.amount), 0);
  const approvedDepositAmount = deposits.filter((d) => d.status === "approved").reduce((sum, d) => sum + toNumber(d.amount), 0);
  const bonusPaid = txs
    .filter((t) => String(t.type || "").toLowerCase().includes("bonus"))
    .reduce((sum, t) => sum + Math.abs(toNumber(t.amount)), 0);

  const dailyMap = new Map();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    dailyMap.set(key, { date: key, stake: 0, payout: 0, deposits: 0, registrations: 0, tickets: 0 });
  }
  tickets.forEach((b) => {
    const key = dayKey(ticketTime(b));
    if (!dailyMap.has(key)) return;
    const row = dailyMap.get(key);
    row.stake += toNumber(b.stake);
    row.tickets += 1;
    if (String(b.status || "").toLowerCase() === "won") row.payout += toNumber(b.payout || b.potential_win);
  });
  deposits.forEach((d) => {
    const key = dayKey(d.created_at || d.reviewed_at);
    if (!dailyMap.has(key) || d.status !== "approved") return;
    dailyMap.get(key).deposits += toNumber(d.amount);
  });
  (store.users || []).forEach((u) => {
    const key = dayKey(u.created_at);
    if (!dailyMap.has(key)) return;
    dailyMap.get(key).registrations += 1;
  });

  const topShops = admins.map((a) => enrichAdmin(store, a)).sort((a, b) => b.profit - a.profit).slice(0, 8);
  const recentTickets = tickets.map((t) => enrichTicket(store, t, userMap)).sort((a, b) => new Date(b.placedAt) - new Date(a.placedAt)).slice(0, 8);
  const recentTransactions = txs.map((t) => enrichTransaction(store, t, userMap)).slice(0, 8);
  const pendingDeposits = deposits.filter((d) => d.status === "pending").map((d) => enrichDeposit(store, d, userMap)).slice(0, 8);

  return {
    summary: {
      totalShops: admins.length,
      activeShops: admins.filter(isActive).length,
      blockedShops: admins.filter((a) => !isActive(a)).length,
      totalPlayers: players.length,
      activePlayers: players.filter(isActive).length,
      totalTickets: tickets.length,
      openTickets: tickets.filter((b) => String(b.status || "open").toLowerCase() === "open").length,
      wonTickets: tickets.filter((b) => String(b.status || "").toLowerCase() === "won").length,
      lostTickets: tickets.filter((b) => String(b.status || "").toLowerCase() === "lost").length,
      totalStake: money(totalStake),
      totalPayout: money(totalPayout),
      grossProfit: money(totalStake - totalPayout),
      todayStake: money(todayStake),
      todayPayout: money(todayPayout),
      todayProfit: money(todayStake - todayPayout),
      exposure: money(exposure),
      adminWalletTotal: money(adminWalletTotal),
      playerWalletTotal: money(playerWalletTotal),
      pendingDeposits: deposits.filter((d) => d.status === "pending").length,
      pendingDepositAmount: money(pendingDepositAmount),
      approvedDepositAmount: money(approvedDepositAmount),
      bonusPaid: money(bonusPaid),
    },
    charts: {
      daily: Array.from(dailyMap.values()).map((row) => ({
        ...row,
        stake: money(row.stake),
        payout: money(row.payout),
        profit: money(row.stake - row.payout),
        deposits: money(row.deposits),
      })),
    },
    topShops,
    recentTickets,
    recentTransactions,
    pendingDeposits,
  };
}

function addAudit(actor, action, target, meta) {
  withStore((store) => addAuditLog(store, actor, action, target, meta));
}

// ==========================================
// CONTROL CENTER / DASHBOARD
// ==========================================

router.get("/dashboard", (_req, res) => {
  try {
    const store = loadStore();
    const dashboard = buildDashboard(store);
    res.json({ ok: true, dashboard, ...dashboard });
  } catch (err) {
    console.error("[super/dashboard]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// SHOP ADMIN MANAGEMENT
// ==========================================

router.get("/admins", (req, res) => {
  try {
    const store = loadStore();
    const { status, search } = req.query;
    let admins = adminsOnly(store).map((a) => enrichAdmin(store, a));

    if (status && status !== "all") admins = admins.filter((a) => a.status === String(status).toLowerCase());
    admins = filterSearch(admins, search, ["username", "displayName", "email", "phone", "status"]);
    admins.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const { items, pagination } = paginate(admins, req, 100, 500);
    res.json({ ok: true, admins: items, total: admins.length, pagination });
  } catch (err) {
    console.error("[super/admins]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/admins/:id", (req, res) => {
  try {
    const store = loadStore();
    const adminId = Number(req.params.id);
    const admin = adminsOnly(store).find((a) => Number(a.id) === adminId);
    if (!admin) return res.status(404).json({ ok: false, error: "Shop Admin not found" });

    const map = usersById(store);
    const playerIds = shopPlayerIds(store, adminId);
    const players = playersOnly(store).filter((p) => playerIds.has(String(p.id))).map((p) => enrichPlayer(store, p, map)).slice(0, 20);
    const tickets = (store.bets || []).filter((b) => playerIds.has(String(b.user_id)) || String(b.cashier_id) === String(adminId)).map((b) => enrichTicket(store, b, map)).slice(0, 20);
    const transactions = (store.transactions || []).filter((t) => String(t.user_id) === String(adminId) || playerIds.has(String(t.user_id)) || playerIds.has(String(t.meta && (t.meta.targetUserId || t.meta.fromUserId)))).map((t) => enrichTransaction(store, t, map)).slice(0, 20);
    const deposits = (store.deposits || []).filter((d) => playerIds.has(String(d.user_id))).map((d) => enrichDeposit(store, d, map)).slice(0, 20);

    res.json({ ok: true, admin: enrichAdmin(store, admin), players, tickets, transactions, deposits });
  } catch (err) {
    console.error("[super/admin-detail]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/admins", (req, res) => {
  try {
    const { username, password, displayName, phone, email, initialCredit } = req.body;
    const cleanUsername = String(username || "").trim();
    const cleanPassword = String(password || "");

    if (!cleanUsername) return res.status(400).json({ ok: false, error: "Admin username is required" });
    if (cleanPassword.length < 6) return res.status(400).json({ ok: false, error: "Password must be at least 6 characters" });

    let createdAdmin;
    let createdPlayer;
    withStore((store) => {
      if (store.users.some((u) => u.username && u.username.toLowerCase() === cleanUsername.toLowerCase())) {
        throw new Error("An account with this username already exists");
      }

      const newId = nextUserId(store);
      const cleanEmail = email ? String(email).trim().toLowerCase() : `${cleanUsername}@habtam.bet.local`;
      const name = displayName ? String(displayName).trim() : `Shop ${cleanUsername}`;

      createdAdmin = {
        id: newId,
        username: cleanUsername,
        display_name: name,
        email: cleanEmail,
        phone: phone ? String(phone).trim() : null,
        password_hash: bcrypt.hashSync(cleanPassword, 10),
        role: "admin",
        status: "active",
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      store.users.unshift(createdAdmin);
      store.wallets[String(newId)] = { user_id: newId, balance: 0, currency: "ETB", updated_at: nowIso() };

      const playerUsername = `${cleanUsername} player`;
      const playerId = nextUserId(store);
      createdPlayer = {
        id: playerId,
        username: playerUsername,
        display_name: `${cleanUsername} player`,
        email: `${cleanUsername}_player@habtambet.local`,
        phone: null,
        password_hash: bcrypt.hashSync(cleanPassword, 10),
        role: "player",
        status: "active",
        created_by_admin_id: createdAdmin.id,
        created_by_admin_name: createdAdmin.display_name || createdAdmin.username,
        created_at: nowIso(),
      };
      store.users.unshift(createdPlayer);
      store.wallets[String(playerId)] = { user_id: playerId, balance: 0, currency: "ETB", updated_at: nowIso() };
      addAuditLog(store, req.user, "shop.create", { type: "admin", id: createdAdmin.id }, { username: cleanUsername, defaultPlayerId: playerId });
    });

    const initAmount = toNumber(initialCredit, 0);
    if (initAmount > 0) {
      creditWallet(createdAdmin.id, initAmount, "super_grant", "SUPER_GRANT", { note: "Initial balance granted by Super Admin", actorId: req.user.id });
      addAudit(req.user, "shop.float.initial_credit", { type: "admin", id: createdAdmin.id }, { amount: initAmount });
    }

    const store = loadStore();
    const enriched = enrichAdmin(store, (store.users || []).find((u) => u.id === createdAdmin.id) || createdAdmin);
    res.json({
      ok: true,
      admin: enriched,
      defaultPlayer: createdPlayer ? enrichPlayer(store, createdPlayer, usersById(store)) : null,
      message: `Shop Admin '${createdAdmin.username}' and player '${cleanUsername} player' created successfully`,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post("/admins/:id/transfer", (req, res) => {
  try {
    const adminId = Number(req.params.id);
    const amount = toNumber(req.body.amount);
    const operation = String(req.body.operation || "deposit").toLowerCase();
    const reason = String(req.body.reason || "").trim() || (operation === "withdraw" ? "Withdrawal by Super Admin" : "Deposit by Super Admin");

    if (!amount || amount <= 0) return res.status(400).json({ ok: false, error: "Valid amount greater than 0 is required" });

    const store = loadStore();
    const adminUser = adminsOnly(store).find((u) => Number(u.id) === adminId);
    if (!adminUser) return res.status(404).json({ ok: false, error: "Shop Admin not found" });

    const newBalance = operation === "withdraw"
      ? debitWallet(adminId, amount, "super_withdraw", "SUPER_WITHDRAW", { note: reason, actorId: req.user.id })
      : creditWallet(adminId, amount, "super_deposit", "SUPER_DEPOSIT", { note: reason, actorId: req.user.id });

    addAudit(req.user, operation === "withdraw" ? "shop.float.withdraw" : "shop.float.deposit", { type: "admin", id: adminId }, { amount, reason, newBalance });

    res.json({ ok: true, adminId, amount, operation, newBalance, message: `${operation === "withdraw" ? "Withdrawal" : "Deposit"} of ${amount} ETB completed for Admin ${adminUser.username}` });
  } catch (err) {
    if (err.code === "INSUFFICIENT_BALANCE") return res.status(400).json({ ok: false, error: "Admin has insufficient balance for withdrawal" });
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/admins/:id/topup", (req, res) => {
  try {
    const adminId = Number(req.params.id);
    const amount = toNumber(req.body.amount);
    const reason = String(req.body.reason || "Deposit by Super Admin").trim();

    if (!amount || amount <= 0) {
      return res.status(400).json({ ok: false, error: "Valid amount greater than 0 is required" });
    }

    const store = loadStore();
    const adminUser = adminsOnly(store).find((u) => Number(u.id) === adminId);
    if (!adminUser) {
      return res.status(404).json({ ok: false, error: "Shop Admin not found" });
    }

    const newBalance = creditWallet(adminId, amount, "super_deposit", "SUPER_DEPOSIT", {
      note: reason,
      actorId: req.user.id,
    });

    addAudit(req.user, "shop.float.deposit", { type: "admin", id: adminId }, { amount, reason, newBalance });

    res.json({
      ok: true,
      adminId,
      amount,
      operation: "deposit",
      newBalance,
      message: `Deposit of ${amount} ETB completed for Admin ${adminUser.username}`,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/admins/:id/password", (req, res) => {
  try {
    const adminId = Number(req.params.id);
    const password = String(req.body.password || "").trim();
    if (!password || password.length < 6) return res.status(400).json({ ok: false, error: "Password must be at least 6 characters" });

    let adminUsername = "";
    withStore((store) => {
      const admin = adminsOnly(store).find((u) => Number(u.id) === adminId);
      if (!admin) throw new Error("Shop Admin not found");
      admin.password_hash = bcrypt.hashSync(password, 10);
      admin.updated_at = nowIso();
      adminUsername = admin.username;
      addAuditLog(store, req.user, "shop.password.change", { type: "admin", id: adminId }, { username: adminUsername });
    });

    res.json({ ok: true, adminId, message: `Password for Shop Admin '${adminUsername}' updated successfully` });
  } catch (err) {
    res.status(err.message === "Shop Admin not found" ? 404 : 400).json({ ok: false, error: err.message });
  }
});

router.post("/admins/:id/status", (req, res) => {
  try {
    const adminId = Number(req.params.id);
    let newStatus = req.body.status ? String(req.body.status).toLowerCase().trim() : null;
    const allowed = new Set(["active", "blocked", "suspended", "archived"]);
    let updatedAdmin = null;

    withStore((store) => {
      const admin = adminsOnly(store).find((u) => Number(u.id) === adminId);
      if (!admin) throw new Error("Shop Admin not found");
      if (!newStatus) newStatus = statusOf(admin) === "blocked" ? "active" : "blocked";
      if (!allowed.has(newStatus)) throw new Error("Invalid status. Allowed values: active, blocked, suspended, archived");
      const previousStatus = statusOf(admin);
      admin.status = newStatus;
      admin.updated_at = nowIso();
      updatedAdmin = { id: admin.id, username: admin.username, status: admin.status };
      addAuditLog(store, req.user, "shop.status.change", { type: "admin", id: adminId }, { previousStatus, newStatus });
    });

    res.json({ ok: true, admin: updatedAdmin, message: `Shop Admin '${updatedAdmin.username}' is now ${updatedAdmin.status.toUpperCase()}` });
  } catch (err) {
    res.status(err.message === "Shop Admin not found" ? 404 : 400).json({ ok: false, error: err.message });
  }
});

router.delete("/admins/:id", (req, res) => {
  try {
    const adminId = Number(req.params.id);
    let archivedUsername = "";

    withStore((store) => {
      const admin = adminsOnly(store).find((u) => Number(u.id) === adminId);
      if (!admin) throw new Error("Shop Admin not found");
      archivedUsername = admin.username;
      admin.status = "archived";
      admin.archived_at = nowIso();
      admin.updated_at = nowIso();
      addAuditLog(store, req.user, "shop.archive", { type: "admin", id: adminId }, { username: archivedUsername, note: "Soft archived; wallet and history preserved" });
    });

    res.json({ ok: true, adminId, archived: true, message: `Shop Admin '${archivedUsername}' archived successfully` });
  } catch (err) {
    res.status(err.message === "Shop Admin not found" ? 404 : 400).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GLOBAL PLAYER MANAGEMENT
// ==========================================

router.get("/players", (req, res) => {
  try {
    const store = loadStore();
    const { status, search } = req.query;
    const adminFilter = req.query.adminId ? Number(req.query.adminId) : null;
    const adminMap = usersById(store);
    let players = playersOnly(store).map((p) => enrichPlayer(store, p, adminMap));

    if (adminFilter) players = players.filter((p) => String(p.createdByAdminId) === String(adminFilter));
    if (status && status !== "all") players = players.filter((p) => p.status === String(status).toLowerCase());
    players = filterSearch(players, search || req.query.q, ["id", "username", "displayName", "name", "phone", "email", "createdByAdminName", "status"]);
    players.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const { items, pagination } = paginate(players, req, 100, 500);
    res.json({ ok: true, players: items, total: players.length, pagination });
  } catch (err) {
    console.error("[super/players]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/players/:id/transfer", (req, res) => {
  try {
    const playerId = Number(req.params.id);
    const amount = toNumber(req.body.amount);
    const operation = String(req.body.operation || "deposit").toLowerCase();
    const reason = String(req.body.reason || "").trim() || (operation === "withdraw" ? "Super Admin Withdrawal" : "Super Admin Deposit");

    if (!amount || amount <= 0) return res.status(400).json({ ok: false, error: "Valid amount greater than 0 is required" });

    const store = loadStore();
    const player = (store.users || []).find((u) => Number(u.id) === playerId);
    if (!player) return res.status(404).json({ ok: false, error: "Player not found" });
    if (["admin", "super_admin", "sys_core"].includes(player.role)) return res.status(400).json({ ok: false, error: "Use Shop Admin finance controls for admin accounts" });

    const newBalance = operation === "withdraw"
      ? debitWallet(playerId, amount, "super_player_withdraw", "SUPER_PLAYER_WITHDRAW", { note: reason, actorId: req.user.id })
      : creditWallet(playerId, amount, "super_player_deposit", "SUPER_PLAYER_DEPOSIT", { note: reason, actorId: req.user.id });

    addAudit(req.user, operation === "withdraw" ? "player.balance.withdraw" : "player.balance.deposit", { type: "player", id: playerId }, { amount, reason, newBalance });

    res.json({ ok: true, playerId, amount, operation, newBalance, message: `${operation === "withdraw" ? "Withdrawal" : "Deposit"} of ${amount} ETB completed for Player ${player.username || player.phone}` });
  } catch (err) {
    if (err.code === "INSUFFICIENT_BALANCE") return res.status(400).json({ ok: false, error: "Player has insufficient balance for withdrawal" });
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/players/:id/status", (req, res) => {
  try {
    const playerId = Number(req.params.id);
    const newStatus = String(req.body.status || "active").toLowerCase().trim();
    if (!["active", "blocked", "suspended"].includes(newStatus)) return res.status(400).json({ ok: false, error: "Invalid status" });
    let updated = null;
    withStore((store) => {
      const player = playersOnly(store).find((u) => Number(u.id) === playerId);
      if (!player) throw new Error("Player not found");
      const previousStatus = statusOf(player);
      player.status = newStatus;
      player.updated_at = nowIso();
      updated = { id: player.id, username: player.username, status: player.status };
      addAuditLog(store, req.user, "player.status.change", { type: "player", id: playerId }, { previousStatus, newStatus });
    });
    res.json({ ok: true, player: updated, message: `Player is now ${newStatus}` });
  } catch (err) {
    res.status(err.message === "Player not found" ? 404 : 400).json({ ok: false, error: err.message });
  }
});

// ==========================================
// FINANCE, DEPOSITS, TICKETS, REPORTS, AUDIT
// ==========================================

router.get("/finance", (_req, res) => {
  try {
    const store = loadStore();
    const dashboard = buildDashboard(store);
    const txs = store.transactions || [];
    const deposits = store.deposits || [];
    const byType = {};
    txs.forEach((t) => {
      const key = t.type || "unknown";
      if (!byType[key]) byType[key] = { type: key, count: 0, amount: 0 };
      byType[key].count += 1;
      byType[key].amount += Math.abs(toNumber(t.amount));
    });
    res.json({
      ok: true,
      finance: {
        summary: dashboard.summary,
        transactionTypes: Object.values(byType).map((r) => ({ ...r, amount: money(r.amount) })).sort((a, b) => b.amount - a.amount),
        deposits: {
          pending: deposits.filter((d) => d.status === "pending").length,
          approved: deposits.filter((d) => d.status === "approved").length,
          rejected: deposits.filter((d) => d.status === "rejected").length,
          approvedAmount: money(deposits.filter((d) => d.status === "approved").reduce((s, d) => s + toNumber(d.amount), 0)),
          pendingAmount: money(deposits.filter((d) => d.status === "pending").reduce((s, d) => s + toNumber(d.amount), 0)),
        },
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/transactions", (req, res) => {
  try {
    const store = loadStore();
    const { type, userId, from, to, search } = req.query;
    const map = usersById(store);
    let txs = (store.transactions || []).map((t) => enrichTransaction(store, t, map));

    if (type && type !== "all") txs = txs.filter((t) => String(t.type || "").toLowerCase().includes(String(type).toLowerCase()));
    if (userId) txs = txs.filter((t) => String(t.userId) === String(userId) || String(t.relatedUserId) === String(userId));
    if (from || to) txs = txs.filter((t) => inDateRange(t.createdAt, from, to));
    txs = filterSearch(txs, search, ["id", "username", "displayName", "type", "reference", "relatedUsername"]);
    txs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const { items, pagination } = paginate(txs, req, 100, 500);
    res.json({ ok: true, transactions: items, total: txs.length, pagination });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/deposits", (req, res) => {
  try {
    const store = loadStore();
    const { status, method, adminId, from, to, search } = req.query;
    const map = usersById(store);
    let rows = (store.deposits || []).map((d) => enrichDeposit(store, d, map));

    if (status && status !== "all") rows = rows.filter((d) => String(d.status) === String(status).toLowerCase());
    if (method && method !== "all") rows = rows.filter((d) => String(d.method) === String(method));
    if (adminId) rows = rows.filter((d) => String(d.shopAdminId) === String(adminId));
    if (from || to) rows = rows.filter((d) => inDateRange(d.created_at, from, to));
    rows = filterSearch(rows, search, ["id", "username", "userDisplayName", "reference", "method", "shopAdminName", "status"]);
    rows.sort((a, b) => new Date(b.created_at || b.reviewed_at || 0) - new Date(a.created_at || a.reviewed_at || 0));

    const { items, pagination } = paginate(rows, req, 100, 500);
    res.json({ ok: true, deposits: items, total: rows.length, pagination });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/tickets", (req, res) => {
  try {
    const store = loadStore();
    const { status, adminId, userId, from, to, search } = req.query;
    const map = usersById(store);
    let tickets = (store.bets || []).map((b) => enrichTicket(store, b, map));

    if (status && status !== "all") tickets = tickets.filter((t) => t.status === String(status).toLowerCase());
    if (adminId) tickets = tickets.filter((t) => String(t.shopAdminId) === String(adminId) || String(t.cashierId) === String(adminId));
    if (userId) tickets = tickets.filter((t) => String(t.userId) === String(userId));
    if (from || to) tickets = tickets.filter((t) => inDateRange(t.placedAt, from, to));
    tickets = filterSearch(tickets, search, ["ticketId", "cashierCode", "username", "userDisplayName", "userPhone", "shopAdminName", "status"]);
    tickets.sort((a, b) => new Date(b.placedAt) - new Date(a.placedAt));

    const { items, pagination } = paginate(tickets, req, 100, 500);
    res.json({ ok: true, tickets: items, coupons: items, total: tickets.length, pagination });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/reports", (req, res) => {
  try {
    const store = loadStore();
    const { from, to } = req.query;
    const map = usersById(store);
    const tickets = (store.bets || []).map((b) => enrichTicket(store, b, map)).filter((t) => inDateRange(t.placedAt, from, to));
    const deposits = (store.deposits || []).map((d) => enrichDeposit(store, d, map)).filter((d) => inDateRange(d.created_at, from, to));
    const txs = (store.transactions || []).map((t) => enrichTransaction(store, t, map)).filter((t) => inDateRange(t.createdAt, from, to));

    const byDay = new Map();
    tickets.forEach((t) => {
      const key = dayKey(t.placedAt);
      if (!byDay.has(key)) byDay.set(key, { date: key, stake: 0, payout: 0, profit: 0, tickets: 0, deposits: 0 });
      const row = byDay.get(key);
      row.stake += t.stake;
      row.payout += t.payout;
      row.profit += t.profit;
      row.tickets += 1;
    });
    deposits.filter((d) => d.status === "approved").forEach((d) => {
      const key = dayKey(d.created_at);
      if (!byDay.has(key)) byDay.set(key, { date: key, stake: 0, payout: 0, profit: 0, tickets: 0, deposits: 0 });
      byDay.get(key).deposits += toNumber(d.amount);
    });

    const shopRows = adminsOnly(store).map((a) => enrichAdmin(store, a)).sort((a, b) => b.profit - a.profit);

    res.json({
      ok: true,
      reports: {
        summary: {
          stake: money(tickets.reduce((s, t) => s + t.stake, 0)),
          payout: money(tickets.reduce((s, t) => s + t.payout, 0)),
          profit: money(tickets.reduce((s, t) => s + t.profit, 0)),
          deposits: money(deposits.filter((d) => d.status === "approved").reduce((s, d) => s + toNumber(d.amount), 0)),
          withdrawals: money(txs.filter((t) => t.isDebit).reduce((s, t) => s + t.amount, 0)),
          tickets: tickets.length,
        },
        daily: Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({ ...r, stake: money(r.stake), payout: money(r.payout), profit: money(r.profit), deposits: money(r.deposits) })),
        shops: shopRows,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/audit", (req, res) => {
  try {
    const store = loadStore();
    const { action, actor, search, from, to } = req.query;
    let rows = Array.isArray(store.auditLogs) ? [...store.auditLogs] : [];

    if (action && action !== "all") rows = rows.filter((r) => String(r.action || "").toLowerCase().includes(String(action).toLowerCase()));
    if (actor) rows = rows.filter((r) => String(r.actor_id) === String(actor) || String(r.actor_username || "").toLowerCase().includes(String(actor).toLowerCase()));
    if (from || to) rows = rows.filter((r) => inDateRange(r.created_at, from, to));
    rows = filterSearch(rows, search, ["id", "actor_username", "actor_role", "action"]);
    rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const { items, pagination } = paginate(rows, req, 100, 500);
    res.json({ ok: true, auditLogs: items, logs: items, total: rows.length, pagination });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// SETTINGS + BONUS SYSTEM
// ==========================================

router.get("/settings", (_req, res) => {
  try {
    const store = loadStore();
    res.json({ ok: true, settings: store.settings || {} });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/settings", (req, res) => {
  try {
    const { telebirr_receiver, cbe_receiver, min_deposit, max_deposit, max_win, bonus_enabled, bonus_min_odd_per_leg, bonus_rules } = req.body;
    const maxWinVal = max_win !== undefined ? max_win : req.body.maxWin;
    const updated = withStore((store) => {
      if (!store.settings) store.settings = {};
      const before = { ...store.settings };
      if (telebirr_receiver !== undefined) store.settings.telebirr_receiver = String(telebirr_receiver).trim();
      if (cbe_receiver !== undefined) store.settings.cbe_receiver = String(cbe_receiver).trim();
      if (min_deposit !== undefined) store.settings.min_deposit = toNumber(min_deposit, 100);
      if (max_deposit !== undefined) store.settings.max_deposit = toNumber(max_deposit, 75000);
      if (maxWinVal !== undefined) store.settings.max_win = Math.max(1000, toNumber(maxWinVal, 500000));
      if (bonus_enabled !== undefined) store.settings.bonus_enabled = Boolean(bonus_enabled);
      if (bonus_min_odd_per_leg !== undefined) store.settings.bonus_min_odd_per_leg = toNumber(bonus_min_odd_per_leg, 1.15);
      if (Array.isArray(bonus_rules)) store.settings.bonus_rules = bonus_rules;
      addAuditLog(store, req.user, "settings.update", { type: "settings", id: "platform" }, { before, after: store.settings });
      return store.settings;
    });
    res.json({ ok: true, settings: updated, message: "Platform settings updated successfully" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GAME PROFIT & RTP CONTROL ENDPOINTS
// ==========================================
router.get("/game-controls", (_req, res) => {
  try {
    const store = loadStore();
    const defaults = defaultGameControls();
    const raw = store.game_controls || defaults;

    // Calculate live game analytics
    const games = { ...defaults.games, ...(raw.games || {}) };
    let totalTurnover = 0;
    let totalPayout = 0;
    let totalRounds = 0;

    for (const g of Object.values(games)) {
      if (g.stats) {
        totalTurnover += Number(g.stats.totalTurnover) || 0;
        totalPayout += Number(g.stats.totalPayout) || 0;
        totalRounds += Number(g.stats.roundsPlayed) || 0;
      }
    }
    const netProfit = Math.round((totalTurnover - totalPayout) * 100) / 100;
    const realizedMargin = totalTurnover > 0 ? Math.round(((totalTurnover - totalPayout) / totalTurnover) * 1000) / 10 : (raw.global?.globalMargin || 10.0);
    const realizedRtp = Math.round((100 - realizedMargin) * 10) / 10;

    const responseData = {
      global: { ...defaults.global, ...(raw.global || {}) },
      games,
      summary: {
        totalTurnover: Math.round(totalTurnover * 100) / 100,
        totalPayout: Math.round(totalPayout * 100) / 100,
        netProfit,
        realizedMargin,
        realizedRtp,
        totalRounds,
      },
      updatedAt: raw.updatedAt || new Date().toISOString(),
    };

    res.json({ ok: true, gameControls: responseData, data: responseData });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/game-controls", (req, res) => {
  try {
    const { global, games } = req.body;
    const updated = withStore((store) => {
      const defaults = defaultGameControls();
      if (!store.game_controls) store.game_controls = defaults;
      const before = JSON.parse(JSON.stringify(store.game_controls));

      if (global && typeof global === "object") {
        if (global.maintenanceMode !== undefined) store.game_controls.global.maintenanceMode = Boolean(global.maintenanceMode);
        if (global.globalMargin !== undefined) {
          const margin = Math.min(50, Math.max(1, Number(global.globalMargin) || 10));
          store.game_controls.global.globalMargin = margin;
          store.game_controls.global.globalRtp = Math.round((100 - margin) * 10) / 10;
        }
        if (global.globalRtp !== undefined) {
          const rtp = Math.min(99, Math.max(50, Number(global.globalRtp) || 90));
          store.game_controls.global.globalRtp = rtp;
          store.game_controls.global.globalMargin = Math.round((100 - rtp) * 10) / 10;
        }
        if (global.maxPayoutPerRound !== undefined) {
          store.game_controls.global.maxPayoutPerRound = Math.max(100, Number(global.maxPayoutPerRound) || 50000);
        }
        if (global.autoProfitProtection !== undefined) {
          store.game_controls.global.autoProfitProtection = Boolean(global.autoProfitProtection);
        }
      }

      if (games && typeof games === "object") {
        for (const [gid, patch] of Object.entries(games)) {
          if (!store.game_controls.games[gid]) {
            store.game_controls.games[gid] = defaults.games[gid] || { id: gid, enabled: true };
          }
          const target = store.game_controls.games[gid];
          if (patch.enabled !== undefined) target.enabled = Boolean(patch.enabled);
          if (patch.targetMargin !== undefined) {
            const m = Math.min(60, Math.max(1, Number(patch.targetMargin) || 10));
            target.targetMargin = m;
            target.rtp = Math.round((100 - m) * 10) / 10;
          }
          if (patch.rtp !== undefined) {
            const r = Math.min(99, Math.max(40, Number(patch.rtp) || 90));
            target.rtp = r;
            target.targetMargin = Math.round((100 - r) * 10) / 10;
          }
          if (patch.earlyCrashRate !== undefined) target.earlyCrashRate = Math.min(75, Math.max(1, Number(patch.earlyCrashRate) || 15));
          if (patch.maxMultiplier !== undefined) target.maxMultiplier = Math.min(10000, Math.max(2, Number(patch.maxMultiplier) || 100));
          if (patch.volatility !== undefined) target.volatility = String(patch.volatility);
          if (patch.minBet !== undefined) target.minBet = Math.max(0.1, Number(patch.minBet) || 1);
          if (patch.maxBet !== undefined) target.maxBet = Math.max(target.minBet || 1, Number(patch.maxBet) || 5000);
          if (patch.maxWin !== undefined) target.maxWin = Math.max(100, Number(patch.maxWin) || 25000);
          if (patch.crashSpeedFactor !== undefined) target.crashSpeedFactor = Number(patch.crashSpeedFactor) || 1.2;
          if (patch.bonusStarFrequency !== undefined) target.bonusStarFrequency = String(patch.bonusStarFrequency);
          if (patch.goldenRingChance !== undefined) target.goldenRingChance = Number(patch.goldenRingChance) || 0.05;
        }
      }

      store.game_controls.updatedAt = new Date().toISOString();
      addAuditLog(store, req.user, "game_controls.update", { type: "game_controls", id: "all" }, { before, after: store.game_controls });
      return store.game_controls;
    });

    res.json({ ok: true, gameControls: updated, message: "Game profit controls saved successfully" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/game-controls/preset", (req, res) => {
  try {
    const { preset } = req.body;
    const updated = withStore((store) => {
      const defaults = defaultGameControls();
      if (!store.game_controls) store.game_controls = defaults;
      const before = JSON.parse(JSON.stringify(store.game_controls));

      if (preset === "high_profit") {
        store.game_controls.global.globalMargin = 18.0;
        store.game_controls.global.globalRtp = 82.0;
        for (const g of Object.values(store.game_controls.games)) {
          g.targetMargin = 18.0;
          g.rtp = 82.0;
          if (g.id === "aviator") { g.earlyCrashRate = 25.0; g.maxMultiplier = 50.0; g.volatility = "house_favor"; }
          if (g.id === "jet_x") { g.earlyCrashRate = 25.0; g.maxMultiplier = 50.0; g.volatility = "house_favor"; }
          if (g.id === "multihot5") { g.maxMultiplier = 500.0; g.volatility = "house_favor"; }
          if (g.id === "chicken_road") { g.crashSpeedFactor = 1.4; }
          if (g.id === "bingo") { g.targetMargin = 20.0; g.rtp = 80.0; }
        }
      } else if (preset === "promo") {
        store.game_controls.global.globalMargin = 4.0;
        store.game_controls.global.globalRtp = 96.0;
        for (const g of Object.values(store.game_controls.games)) {
          g.targetMargin = 4.0;
          g.rtp = 96.0;
          if (g.id === "aviator") { g.earlyCrashRate = 6.0; g.maxMultiplier = 250.0; g.volatility = "player_favor"; }
          if (g.id === "jet_x") { g.earlyCrashRate = 6.0; g.maxMultiplier = 500.0; g.volatility = "player_favor"; }
          if (g.id === "multihot5") { g.maxMultiplier = 2000.0; g.volatility = "player_favor"; }
          if (g.id === "chicken_road") { g.crashSpeedFactor = 1.0; }
          if (g.id === "bingo") { g.targetMargin = 8.0; g.rtp = 92.0; }
        }
      } else {
        // Balanced (default)
        store.game_controls.global.globalMargin = 10.0;
        store.game_controls.global.globalRtp = 90.0;
        for (const g of Object.values(store.game_controls.games)) {
          g.targetMargin = g.id === "bingo" ? 15.0 : 10.0;
          g.rtp = 100.0 - g.targetMargin;
          if (g.id === "aviator") { g.earlyCrashRate = 15.0; g.maxMultiplier = 100.0; g.volatility = "medium"; }
          if (g.id === "jet_x") { g.earlyCrashRate = 15.0; g.maxMultiplier = 250.0; g.volatility = "medium"; }
          if (g.id === "multihot5") { g.maxMultiplier = 1000.0; g.volatility = "medium"; }
          if (g.id === "chicken_road") { g.crashSpeedFactor = 1.2; }
        }
      }

      store.game_controls.updatedAt = new Date().toISOString();
      addAuditLog(store, req.user, "game_controls.preset", { type: "game_controls", preset }, { before, after: store.game_controls });
      return store.game_controls;
    });

    res.json({ ok: true, gameControls: updated, message: `Applied ${preset} profit preset` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/game-controls/toggle", (req, res) => {
  try {
    const { gameId, enabled } = req.body;
    if (!gameId) return res.status(400).json({ ok: false, error: "Missing gameId" });

    const updated = withStore((store) => {
      const defaults = defaultGameControls();
      if (!store.game_controls) store.game_controls = defaults;
      if (!store.game_controls.games[gameId]) {
        store.game_controls.games[gameId] = defaults.games[gameId] || { id: gameId, enabled: true };
      }
      const target = store.game_controls.games[gameId];
      const previous = target.enabled !== false;
      target.enabled = enabled !== undefined ? Boolean(enabled) : !previous;
      store.game_controls.updatedAt = new Date().toISOString();
      addAuditLog(store, req.user, "game_controls.toggle", { type: "game", id: gameId }, { previous, enabled: target.enabled });
      return store.game_controls;
    });

    res.json({ ok: true, gameControls: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/bonus-rules", (_req, res) => {
  try {
    const store = loadStore();
    const s = store.settings || {};
    const rules = Array.isArray(s.bonus_rules) ? s.bonus_rules : [];
    const enabled = s.bonus_enabled !== false;
    res.json({ ok: true, enabled, bonus_enabled: enabled, minOddPerLeg: s.bonus_min_odd_per_leg || 1.15, bonus_min_odd_per_leg: s.bonus_min_odd_per_leg || 1.15, rules, bonus_rules: rules });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/bonus-rules", (req, res) => {
  try {
    const { rules, bonus_enabled, bonus_min_odd_per_leg } = req.body;
    const rawRule = req.body.rule || (req.body.name || req.body.minTeams ? req.body : null);
    let savedRule = null;
    const updated = withStore((store) => {
      if (!store.settings) store.settings = {};
      if (bonus_enabled !== undefined) store.settings.bonus_enabled = Boolean(bonus_enabled);
      if (bonus_min_odd_per_leg !== undefined) store.settings.bonus_min_odd_per_leg = toNumber(bonus_min_odd_per_leg, 1.15);
      if (!Array.isArray(store.settings.bonus_rules)) store.settings.bonus_rules = [];

      if (Array.isArray(rules)) {
        store.settings.bonus_rules = rules;
      } else if (rawRule && typeof rawRule === "object") {
        const id = rawRule.id || `rule_${Date.now()}`;
        const minOdds = rawRule.minOdds != null && rawRule.minOdds !== "" ? toNumber(rawRule.minOdds) : null;
        const maxOdds = rawRule.maxOdds != null && rawRule.maxOdds !== "" ? toNumber(rawRule.maxOdds) : null;
        const percent = rawRule.percent != null && rawRule.percent !== "" 
          ? toNumber(rawRule.percent) 
          : (rawRule.multiplier != null ? toNumber(rawRule.multiplier) * 100 : 100);
        const multiplier = rawRule.multiplier != null && rawRule.multiplier !== "" 
          ? toNumber(rawRule.multiplier) 
          : (percent / 100);
        const failedCount = toNumber(rawRule.failedCount, 1);
        const defaultName = minOdds != null ? `${minOdds}${maxOdds ? ' - ' + maxOdds : '+'} Odd (Cut ${failedCount})` : `${rawRule.minTeams || 7}+ Teams (Cut ${failedCount})`;

        savedRule = {
          id,
          name: String(rawRule.name || defaultName),
          failedCount,
          minTeams: toNumber(rawRule.minTeams, 7),
          maxTeams: rawRule.maxTeams != null && rawRule.maxTeams !== "" ? toNumber(rawRule.maxTeams) : null,
          minOdds,
          maxOdds,
          percent,
          multiplier,
          minOddPerLeg: toNumber(rawRule.minOddPerLeg, store.settings.bonus_min_odd_per_leg || 1.15),
          enabled: rawRule.enabled !== false,
        };
        const existingIdx = store.settings.bonus_rules.findIndex((r) => String(r.id) === String(id));
        if (existingIdx >= 0) store.settings.bonus_rules[existingIdx] = savedRule;
        else store.settings.bonus_rules.push(savedRule);
      }
      addAuditLog(store, req.user, "bonus.rule.save", { type: "bonus_rule", id: savedRule ? savedRule.id : "bulk" }, { savedRule, count: store.settings.bonus_rules.length });
      return store.settings;
    });
    res.json({ ok: true, rule: savedRule, rules: updated.bonus_rules, bonus_rules: updated.bonus_rules, settings: updated, message: "Bonus rules updated successfully" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put("/bonus-rules/:id", (req, res) => {
  try {
    const ruleId = String(req.params.id);
    const updates = req.body;
    let allRules = [];
    const updated = withStore((store) => {
      if (!store.settings || !Array.isArray(store.settings.bonus_rules)) throw new Error("No bonus rules configured");
      const idx = store.settings.bonus_rules.findIndex((r) => String(r.id) === ruleId);
      if (idx < 0) throw new Error("Bonus rule not found");
      const existing = store.settings.bonus_rules[idx];

      const percent = updates.percent !== undefined 
        ? toNumber(updates.percent) 
        : (updates.multiplier !== undefined ? toNumber(updates.multiplier) * 100 : (existing.percent !== undefined ? existing.percent : (existing.multiplier ? existing.multiplier * 100 : 100)));
      const multiplier = updates.multiplier !== undefined 
        ? toNumber(updates.multiplier) 
        : (updates.percent !== undefined ? toNumber(updates.percent) / 100 : existing.multiplier);

      store.settings.bonus_rules[idx] = {
        ...existing,
        ...updates,
        failedCount: updates.failedCount !== undefined ? toNumber(updates.failedCount) : existing.failedCount,
        minTeams: updates.minTeams !== undefined ? toNumber(updates.minTeams) : (existing.minTeams !== undefined ? existing.minTeams : 7),
        maxTeams: updates.maxTeams !== undefined ? (updates.maxTeams === null || updates.maxTeams === "" ? null : toNumber(updates.maxTeams)) : existing.maxTeams,
        minOdds: updates.minOdds !== undefined ? (updates.minOdds === null || updates.minOdds === "" ? null : toNumber(updates.minOdds)) : existing.minOdds,
        maxOdds: updates.maxOdds !== undefined ? (updates.maxOdds === null || updates.maxOdds === "" ? null : toNumber(updates.maxOdds)) : existing.maxOdds,
        percent,
        multiplier,
        minOddPerLeg: updates.minOddPerLeg !== undefined ? toNumber(updates.minOddPerLeg) : existing.minOddPerLeg,
        enabled: updates.enabled !== undefined ? Boolean(updates.enabled) : existing.enabled,
      };
      allRules = store.settings.bonus_rules;
      addAuditLog(store, req.user, "bonus.rule.update", { type: "bonus_rule", id: ruleId }, { before: existing, after: store.settings.bonus_rules[idx] });
      return store.settings.bonus_rules[idx];
    });
    res.json({ ok: true, rule: updated, rules: allRules, bonus_rules: allRules, message: "Bonus rule updated successfully" });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.delete("/bonus-rules/:id", (req, res) => {
  try {
    const ruleId = String(req.params.id);
    let remaining = [];
    withStore((store) => {
      if (!store.settings || !Array.isArray(store.settings.bonus_rules)) return;
      const before = store.settings.bonus_rules.find((r) => String(r.id) === ruleId) || null;
      store.settings.bonus_rules = store.settings.bonus_rules.filter((r) => String(r.id) !== ruleId);
      remaining = store.settings.bonus_rules;
      addAuditLog(store, req.user, "bonus.rule.delete", { type: "bonus_rule", id: ruleId }, { before });
    });
    res.json({ ok: true, rules: remaining, bonus_rules: remaining, message: "Bonus rule deleted successfully" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/bonus-rules/toggle", (req, res) => {
  try {
    const { enabled } = req.body;
    const updated = withStore((store) => {
      if (!store.settings) store.settings = {};
      const previous = store.settings.bonus_enabled !== false;
      store.settings.bonus_enabled = enabled !== undefined ? Boolean(enabled) : !previous;
      addAuditLog(store, req.user, "bonus.toggle", { type: "settings", id: "bonus_enabled" }, { previous, enabled: store.settings.bonus_enabled });
      return store.settings.bonus_enabled;
    });
    res.json({ ok: true, enabled: updated, bonus_enabled: updated, message: `Bonus system ${updated ? "enabled" : "disabled"}` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// SECURITY / ACCOUNT / LEGACY COMPATIBILITY
// ==========================================

router.post("/change-password", (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const cleanNewPassword = String(newPassword || "").trim();
    if (!cleanNewPassword || cleanNewPassword.length < 6) return res.status(400).json({ ok: false, error: "New password must be at least 6 characters" });

    const store = loadStore();
    const superUser = (store.users || []).find((u) => Number(u.id) === Number(req.user.id));
    if (!superUser) return res.status(404).json({ ok: false, error: "Super Admin account not found" });
    if (superUser.password_hash && currentPassword && !bcrypt.compareSync(String(currentPassword), superUser.password_hash)) {
      return res.status(400).json({ ok: false, error: "Incorrect current password" });
    }

    withStore((s) => {
      const target = (s.users || []).find((u) => Number(u.id) === Number(superUser.id));
      if (target) {
        target.password_hash = bcrypt.hashSync(cleanNewPassword, 10);
        target.updated_at = nowIso();
      }
      addAuditLog(s, req.user, "security.password.change", { type: "user", id: superUser.id }, { username: superUser.username });
    });

    res.json({ ok: true, message: "Super Admin password updated successfully" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/users", (req, res) => {
  try {
    const store = loadStore();
    const map = usersById(store);
    const users = (store.users || []).map((u) => ({
      id: u.id,
      username: u.username || u.email,
      email: u.email,
      phone: u.phone,
      displayName: userDisplayName(u),
      role: u.role || "player",
      status: statusOf(u),
      createdAt: u.created_at,
      balance: money(walletOf(store, u.id).balance),
      createdByAdminId: u.created_by_admin_id || null,
      createdByAdminName: u.created_by_admin_id && map.get(String(u.created_by_admin_id)) ? userDisplayName(map.get(String(u.created_by_admin_id))) : (u.created_by_admin_name || null),
    }));
    const { items, pagination } = paginate(users, req, 100, 500);
    res.json({ ok: true, users: items, total: users.length, pagination });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/users/:id/topup", (req, res) => {
  try {
    const userId = Number(req.params.id);
    const amount = toNumber(req.body.amount);
    const reason = String(req.body.reason || "Super Admin Top-up").trim();
    if (!amount || amount <= 0) return res.status(400).json({ ok: false, error: "Invalid amount" });

    const store = loadStore();
    const user = (store.users || []).find((u) => Number(u.id) === userId);
    if (!user) return res.status(404).json({ ok: false, error: "User not found" });

    const newBalance = creditWallet(userId, amount, "super_deposit", "SUPER_TOPUP", { note: reason, actorId: req.user.id });
    addAudit(req.user, "user.balance.topup", { type: "user", id: userId }, { amount, reason, newBalance });
    res.json({ ok: true, userId, amount, newBalance, message: `Top-up of ${amount} ETB completed for ${user.role === "admin" ? "Admin" : "Player"} ${user.username || userDisplayName(user)}` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
