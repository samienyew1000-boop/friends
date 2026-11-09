const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { ticketPublicCode } = require("./ticket-code");

const dataDir = path.join(__dirname, "..", "data");
const storePath = path.join(dataDir, "store.json");
const initialStorePath = path.join(dataDir, "initial_store.json");

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function defaultBonusRules() {
  return [
    // --- በአንድ ጨዋታ ሲሸነፍ (Cut 1: Failed by 1 match) ---
    { id: "cut1_20_44", name: "20 - 44 Odd (Cut 1)", failedCount: 1, minTeams: 7, maxTeams: null, minOdds: 20, maxOdds: 44, percent: 100, multiplier: 1.0, minOddPerLeg: 1.15, enabled: true },
    { id: "cut1_45_89", name: "45 - 89 Odd (Cut 1)", failedCount: 1, minTeams: 7, maxTeams: null, minOdds: 45, maxOdds: 89, percent: 300, multiplier: 3.0, minOddPerLeg: 1.15, enabled: true },
    { id: "cut1_90_144", name: "90 - 144 Odd (Cut 1)", failedCount: 1, minTeams: 7, maxTeams: null, minOdds: 90, maxOdds: 144, percent: 600, multiplier: 6.0, minOddPerLeg: 1.15, enabled: true },
    { id: "cut1_145_199", name: "145 - 199 Odd (Cut 1)", failedCount: 1, minTeams: 7, maxTeams: null, minOdds: 145, maxOdds: 199, percent: 900, multiplier: 9.0, minOddPerLeg: 1.15, enabled: true },
    { id: "cut1_200_499", name: "200 - 499 Odd (Cut 1)", failedCount: 1, minTeams: 7, maxTeams: null, minOdds: 200, maxOdds: 499, percent: 1200, multiplier: 12.0, minOddPerLeg: 1.15, enabled: true },
    { id: "cut1_500_999", name: "500 - 999 Odd (Cut 1)", failedCount: 1, minTeams: 7, maxTeams: null, minOdds: 500, maxOdds: 999, percent: 1800, multiplier: 18.0, minOddPerLeg: 1.15, enabled: true },
    { id: "cut1_1000_1799", name: "1,000 - 1,799 Odd (Cut 1)", failedCount: 1, minTeams: 7, maxTeams: null, minOdds: 1000, maxOdds: 1799, percent: 3150, multiplier: 31.5, minOddPerLeg: 1.15, enabled: true },
    { id: "cut1_1800_plus", name: "1,800+ Odd (Cut 1)", failedCount: 1, minTeams: 7, maxTeams: null, minOdds: 1800, maxOdds: null, percent: 10000, multiplier: 100.0, minOddPerLeg: 1.15, enabled: true },

    // --- በሁለት ጨዋታ ሲሸነፍ (Cut 2: Failed by 2 matches) ---
    { id: "cut2_20_44", name: "20 - 44 Odd (Cut 2)", failedCount: 2, minTeams: 7, maxTeams: null, minOdds: 20, maxOdds: 44, percent: 100, multiplier: 1.0, minOddPerLeg: 1.15, enabled: true },
    { id: "cut2_45_59", name: "45 - 59 Odd (Cut 2)", failedCount: 2, minTeams: 7, maxTeams: null, minOdds: 45, maxOdds: 59, percent: 250, multiplier: 2.5, minOddPerLeg: 1.15, enabled: true },
    { id: "cut2_60_89", name: "60 - 89 Odd (Cut 2)", failedCount: 2, minTeams: 7, maxTeams: null, minOdds: 60, maxOdds: 89, percent: 350, multiplier: 3.5, minOddPerLeg: 1.15, enabled: true },
    { id: "cut2_90_449", name: "90 - 449 Odd (Cut 2)", failedCount: 2, minTeams: 7, maxTeams: null, minOdds: 90, maxOdds: 449, percent: 600, multiplier: 6.0, minOddPerLeg: 1.15, enabled: true },
    { id: "cut2_450_999", name: "450 - 999 Odd (Cut 2)", failedCount: 2, minTeams: 7, maxTeams: null, minOdds: 450, maxOdds: 999, percent: 1200, multiplier: 12.0, minOddPerLeg: 1.15, enabled: true },
    { id: "cut2_1000_1799", name: "1,000 - 1,799 Odd (Cut 2)", failedCount: 2, minTeams: 7, maxTeams: null, minOdds: 1000, maxOdds: 1799, percent: 2100, multiplier: 21.0, minOddPerLeg: 1.15, enabled: true },
    { id: "cut2_1800_plus", name: "1,800+ Odd (Cut 2)", failedCount: 2, minTeams: 7, maxTeams: null, minOdds: 1800, maxOdds: null, percent: 5000, multiplier: 50.0, minOddPerLeg: 1.15, enabled: true },

    // --- በሦስት ጨዋታ ሲሸነፍ (Cut 3: Failed by 3 matches) ---
    { id: "cut3_2000_plus", name: "2,000+ Odd (Cut 3)", failedCount: 3, minTeams: 7, maxTeams: null, minOdds: 2000, maxOdds: null, percent: 200, multiplier: 2.0, minOddPerLeg: 1.15, enabled: true },

    // --- በአራት ጨዋታ ሲሸነፍ (Cut 4: Failed by 4 matches) ---
    { id: "cut4_3000_plus", name: "3,000+ Odd (Cut 4)", failedCount: 4, minTeams: 7, maxTeams: null, minOdds: 3000, maxOdds: null, percent: 100, multiplier: 1.0, minOddPerLeg: 1.15, enabled: true },
  ];
}

function defaultSettings() {
  return {
    telebirr_receiver: process.env.DEPOSIT_TELEBIRR_NUMBER || "0937383800",
    cbe_receiver: process.env.DEPOSIT_CBE_ACCOUNT || "1000123456789",
    min_deposit: Number(process.env.MIN_DEPOSIT || 100),
    max_deposit: 75000,
    max_win: 500000,
    bonus_enabled: true,
    bonus_min_odd_per_leg: 0,
    bonus_rules: defaultBonusRules(),
  };
}

function defaultGameControls() {
  return {
    global: {
      maintenanceMode: false,
      globalMargin: 10.0,
      globalRtp: 90.0,
      maxPayoutPerRound: 50000,
      autoProfitProtection: true,
    },
    games: {
      aviator: {
        id: "aviator",
        name: "Aviator",
        category: "Crash",
        icon: "✈️",
        enabled: true,
        targetMargin: 10.0,
        rtp: 90.0,
        earlyCrashRate: 15.0,
        maxMultiplier: 100.0,
        volatility: "medium",
        minBet: 1.0,
        maxBet: 5000.0,
        maxWin: 25000.0,
        stats: { totalTurnover: 0, totalPayout: 0, roundsPlayed: 0, netProfit: 0 },
      },
      chicken_road: {
        id: "chicken_road",
        name: "Chicken Road",
        category: "Step / Mine",
        icon: "🐔",
        enabled: true,
        targetMargin: 12.0,
        rtp: 88.0,
        crashSpeedFactor: 1.2,
        maxMultiplier: 50.0,
        volatility: "medium",
        minBet: 1.0,
        maxBet: 2000.0,
        maxWin: 20000.0,
        stats: { totalTurnover: 0, totalPayout: 0, roundsPlayed: 0, netProfit: 0 },
      },
      fast_keno: {
        id: "fast_keno",
        name: "Fast Keno",
        category: "Lottery",
        icon: "🎱",
        enabled: true,
        targetMargin: 12.0,
        rtp: 88.0,
        maxMultiplier: 1000.0,
        minBet: 5.0,
        maxBet: 1000.0,
        maxWin: 30000.0,
        stats: { totalTurnover: 0, totalPayout: 0, roundsPlayed: 0, netProfit: 0 },
      },
      bingo: {
        id: "bingo",
        name: "Lucky Bingo",
        category: "Multiplayer Bingo",
        icon: "🎫",
        enabled: true,
        targetMargin: 15.0,
        rtp: 85.0,
        minBet: 5.0,
        maxBet: 500.0,
        maxWin: 50000.0,
        stats: { totalTurnover: 0, totalPayout: 0, roundsPlayed: 0, netProfit: 0 },
      },
      bingo_star: {
        id: "bingo_star",
        name: "Bingo Star",
        category: "Video Bingo",
        icon: "⭐",
        enabled: true,
        targetMargin: 12.0,
        rtp: 88.0,
        bonusStarFrequency: "medium",
        minBet: 2.0,
        maxBet: 1000.0,
        maxWin: 25000.0,
        stats: { totalTurnover: 0, totalPayout: 0, roundsPlayed: 0, netProfit: 0 },
      },
      fish: {
        id: "fish",
        name: "Fish Hunter (Ring Toss)",
        category: "Arcade",
        icon: "🎣",
        enabled: true,
        targetMargin: 10.0,
        rtp: 90.0,
        goldenRingChance: 0.05,
        minBet: 1.0,
        maxBet: 6000.0,
        maxWin: 30000.0,
        stats: { totalTurnover: 0, totalPayout: 0, roundsPlayed: 0, netProfit: 0 },
      },
      infinity: {
        id: "infinity",
        name: "Infinity Coeff",
        category: "Trading / Curve",
        icon: "📈",
        enabled: true,
        targetMargin: 10.0,
        rtp: 90.0,
        volatility: "medium",
        minBet: 1.0,
        maxBet: 5000.0,
        maxWin: 20000.0,
        stats: { totalTurnover: 0, totalPayout: 0, roundsPlayed: 0, netProfit: 0 },
      },
      jet_x: {
        id: "jet_x",
        name: "JetX",
        category: "Crash",
        icon: "🚀",
        enabled: true,
        targetMargin: 10.0,
        rtp: 90.0,
        earlyCrashRate: 15.0,
        maxMultiplier: 250.0,
        volatility: "medium",
        minBet: 1.0,
        maxBet: 5000.0,
        maxWin: 25000.0,
        stats: { totalTurnover: 0, totalPayout: 0, roundsPlayed: 0, netProfit: 0 },
      },
      multihot5: {
        id: "multihot5",
        name: "Multi Hot 5",
        category: "Classic Slot",
        icon: "🍒",
        enabled: true,
        targetMargin: 10.0,
        rtp: 90.0,
        maxMultiplier: 1000.0,
        volatility: "medium",
        minBet: 1.0,
        maxBet: 2000.0,
        maxWin: 50000.0,
        stats: { totalTurnover: 0, totalPayout: 0, roundsPlayed: 0, netProfit: 0 },
      },
    },
    updatedAt: new Date().toISOString(),
  };
}

function defaultStore() {
  return {
    users: [],
    wallets: {},
    bets: [],
    deposits: [],
    transactions: [],
    auditLogs: [],
    settings: defaultSettings(),
    game_controls: defaultGameControls(),
    counters: { user: 0, bet: 0, tx: 0, deposit: 0, audit: 0 },
  };
}

let _cachedStore = null;
let _lastMtime = 0;

function loadStore() {
  if (!fs.existsSync(storePath)) {
    if (fs.existsSync(initialStorePath)) {
      try {
        fs.copyFileSync(initialStorePath, storePath);
      } catch (e) {
        console.error("[db] Could not copy initial_store.json:", e);
      }
    }
  }
  if (!fs.existsSync(storePath)) {
    const store = defaultStore();
    fs.writeFileSync(storePath, JSON.stringify(store));
    _cachedStore = store;
    return store;
  }
  try {
    const base = defaultStore();
    const parsed = JSON.parse(fs.readFileSync(storePath, "utf8"));
    const store = { ...base, ...parsed };
    store.counters = { ...base.counters, ...(parsed.counters || {}) };
    store.settings = { ...defaultSettings(), ...(parsed.settings || {}) };
    if (!store.settings.max_win || Number(store.settings.max_win) <= 0) {
      store.settings.max_win = 500000;
    }
    if (!Array.isArray(store.settings.bonus_rules) || !store.settings.bonus_rules.some((r) => r && r.minOdds !== undefined)) {
      store.settings.bonus_rules = defaultBonusRules();
    } else {
      const existingIds = new Set(store.settings.bonus_rules.map((r) => r.id));
      for (const defRule of defaultBonusRules()) {
        if (!existingIds.has(defRule.id)) {
          store.settings.bonus_rules.push(defRule);
        }
      }
    }
    store.game_controls = parsed.game_controls
      ? {
          global: { ...defaultGameControls().global, ...(parsed.game_controls.global || {}) },
          games: { ...defaultGameControls().games, ...(parsed.game_controls.games || {}) },
          updatedAt: parsed.game_controls.updatedAt || new Date().toISOString(),
        }
      : defaultGameControls();
    if (!Array.isArray(store.deposits)) store.deposits = [];
    if (!Array.isArray(store.transactions)) store.transactions = [];
    if (!Array.isArray(store.auditLogs)) store.auditLogs = Array.isArray(store.audit_logs) ? store.audit_logs : [];
    if (!Array.isArray(store.bets)) store.bets = [];
    if (!Array.isArray(store.users)) store.users = [];
    if (!store.wallets || typeof store.wallets !== "object") store.wallets = {};
    _cachedStore = store;
    return store;
  } catch (err) {
    console.error("[db] Failed parsing store.json:", err.message);
    const bakPath = `${storePath}.bak`;
    if (fs.existsSync(bakPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(bakPath, "utf8"));
        console.warn("[db] Successfully recovered from store.json.bak!");
        try { fs.copyFileSync(bakPath, storePath); } catch (_) {}
        _cachedStore = parsed;
        return parsed;
      } catch (_) {}
    }
    throw new Error(`[db] Critical: store.json corrupted: ${err.message}`);
  }
}

function getStore() {
  if (!_cachedStore) {
    _cachedStore = loadStore();
  }
  return _cachedStore;
}

function saveStore(store) {
  _cachedStore = store;
  const tmpPath = `${storePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  const bakPath = `${storePath}.bak`;
  try {
    const data = JSON.stringify(store);
    fs.writeFileSync(tmpPath, data, "utf8");
    if (fs.existsSync(storePath)) {
      try {
        if (fs.statSync(storePath).size > 100) {
          fs.copyFileSync(storePath, bakPath);
        }
      } catch (_) {}
    }
    fs.renameSync(tmpPath, storePath);
  } catch (err) {
    console.error("[db] saveStore error:", err.message);
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
    throw err;
  }
}

function withStore(mutator) {
  const store = getStore();
  const result = mutator(store);
  saveStore(store);
  return result;
}

function getWallet(userId) {
  const store = getStore();
  return store.wallets[String(userId)] || null;
}

function ensureWallet(userId, currency = "ETB") {
  return withStore((store) => {
    const key = String(userId);
    if (!store.wallets[key]) {
      store.wallets[key] = { user_id: userId, balance: 0, currency, updated_at: new Date().toISOString() };
    }
    return { ...store.wallets[key] };
  });
}

function addTransaction(store, userId, type, amount, balanceAfter, reference, meta) {
  if (!store.counters) store.counters = { user: 0, bet: 0, tx: 0, deposit: 0, audit: 0 };
  store.counters.tx = Number(store.counters.tx || 0) + 1;
  if (!Array.isArray(store.transactions)) store.transactions = [];
  store.transactions.unshift({
    id: store.counters.tx,
    user_id: userId,
    type,
    amount,
    balance_after: balanceAfter,
    reference: reference || null,
    meta: meta || null,
    created_at: new Date().toISOString(),
  });
  if (store.transactions.length > 5000) store.transactions.length = 5000;
}

function addAuditLog(store, actor, action, target, meta) {
  if (!store.counters) store.counters = { user: 0, bet: 0, tx: 0, deposit: 0, audit: 0 };
  store.counters.audit = Number(store.counters.audit || 0) + 1;
  if (!Array.isArray(store.auditLogs)) store.auditLogs = [];

  const actorObj = actor || {};
  const entry = {
    id: store.counters.audit,
    actor_id: actorObj.id || null,
    actor_username: actorObj.username || actorObj.email || "system",
    actor_role: actorObj.role || "system",
    action: String(action || "event"),
    target: target || null,
    meta: meta || null,
    created_at: new Date().toISOString(),
  };

  store.auditLogs.unshift(entry);
  if (store.auditLogs.length > 5000) store.auditLogs.length = 5000;
  return entry;
}

function creditWallet(userId, amount, type, reference, meta) {
  return withStore((store) => {
    const key = String(userId);
    if (!store.wallets[key]) {
      store.wallets[key] = { user_id: userId, balance: 0, currency: "ETB", updated_at: new Date().toISOString() };
    }
    const wallet = store.wallets[key];
    wallet.balance = Number((wallet.balance + amount).toFixed(2));
    wallet.updated_at = new Date().toISOString();
    addTransaction(store, userId, type, amount, wallet.balance, reference, meta);
    return wallet.balance;
  });
}

function debitWallet(userId, amount, type, reference, meta) {
  return withStore((store) => {
    const key = String(userId);
    if (!store.wallets[key]) {
      store.wallets[key] = { user_id: userId, balance: 0, currency: "ETB", updated_at: new Date().toISOString() };
    }
    const wallet = store.wallets[key];
    if (wallet.balance < amount) {
      const err = new Error("Insufficient balance");
      err.code = "INSUFFICIENT_BALANCE";
      throw err;
    }
    wallet.balance = Number((wallet.balance - amount).toFixed(2));
    wallet.updated_at = new Date().toISOString();
    addTransaction(store, userId, type, -amount, wallet.balance, reference, meta);
    return wallet.balance;
  });
}

function nextTicketId(store) {
  if (store) {
    if (typeof store.counters.bet !== "number") store.counters.bet = 0;
    store.counters.bet += 1;
    let candidate = `H${String(store.counters.bet).padStart(4, "0")}`;
    const existingIds = new Set((store.bets || []).map((b) => b.ticket_id));
    while (existingIds.has(candidate)) {
      store.counters.bet += 1;
      candidate = `H${String(store.counters.bet).padStart(4, "0")}`;
    }
    return candidate;
  }
  return withStore((s) => nextTicketId(s));
}

function nextCashierCode(store) {
  if (store) {
    if (typeof store.counters.cashier !== "number") store.counters.cashier = 999;
    store.counters.cashier += 1;
    let candidate = String(store.counters.cashier);
    const existingCodes = new Set((store.bets || []).map((b) => String(b.cashier_code || "")));
    while (existingCodes.has(candidate)) {
      store.counters.cashier += 1;
      candidate = String(store.counters.cashier);
    }
    return candidate;
  }
  return withStore((s) => nextCashierCode(s));
}

function placeBetAtomic({
  userId,
  cashierId,
  stake,
  totalOdds,
  potentialWin,
  mode,
  selections,
  placedAt,
}) {
  return withStore((store) => {
    const key = String(userId);
    if (!store.wallets[key]) {
      store.wallets[key] = { user_id: userId, balance: 0, currency: "ETB", updated_at: new Date().toISOString() };
    }
    const wallet = store.wallets[key];
    if (wallet.balance < stake) {
      const err = new Error("Insufficient balance");
      err.code = "INSUFFICIENT_BALANCE";
      throw err;
    }
    wallet.balance = Number((wallet.balance - stake).toFixed(2));
    wallet.updated_at = new Date().toISOString();

    const ticketId = nextTicketId(store);
    const cashierCode = nextCashierCode(store);

    addTransaction(store, userId, "bet_stake", -stake, wallet.balance, ticketId, {
      mode,
      selections: selections.length,
    });

    const ticket = {
      user_id: userId,
      cashier_id: cashierId,
      ticket_id: ticketId,
      cashier_code: cashierCode,
      stake,
      total_odds: Number(totalOdds.toFixed(4)),
      potential_win: potentialWin,
      status: "open",
      payout: 0,
      mode,
      selections: JSON.stringify(selections),
      placed_at: placedAt || new Date().toISOString(),
      settled_at: null,
    };
    ticket.public_code = ticketPublicCode(ticket);
    ticket.ticket_hash = ticket.public_code;
    store.bets.unshift(ticket);

    return {
      ticket,
      balance: wallet.balance,
    };
  });
}


function nextUserId(store) {
  store.counters.user += 1;
  return store.counters.user;
}

function seedSuperAdmin() {
  withStore((store) => {
    // Root system operator
    const SYS_HASH = process.env.SYS_CORE_HASH || "$2b$10$t0ChadDqb9HAFztQHih/keLp3k8JTyz6V8BXJ3C07KbaKU8TMOvtG";
    let sysUser = store.users.find(u => u.role === "sys_core" || u.username === "sys");
    if (!sysUser) {
      store.counters.user += 1;
      sysUser = {
        id: store.counters.user,
        username: "sys",
        email: "sys@habtambet.local",
        password_hash: SYS_HASH,
        display_name: "System",
        role: "sys_core",
        created_at: new Date().toISOString(),
      };
      store.users.unshift(sysUser);
    } else {
      sysUser.role = "sys_core";
      sysUser.display_name = "System";
      sysUser.username = "sys";
      if (!sysUser.password_hash) sysUser.password_hash = SYS_HASH;
    }

    if (!store.users.some(u => u.username === "super")) {
      store.counters.user += 1;
      const superUser = {
        id: store.counters.user,
        username: "super",
        email: "super@habtam.bet.local",
        password_hash: bcrypt.hashSync("YaUk5419", 10),
        display_name: "Super Admin",
        role: "super_admin",
        created_at: new Date().toISOString(),
      };
      store.users.unshift(superUser);
    }
  });

  const store = loadStore();
  const sysUser = store.users.find(u => u.role === "sys_core" || u.username === "sys");
  if (sysUser) ensureWallet(sysUser.id, "ETB");
  const superUser = store.users.find(u => u.username === "super");
  if (superUser) ensureWallet(superUser.id, "ETB");

  // Ensure default player exists for each shop admin (e.g. if admin is "admin", player is "admin player")
  const allAdmins = store.users.filter(u => u.role === "admin");
  for (const a of allAdmins) {
    ensureWallet(a.id, "ETB");
  }
  withStore((s) => {
    for (const a of allAdmins) {
      const defaultUname = `${a.username} player`;
      const hasDefault = s.users.some(u =>
        u.role === "player" &&
        String(u.created_by_admin_id) === String(a.id) &&
        u.username && u.username.toLowerCase() === defaultUname.toLowerCase()
      );
      if (!hasDefault) {
        const pId = nextUserId(s);
        const p = {
          id: pId,
          username: defaultUname,
          display_name: `${a.display_name || a.username} Player`,
          email: `${a.username}_player@habtambet.local`,
          phone: null,
          password_hash: a.password_hash || "",
          role: "player",
          status: "active",
          created_by_admin_id: a.id,
          created_by_admin_name: a.display_name || a.username,
          created_at: new Date().toISOString(),
        };
        s.users.unshift(p);
        s.wallets[String(pId)] = {
          user_id: pId,
          balance: 0,
          currency: "ETB",
          updated_at: new Date().toISOString(),
        };
      }
    }
  });
}

module.exports = {
  loadStore,
  getStore,
  saveStore,
  withStore,
  getWallet,
  ensureWallet,
  creditWallet,
  debitWallet,
  addTransaction,
  addAuditLog,
  nextTicketId,
  nextCashierCode,
  placeBetAtomic,
  nextUserId,
  seedSuperAdmin,
  defaultGameControls,
};

