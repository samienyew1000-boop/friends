const express = require("express");
const bcrypt = require("bcryptjs");
const { adminOrSuperRequired, superAdminRequired } = require("../middleware/auth");
const {
  loadStore,
  withStore,
  creditWallet,
  debitWallet,
  addTransaction,
  addAuditLog,
  nextUserId,
} = require("../db");
const { ticketPublicCode } = require("../ticket-code");

const router = express.Router();

function adminRequired(req, res, next) {
  adminOrSuperRequired(req, res, () => {
    const store = loadStore();
    const userRow = (store.users || []).find((u) => u.id === req.user.id);
    if (userRow && ["blocked", "suspended", "archived"].includes(String(userRow.status || "active").toLowerCase())) {
      return res.status(403).json({ ok: false, error: "Your shop admin account has been blocked by the Super Admin." });
    }
    next();
  });
}

// 1. Dashboard statistics
router.get("/dashboard", adminRequired, (req, res) => {
  try {
    const store = loadStore();
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Filter players in our system (scoped to this shop admin if not super_admin)
    let players = (store.users || []).filter((u) => u.role === "player" || !u.role);
    if (req.user.role === "admin") {
      players = players.filter((u) => String(u.created_by_admin_id) === String(req.user.id));
    }
    const totalPlayers = players.length;

    const players24h = players.filter((u) => {
      if (!u.created_at) return false;
      return new Date(u.created_at) >= oneDayAgo;
    }).length;

    const players7d = players.filter((u) => {
      if (!u.created_at) return false;
      return new Date(u.created_at) >= sevenDaysAgo;
    }).length;

    // Daily registrations for last 7 days
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().slice(0, 10);
      const label = `${d.getDate()}/${d.getMonth() + 1}`;
      const count = players.filter((u) => u.created_at && u.created_at.slice(0, 10) === dateStr).length;
      days.push({ date: dateStr, label, count });
    }

    // Bets in last 7 days (scoped to this shop's players)
    const shopPlayerIds = new Set(players.map((p) => String(p.id)));
    let bets = (store.bets || []);
    if (req.user.role === "admin") {
      bets = bets.filter((b) => shopPlayerIds.has(String(b.user_id)));
    }
    const last7dBets = bets.filter((b) => {
      const placed = b.placed_at || b.created_at;
      if (!placed) return true;
      return new Date(placed) >= sevenDaysAgo;
    });

    const sportBet = last7dBets.reduce((sum, b) => sum + (Number(b.stake) || 0), 0);
    const sportWin = last7dBets
      .filter((b) => b.status === "won")
      .reduce((sum, b) => sum + (Number(b.potential_win || b.payout) || 0), 0);
    const sportProfit = Math.round((sportBet - sportWin) * 100) / 100;
    const sportWinPct = sportBet > 0 ? Math.round((sportWin / sportBet) * 100) : 0;

    // Sport daily stats for last 7 days
    const sportDaily = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().slice(0, 10);
      const label = `${d.getDate()}/${d.getMonth() + 1}`;
      const dayBets = bets.filter((b) => (b.placed_at || b.created_at || "").slice(0, 10) === dateStr);
      const dayStake = dayBets.reduce((sum, b) => sum + (Number(b.stake) || 0), 0);
      const dayWin = dayBets.filter((b) => b.status === "won").reduce((sum, b) => sum + (Number(b.potential_win || b.payout) || 0), 0);
      sportDaily.push({ date: dateStr, label, bet: dayStake, win: dayWin });
    }

    // Admin's own wallet
    const adminWallet = (store.wallets && store.wallets[String(req.user.id)]) || { balance: 0 };

    res.json({
      ok: true,
      stats: {
        balance: adminWallet.balance || 0,
        credits: 0,
        availability: adminWallet.balance || 0,
        players: totalPlayers,
        players24h,
        players7d,
        promoterCode: "HB7611994",
        affiliationLink: "https://habtambet.et/signup/?promoter_code=HB7611994",
        registrationStats: {
          total: totalPlayers,
          daily: days,
        },
        sportStats: {
          bet: Math.round(sportBet),
          win: Math.round(sportWin),
          profit: Math.round(sportProfit),
          pct: `${sportWinPct}%`,
          daily: sportDaily,
        },
        casinoStats: {
          bet: 0,
          win: 0,
          profit: 0,
          pct: "0%",
        },
      },
    });
  } catch (err) {
    console.error("Admin dashboard error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 2. List / Search players
router.get("/players", adminRequired, (req, res) => {
  try {
    const store = loadStore();
    const { id, name, lastname, email, phone, username, dateFrom, dateTo, search, q } = req.query;
    const searchQuery = (search || q || "").trim().toLowerCase();

    let players = (store.users || []).filter((u) => u.role === "player" || !u.role);

    // Shop Admins strictly only see players created by their shop.
    // Listing players must never create an implicit/fake player: transfers are
    // allowed only for accounts that the admin actually registered.
    if (req.user.role === "admin") {
      players = players.filter((u) => String(u.created_by_admin_id) === String(req.user.id));
    }

    if (searchQuery) {
      players = players.filter((u) => {
        const uid = String(u.id);
        const uname = (u.username || "").toLowerCase();
        const dname = (u.display_name || u.first_name || "").toLowerCase();
        const lname = (u.last_name || "").toLowerCase();
        const uemail = (u.email || "").toLowerCase();
        const uphone = (u.phone || "").toLowerCase();
        return uid.includes(searchQuery) || uname.includes(searchQuery) || dname.includes(searchQuery) || lname.includes(searchQuery) || uemail.includes(searchQuery) || uphone.includes(searchQuery);
      });
    }

    if (id) {
      players = players.filter((u) => String(u.id).includes(String(id).trim()));
    }
    if (username) {
      const q = String(username).trim().toLowerCase();
      players = players.filter((u) => (u.username || "").toLowerCase().includes(q));
    }
    if (name) {
      const q = String(name).trim().toLowerCase();
      players = players.filter((u) => (u.display_name || u.first_name || "").toLowerCase().includes(q));
    }
    if (lastname) {
      const q = String(lastname).trim().toLowerCase();
      players = players.filter((u) => (u.last_name || "").toLowerCase().includes(q));
    }
    if (email) {
      const q = String(email).trim().toLowerCase();
      players = players.filter((u) => (u.email || "").toLowerCase().includes(q));
    }
    if (phone) {
      const q = String(phone).replace(/\D/g, "");
      players = players.filter((u) => (u.phone || "").replace(/\D/g, "").includes(q));
    }
    if (dateFrom) {
      const fromTs = new Date(dateFrom).getTime();
      if (!isNaN(fromTs)) players = players.filter((u) => new Date(u.created_at).getTime() >= fromTs);
    }
    if (dateTo) {
      const toTs = new Date(dateTo).getTime();
      if (!isNaN(toTs)) players = players.filter((u) => new Date(u.created_at).getTime() <= toTs + 86400000);
    }

    const data = players.map((u) => {
      const wallet = store.wallets[String(u.id)] || { balance: 0 };
      const betsCount = (store.bets || []).filter((b) => String(b.user_id) === String(u.id)).length;
      return {
        id: u.id,
        username: u.username || u.phone || u.email,
        name: u.display_name || u.first_name || "—",
        lastname: u.last_name || "",
        email: u.email || "—",
        phone: u.phone || "—",
        balance: wallet.balance || 0,
        currency: wallet.currency || "ETB",
        betsCount,
        createdAt: u.created_at || new Date().toISOString(),
        status: u.status || "active",
      };
    });

    if (req.user.role === "admin") {
      const adminUname = (req.user.username || "").toLowerCase();
      data.sort((a, b) => {
        const aU = (a.username || "").toLowerCase();
        const bU = (b.username || "").toLowerCase();
        const aIsDef = aU === `${adminUname} player`;
        const bIsDef = bU === `${adminUname} player`;
        if (aIsDef && !bIsDef) return -1;
        if (!aIsDef && bIsDef) return 1;
        return 0;
      });
    }

    res.json({ ok: true, players: data });
  } catch (err) {
    console.error("Admin players error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 3. Create new player
router.post("/players", adminRequired, (req, res) => {
  try {
    const { username, phone, email, password, name, lastname, initialBalance } = req.body;
    const identifier = String(phone || username || email || "").trim();
    if (!identifier) {
      return res.status(400).json({ ok: false, error: "Username or Phone number is required" });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ ok: false, error: "Password must be at least 6 characters" });
    }

    let createdUser;
    withStore((store) => {
      if (store.users.some((u) =>
        (u.username && u.username.toLowerCase() === identifier.toLowerCase()) ||
        (u.phone && u.phone.replace(/\D/g, "") === identifier.replace(/\D/g, "")) ||
        (u.email && u.email.toLowerCase() === identifier.toLowerCase())
      )) {
        throw new Error("A player with this identifier already exists");
      }

      const newId = nextUserId(store);
      const cleanPhone = phone ? String(phone).trim() : (/^\+?\d{8,15}$/.test(identifier) ? identifier : null);
      const cleanEmail = email ? String(email).trim().toLowerCase() : `${identifier.replace(/\D/g, "") || identifier}@habtambet.local`;
      const displayName = String(name || "").trim() ? (lastname ? `${name} ${lastname}`.trim() : name.trim()) : identifier;

      createdUser = {
        id: newId,
        username: username || identifier,
        phone: cleanPhone,
        email: cleanEmail,
        first_name: name || "",
        last_name: lastname || "",
        display_name: displayName,
        password_hash: bcrypt.hashSync(password, 10),
        role: "player",
        status: "active",
        created_by_admin_id: req.user.id,
        created_by_admin_name: req.user.display_name || req.user.username,
        created_at: new Date().toISOString(),
      };
      store.users.unshift(createdUser);

      store.wallets[String(newId)] = {
        user_id: newId,
        balance: 0,
        currency: "ETB",
        updated_at: new Date().toISOString(),
      };
    });

    // Handle initial balance if provided
    const initBal = Number(initialBalance);
    if (initBal && initBal > 0) {
      if (req.user.role === "admin") {
        const storeBefore = loadStore();
        const adminWallet = (storeBefore.wallets && storeBefore.wallets[String(req.user.id)]) || { balance: 0 };
        const adminBal = Number(adminWallet.balance || 0);
        if (adminBal <= 0 || adminBal < initBal) {
          return res.status(400).json({
            ok: false,
            code: "INSUFFICIENT_ADMIN_BALANCE",
            error: `Insufficient admin balance (${adminBal} ETB available). You cannot provide initial balance to cashiers when you have no balance. Your balance can only be topped up by the Super Admin.`,
          });
        }
        debitWallet(req.user.id, initBal, "admin_transfer_out", "CASHIER_INITIAL_FLOAT", {
          note: `Initial float for cashier ${createdUser.username}`,
          targetUserId: createdUser.id,
        });
      }
      creditWallet(createdUser.id, initBal, "admin_grant", "ADMIN_NEW_PLAYER", { note: "Initial balance by Admin" });
      const store = loadStore();
      createdUser.balance = (store.wallets[String(createdUser.id)] || {}).balance || initBal;
    } else {
      createdUser.balance = 0;
    }

    res.json({
      ok: true,
      player: {
        id: createdUser.id,
        username: createdUser.username,
        name: createdUser.display_name,
        phone: createdUser.phone || "—",
        email: createdUser.email || "—",
        balance: createdUser.balance,
        createdByAdminId: createdUser.created_by_admin_id,
        createdByAdminName: createdUser.created_by_admin_name,
        createdAt: createdUser.created_at,
        status: createdUser.status,
      },
      message: `Player ${createdUser.username} created successfully`,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// 4. Top-up player/cashier balance
router.post("/players/:id/topup", adminRequired, (req, res) => {
  try {
    const amount = Number(req.body.amount || 0);
    const userId = Number(req.params.id);
    if (!amount || amount <= 0) return res.status(400).json({ ok: false, error: "Invalid amount" });

    const store = loadStore();
    const targetPlayer = (store.users || []).find((u) => u.id === userId);
    if (!targetPlayer) return res.status(404).json({ ok: false, error: "Player not found" });

    // Rule: Admins cannot fund other admin accounts. Admin balances can only be topped up by Super Admin.
    if (targetPlayer.role === "admin" || targetPlayer.role === "super_admin") {
      return res.status(403).json({
        ok: false,
        error: "Admins cannot fund admin accounts. Admin balances can only be topped up by the Super Admin.",
      });
    }

    if (req.user.role === "admin" && String(targetPlayer.created_by_admin_id) !== String(req.user.id)) {
      return res.status(403).json({ ok: false, error: "Access denied: You can only deposit/withdraw for players created by your shop." });
    }

    // Rule: If the admin has no balance (or insufficient balance), they cannot fund or top up the cashier!
    if (req.user.role === "admin") {
      const adminWallet = (store.wallets && store.wallets[String(req.user.id)]) || { balance: 0 };
      const adminBalance = Number(adminWallet.balance || 0);
      if (adminBalance <= 0 || adminBalance < amount) {
        return res.status(400).json({
          ok: false,
          code: "INSUFFICIENT_ADMIN_BALANCE",
          error: `Insufficient admin balance (${adminBalance} ETB available). You cannot fund or top up cashiers when you have no balance. Your balance can only be topped up by the Super Admin.`,
        });
      }

      // Debit the admin's float wallet
      debitWallet(req.user.id, amount, "admin_transfer_out", "CASHIER_FUNDING", {
        note: `Funded cashier ${targetPlayer.username || targetPlayer.display_name}`,
        targetUserId: userId,
      });
    }

    // Credit the cashier's wallet
    const newBalance = creditWallet(userId, amount, "admin_topup", "ADMIN_TOPUP", {
      note: "Balance top-up by Admin",
      adminId: req.user.id,
    });

    // Fresh admin balance
    const freshStore = loadStore();
    const freshAdminWallet = (freshStore.wallets && freshStore.wallets[String(req.user.id)]) || { balance: 0 };

    res.json({
      ok: true,
      amount,
      newBalance,
      adminBalance: freshAdminWallet.balance || 0,
      message: `Successfully credited ${amount} ETB to ${targetPlayer.username || targetPlayer.display_name}`,
    });
  } catch (err) {
    if (err.code === "INSUFFICIENT_BALANCE") {
      return res.status(400).json({
        ok: false,
        code: "INSUFFICIENT_ADMIN_BALANCE",
        error: "Insufficient admin balance. You cannot fund or top up cashiers when you have no balance. Your balance can only be topped up by the Super Admin.",
      });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 4b. Transfer funds (Deposit or Withdraw) between a shop admin and one of
// that shop's registered players. Both sides are updated in one store write so
// an insufficient-balance rejection cannot partially complete a transfer.
router.post("/players/:id/transfer", adminRequired, (req, res) => {
  const operation = String(req.body.operation || "deposit").trim().toLowerCase();
  const reason = String(req.body.reason || "").trim() || (operation === "withdraw" ? "Withdrawal by Admin" : "Deposit by Admin");

  try {
    const rawAmount = Number(req.body.amount);
    const userId = Number(req.params.id);

    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid amount" });
    }
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid player" });
    }
    if (!["deposit", "withdraw"].includes(operation)) {
      return res.status(400).json({ ok: false, error: "Operation must be deposit or withdraw" });
    }

    const amount = Number(rawAmount.toFixed(2));
    const fail = (message, code, status = 400) => {
      const err = new Error(message);
      err.code = code;
      err.httpStatus = status;
      throw err;
    };
    const roundMoney = (value) => Number(Number(value || 0).toFixed(2));

    const result = withStore((store) => {
      const targetPlayer = (store.users || []).find((u) => Number(u.id) === userId);
      if (!targetPlayer) fail("Player not found", "PLAYER_NOT_FOUND", 404);

      // This endpoint is for players only. Admin and system balances are
      // managed by Super Admin finance controls, never by a shop cashier flow.
      if (targetPlayer.role && targetPlayer.role !== "player") {
        fail("Transfers are allowed only for player accounts", "INVALID_TRANSFER_TARGET", 403);
      }

      if (req.user.role === "admin" && String(targetPlayer.created_by_admin_id) !== String(req.user.id)) {
        fail("Access denied: You can only deposit or withdraw for players registered under your shop.", "PLAYER_OUTSIDE_SHOP", 403);
      }

      const walletFor = (walletUserId) => {
        const key = String(walletUserId);
        if (!store.wallets[key]) {
          store.wallets[key] = {
            user_id: walletUserId,
            balance: 0,
            currency: "ETB",
            updated_at: new Date().toISOString(),
          };
        }
        return store.wallets[key];
      };

      const playerWallet = walletFor(userId);
      const playerBalance = Number(playerWallet.balance || 0);
      const adminWallet = req.user.role === "admin" ? walletFor(req.user.id) : null;
      const adminBalance = adminWallet ? Number(adminWallet.balance || 0) : 0;
      const playerLabel = targetPlayer.username || targetPlayer.phone || targetPlayer.display_name || `Player #${userId}`;

      if (operation === "withdraw") {
        if (playerBalance < amount) {
          fail("Player has insufficient balance for withdrawal", "INSUFFICIENT_BALANCE");
        }

        const newBalance = roundMoney(playerBalance - amount);
        playerWallet.balance = newBalance;
        playerWallet.updated_at = new Date().toISOString();
        addTransaction(store, userId, "admin_withdraw", -amount, newBalance, "ADMIN_WITHDRAW", {
          note: reason,
          adminId: req.user.id,
        });

        let newAdminBalance = adminBalance;
        if (adminWallet) {
          newAdminBalance = roundMoney(adminBalance + amount);
          adminWallet.balance = newAdminBalance;
          adminWallet.updated_at = new Date().toISOString();
          addTransaction(store, req.user.id, "admin_transfer_in", amount, newAdminBalance, "PLAYER_RETURN", {
            note: `Withdrawn from player ${playerLabel}`,
            fromUserId: userId,
          });
        }

        return { newBalance, adminBalance: newAdminBalance };
      }

      // A shop admin may deposit only from the shop's own float. This check is
      // performed before either wallet is changed.
      if (adminWallet && adminBalance < amount) {
        fail(
          `Insufficient admin balance (${adminBalance} ETB available). You cannot fund players when your shop float is insufficient. Your balance can only be topped up by the Super Admin.`,
          "INSUFFICIENT_ADMIN_BALANCE"
        );
      }

      let newAdminBalance = adminBalance;
      if (adminWallet) {
        newAdminBalance = roundMoney(adminBalance - amount);
        adminWallet.balance = newAdminBalance;
        adminWallet.updated_at = new Date().toISOString();
        addTransaction(store, req.user.id, "admin_transfer_out", -amount, newAdminBalance, "PLAYER_FUNDING", {
          note: `Funded player ${playerLabel}`,
          targetUserId: userId,
        });
      }

      const newBalance = roundMoney(playerBalance + amount);
      playerWallet.balance = newBalance;
      playerWallet.updated_at = new Date().toISOString();
      addTransaction(store, userId, "admin_deposit", amount, newBalance, "ADMIN_DEPOSIT", {
        note: reason,
        adminId: req.user.id,
      });

      return { newBalance, adminBalance: newAdminBalance };
    });

    res.json({
      ok: true,
      amount,
      operation,
      newBalance: result.newBalance,
      adminBalance: result.adminBalance,
      message: `${operation === "withdraw" ? "Withdrawal" : "Deposit"} of ${amount} ETB completed`,
    });
  } catch (err) {
    if (err.httpStatus) {
      return res.status(err.httpStatus).json({ ok: false, code: err.code, error: err.message });
    }
    if (err.code === "INSUFFICIENT_ADMIN_BALANCE") {
      return res.status(400).json({ ok: false, code: err.code, error: err.message });
    }
    if (err.code === "INSUFFICIENT_BALANCE") {
      return res.status(400).json({ ok: false, code: err.code, error: "Player has insufficient balance for withdrawal" });
    }
    console.error("Admin player transfer error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 5. Admin Transactions Log
router.get("/transactions", adminRequired, (req, res) => {
  try {
    const store = loadStore();
    const { type } = req.query;
    const search = String(req.query.search || "").trim().toLowerCase();
    const limit = Math.min(Number(req.query.limit || 50), 100);

    const usersMap = {};
    (store.users || []).forEach((u) => {
      usersMap[u.id] = u;
    });

    let txs = store.transactions || [];

    if (req.user.role === "admin") {
      const allowedUserIds = new Set(
        (store.users || [])
          .filter((u) => String(u.id) === String(req.user.id) || String(u.created_by_admin_id) === String(req.user.id))
          .map((u) => u.id)
      );
      txs = txs.filter((t) => allowedUserIds.has(t.user_id));
    }

    if (type && type !== "all") {
      txs = txs.filter((t) => {
        const tType = String(t.type || "").toLowerCase();
        if (type === "withdraw") {
          return tType.includes("withdraw") || t.amount < 0;
        }
        if (type === "deposit") {
          return tType.includes("deposit") || t.amount > 0;
        }
        if (type === "voucher") {
          return tType.includes("voucher");
        }
        return tType === type;
      });
    }

    if (search) {
      txs = txs.filter((t) => {
        const u = usersMap[t.user_id];
        const uname = (u?.username || u?.phone || "").toLowerCase();
        const ref = String(t.reference || "").toLowerCase();
        const idStr = String(t.id || "");
        return uname.includes(search) || ref.includes(search) || idStr.includes(search);
      });
    }

    const items = txs.slice(0, limit).map((t) => {
      const user = usersMap[t.user_id];
      return {
        id: t.id,
        userId: t.user_id,
        username: user?.username || user?.phone || (t.user_id ? `#${t.user_id}` : "Cashier Walk-in"),
        type: t.type,
        amount: Math.abs(t.amount),
        isDebit: t.amount < 0 || String(t.type).includes("withdraw"),
        balanceAfter: t.balance_after,
        reference: t.reference,
        meta: t.meta,
        createdAt: t.created_at,
      };
    });

    res.json({
      ok: true,
      total: txs.length,
      transactions: items,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 4d. Process Voucher Transaction (Withdraw or Deposit)
router.post("/transactions/voucher", adminRequired, (req, res) => {
  try {
    const operation = (req.body.operation || "withdraw").toLowerCase();
    const amount = Number(req.body.amount || 0);
    const userId = req.body.userId ? Number(req.body.userId) : null;
    let voucherCode = String(req.body.voucherCode || "").trim();
    const reason = String(req.body.reason || "").trim() || `Voucher ${operation === "withdraw" ? "Payout" : "Deposit"}`;

    if (!amount || amount <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid amount" });
    }

    if (!voucherCode) {
      // Auto-generate voucher code: VCH-XXXX-XXXX
      const rnd1 = Math.random().toString(36).substring(2, 6).toUpperCase();
      const rnd2 = Math.random().toString(36).substring(2, 6).toUpperCase();
      voucherCode = `VCH-${rnd1}-${rnd2}`;
    }

    let newBalance = null;
    if (userId) {
      const store = loadStore();
      const targetPlayer = (store.users || []).find((u) => u.id === userId);
      if (targetPlayer && (targetPlayer.role === "admin" || targetPlayer.role === "super_admin")) {
        return res.status(403).json({
          ok: false,
          error: "Admins cannot fund admin accounts. Admin balances can only be topped up by the Super Admin.",
        });
      }

      if (operation === "withdraw") {
        newBalance = debitWallet(userId, amount, "voucher_withdraw", voucherCode, { voucherCode, note: reason });
        if (req.user && req.user.role === "admin") {
          creditWallet(req.user.id, amount, "admin_voucher_recovery", voucherCode, {
            note: `Voucher payout recovery for player ${userId}`,
            fromUserId: userId,
          });
        }
      } else {
        if (req.user && req.user.role === "admin") {
          const adminWallet = (store.wallets && store.wallets[String(req.user.id)]) || { balance: 0 };
          const adminBalance = Number(adminWallet.balance || 0);
          if (adminBalance <= 0 || adminBalance < amount) {
            return res.status(400).json({
              ok: false,
              code: "INSUFFICIENT_ADMIN_BALANCE",
              error: `Insufficient admin balance (${adminBalance} ETB available). You cannot fund or top up cashiers when you have no balance. Your balance can only be topped up by the Super Admin.`,
              adminBalance,
            });
          }
          debitWallet(req.user.id, amount, "admin_voucher_payout", voucherCode, {
            note: `Voucher deposit to player ${userId}`,
            targetUserId: userId,
          });
        }
        newBalance = creditWallet(userId, amount, "voucher_deposit", voucherCode, { voucherCode, note: reason });
      }
    } else {
      // Direct voucher payout logged without a specific user
      if (operation === "deposit" && req.user && req.user.role === "admin") {
        const store = loadStore();
        const adminWallet = (store.wallets && store.wallets[String(req.user.id)]) || { balance: 0 };
        const adminBalance = Number(adminWallet.balance || 0);
        if (adminBalance <= 0 || adminBalance < amount) {
          return res.status(400).json({
            ok: false,
            code: "INSUFFICIENT_ADMIN_BALANCE",
            error: `Insufficient admin balance (${adminBalance} ETB available). You cannot fund or issue vouchers when you have no balance. Your balance can only be topped up by the Super Admin.`,
            adminBalance,
          });
        }
        debitWallet(req.user.id, amount, "admin_voucher_issue", voucherCode, { note: reason });
      }
      withStore((store) => {
        if (!store.counters) store.counters = { user: 0, bet: 0, tx: 0, deposit: 0 };
        store.counters.tx = Number(store.counters.tx || 0) + 1;
        if (!Array.isArray(store.transactions)) store.transactions = [];
        store.transactions.unshift({
          id: store.counters.tx,
          user_id: null,
          type: operation === "withdraw" ? "voucher_withdraw" : "voucher_deposit",
          amount: operation === "withdraw" ? -amount : amount,
          balance_after: 0,
          reference: voucherCode,
          meta: { voucherCode, note: reason, cashier: req.user.username },
          created_at: new Date().toISOString(),
        });
      });
    }

    const freshStore = loadStore();
    const freshAdminWallet = (req.user && freshStore.wallets && freshStore.wallets[String(req.user.id)]) || { balance: 0 };

    res.json({
      ok: true,
      operation,
      amount,
      voucherCode,
      newBalance,
      adminBalance: freshAdminWallet.balance || 0,
      message: `Voucher ${operation === "withdraw" ? "withdrawal" : "deposit"} of ${amount} ETB processed successfully`,
    });
  } catch (err) {
    if (err.code === "INSUFFICIENT_BALANCE") {
      return res.status(400).json({ ok: false, error: "Player has insufficient balance for voucher withdrawal" });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 5. List / Search sport coupons (tickets)
const COUPON_CANCEL_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_VAT_RATE = Number(process.env.BET_VAT_RATE || 0);
const DEFAULT_WIN_TAX_RATE = Number(process.env.WIN_TAX_RATE || 0);

function parseCouponSelections(ticket) {
  try {
    const parsed = typeof ticket.selections === "string" ? JSON.parse(ticket.selections) : ticket.selections;
    if (!Array.isArray(parsed)) return [];
    return [...parsed].sort((a, b) => {
      const ta = a.kickoff ? new Date(a.kickoff).getTime() : 0;
      const tb = b.kickoff ? new Date(b.kickoff).getTime() : 0;
      return ta - tb;
    });
  } catch (_) {
    return [];
  }
}

function couponCashierCode(ticket) {
  if (!ticket) return null;
  if (ticket.cashier_code) return String(ticket.cashier_code);
  if (ticket.cashierCode) return String(ticket.cashierCode);
  const match = String(ticket.ticket_id || ticket.ticketId || ticket.id || "").match(/\d+/);
  return match ? String(1000 + (parseInt(match[0], 10) - 1)) : "1000";
}

function couponScope(store, user) {
  if (!user || user.role !== "admin") return () => true;
  const myPlayerIds = new Set(
    (store.users || [])
      .filter((u) => String(u.created_by_admin_id) === String(user.id))
      .map((u) => String(u.id))
  );
  return (ticket) =>
    myPlayerIds.has(String(ticket.user_id)) ||
    String(ticket.cashier_id) === String(user.id) ||
    String(ticket.user_id) === String(user.id);
}

function couponNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function couponSearchText(value) {
  return String(value == null ? "" : value).trim().toLowerCase();
}

function selectionContains(selection, query) {
  const needle = couponSearchText(query);
  if (!needle) return true;
  return [
    selection.sport,
    selection.country,
    selection.leagueName,
    selection.fixtureName,
    selection.homeName,
    selection.awayName,
    selection.marketName,
    selection.marketKey,
    selection.selectionName,
    selection.value,
  ].some((value) => couponSearchText(value).includes(needle));
}

function mapCoupon(store, ticket, userMap, req) {
  const selections = parseCouponSelections(ticket);
  const user = userMap[String(ticket.user_id)] || null;
  const placedAt = ticket.placed_at || ticket.created_at || new Date().toISOString();
  const placedMs = new Date(placedAt).getTime();
  const status = String(ticket.status || "open").toLowerCase();
  const stake = couponNumber(ticket.stake);
  const grossPayout = couponNumber(ticket.payout || (status === "won" ? ticket.potential_win : 0));
  const vatRate = Number.isFinite(Number(ticket.vat_rate)) ? Number(ticket.vat_rate) : DEFAULT_VAT_RATE;
  const winTaxRate = Number.isFinite(Number(ticket.win_tax_rate)) ? Number(ticket.win_tax_rate) : DEFAULT_WIN_TAX_RATE;
  const exciseDuty = couponNumber(ticket.excise_duty != null ? ticket.excise_duty : stake * vatRate);
  const whtOnWinnings = couponNumber(
    ticket.wht_on_winnings != null ? ticket.wht_on_winnings : Math.max(0, grossPayout - stake) * winTaxRate
  );
  const publicCode = ticketPublicCode(ticket);
  const origin = String(process.env.PUBLIC_APP_URL || process.env.APP_URL || "").replace(/\/$/, "");
  const publicStatusUrl = `${origin}/?check=${encodeURIComponent(publicCode)}`;
  const now = Date.now();
  const cancelDeadlineMs = placedMs + COUPON_CANCEL_WINDOW_MS;
  const canCancel = status === "open" && Number.isFinite(placedMs) && now < cancelDeadlineMs;
  const parent = user && (user.created_by_admin_name || user.parent_name || user.parent || user.created_by_admin_id);
  const player = user ? (user.display_name || user.username || user.phone || `User ${user.id}`) : `User ${ticket.user_id}`;
  const sport = selections[0] && (selections[0].sport || "Football");
  const skin = ticket.skin || ticket.currency || "ETB";

  return {
    id: ticket.ticket_id,
    ticketId: ticket.ticket_id,
    betId: ticket.ticket_id,
    publicCode,
    ticketHash: publicCode,
    publicStatusUrl,
    cashierCode: couponCashierCode(ticket),
    userId: ticket.user_id,
    username: user ? (user.username || user.display_name || `User ${user.id}`) : `User ${ticket.user_id}`,
    userPhone: user ? (user.phone || "—") : "—",
    userDisplayName: player,
    player,
    parent: parent || "—",
    bonus: couponNumber(ticket.bonus_amount || ticket.bonus),
    bonusAwarded: Boolean(ticket.bonus_awarded || ticket.bonus_amount),
    stake,
    grossStake: couponNumber(ticket.gross_stake != null ? ticket.gross_stake : stake),
    exciseDuty,
    netStake: couponNumber(ticket.net_stake != null ? ticket.net_stake : stake - exciseDuty),
    totalOdds: couponNumber(ticket.total_odds) || 1,
    potentialWin: couponNumber(ticket.potential_win),
    grossPayout,
    whtOnWinnings,
    netPayout: couponNumber(ticket.net_payout != null ? ticket.net_payout : grossPayout - whtOnWinnings),
    payout: grossPayout,
    status,
    mode: ticket.mode || "multiple",
    sport: sport || "Football",
    skin,
    placedAt,
    resultTime: ticket.settled_at || ticket.result_time || null,
    paymentDate: ticket.payment_date || (grossPayout > 0 ? ticket.settled_at : null),
    paymentUser: ticket.payment_user || ticket.paid_by || null,
    cancelledAt: ticket.cancelled_at || null,
    cancelledBy: ticket.cancelled_by || null,
    cancellationReason: ticket.cancellation_reason || null,
    cancelDeadline: Number.isFinite(cancelDeadlineMs) ? new Date(cancelDeadlineMs).toISOString() : null,
    secondsToCancel: canCancel ? Math.max(0, Math.ceil((cancelDeadlineMs - now) / 1000)) : 0,
    canCancel,
    selections,
    selectionCount: selections.length,
    missingEvents: selections.filter((selection) => !selection.fixtureName && !selection.homeName && !selection.awayName).length,
    category: selections[0] && (selections[0].category || selections[0].sport || "Football"),
    tournament: selections[0] && (selections[0].leagueName || selections[0].tournament || "—"),
    requestRole: req.user.role,
  };
}

function couponMatchesPublicCode(ticket, query) {
  const needle = couponSearchText(query);
  return needle && [
    ticket.ticketId,
    ticket.cashierCode,
    ticket.publicCode,
    ticket.ticketHash,
  ].some((value) => couponSearchText(value) === needle || couponSearchText(value).includes(needle));
}

function couponSummary(tickets) {
  const totals = tickets.reduce((summary, ticket) => {
    const stake = couponNumber(ticket.grossStake);
    const payout = couponNumber(ticket.netPayout);
    const won = ticket.status === "won";
    summary.betsPlaced += 1;
    if (won) summary.betsWon += 1;
    summary.grossStake += stake;
    summary.exciseDuty += couponNumber(ticket.exciseDuty);
    summary.netStake += couponNumber(ticket.netStake);
    summary.grossPayout += couponNumber(ticket.grossPayout);
    summary.whtOnWinnings += couponNumber(ticket.whtOnWinnings);
    summary.payoutDisbursed += payout;
    summary.profit += couponNumber(ticket.netStake) - payout;
    return summary;
  }, {
    betsPlaced: 0,
    betsWon: 0,
    grossStake: 0,
    exciseDuty: 0,
    netStake: 0,
    grossPayout: 0,
    whtOnWinnings: 0,
    payoutDisbursed: 0,
    profit: 0,
  });

  Object.keys(totals).forEach((key) => {
    if (key !== "betsPlaced" && key !== "betsWon") totals[key] = Number(totals[key].toFixed(2));
  });
  return totals;
}

router.get("/coupons", adminRequired, (req, res) => {
  try {
    const store = loadStore();
    const {
      from,
      to,
      status,
      betType,
      user,
      betId,
      betCode,
      minWin,
      maxWin,
      sport,
      category,
      tournament,
      match,
      market,
      outcome,
      onlyPaids,
      includeBonus,
      missingEvents,
      orderBy,
    } = req.query;

    const userMap = {};
    (store.users || []).forEach((u) => {
      userMap[String(u.id)] = u;
    });
    const scope = couponScope(store, req.user);
    let tickets = (store.bets || [])
      .filter(scope)
      .map((ticket) => mapCoupon(store, ticket, userMap, req));

    const statusFilter = couponSearchText(status);
    if (statusFilter && statusFilter !== "all") tickets = tickets.filter((ticket) => ticket.status === statusFilter);

    const typeFilter = couponSearchText(betType);
    if (typeFilter && typeFilter !== "all") {
      const byType = typeFilter === "issued" ? "open" : typeFilter;
      tickets = tickets.filter((ticket) => ticket.status === byType);
    }

    const fromTime = from ? new Date(from).getTime() : NaN;
    const toTime = to ? new Date(to).getTime() : NaN;
    if (Number.isFinite(fromTime)) tickets = tickets.filter((ticket) => new Date(ticket.placedAt).getTime() >= fromTime);
    if (Number.isFinite(toTime)) tickets = tickets.filter((ticket) => new Date(ticket.placedAt).getTime() <= toTime);

    const codeSearch = couponSearchText(betCode || betId);
    if (codeSearch) tickets = tickets.filter((ticket) => couponMatchesPublicCode(ticket, codeSearch));

    const userSearch = couponSearchText(user);
    if (userSearch) {
      tickets = tickets.filter((ticket) => [ticket.userId, ticket.username, ticket.userPhone, ticket.player, ticket.parent]
        .some((value) => couponSearchText(value).includes(userSearch)));
    }

    const minValue = Number(minWin);
    const maxValue = Number(maxWin);
    if (Number.isFinite(minValue)) tickets = tickets.filter((ticket) => ticket.potentialWin >= minValue);
    if (Number.isFinite(maxValue)) tickets = tickets.filter((ticket) => ticket.potentialWin <= maxValue);

    const selectionFilter = (query, field) => {
      const needle = couponSearchText(query);
      if (!needle) return;
      tickets = tickets.filter((ticket) => ticket.selections.some((selection) => {
        if (field === "sport") return couponSearchText(selection.sport || "football") === needle;
        if (field === "category") return couponSearchText(selection.category || selection.sport) === needle;
        if (field === "tournament") return couponSearchText(selection.leagueName || selection.tournament).includes(needle);
        if (field === "match") return [selection.fixtureName, selection.homeName, selection.awayName].some((value) => couponSearchText(value).includes(needle));
        if (field === "market") return [selection.marketName, selection.marketKey].some((value) => couponSearchText(value).includes(needle));
        if (field === "outcome") return [selection.selectionName, selection.value].some((value) => couponSearchText(value).includes(needle));
        return selectionContains(selection, needle);
      }));
    };
    selectionFilter(sport && sport.toLowerCase() !== "all" ? sport : "", "sport");
    selectionFilter(category, "category");
    selectionFilter(tournament, "tournament");
    selectionFilter(match, "match");
    selectionFilter(market, "market");
    selectionFilter(outcome, "outcome");
    if (String(onlyPaids).toLowerCase() === "true" || String(onlyPaids) === "1") tickets = tickets.filter((ticket) => ticket.payout > 0 || ticket.paymentDate);
    if (String(includeBonus).toLowerCase() === "true" || String(includeBonus) === "1") tickets = tickets.filter((ticket) => ticket.bonusAwarded);
    if (String(missingEvents).toLowerCase() === "true" || String(missingEvents) === "1") tickets = tickets.filter((ticket) => ticket.missingEvents > 0);

    tickets.sort((a, b) => {
      const left = new Date(a.placedAt).getTime();
      const right = new Date(b.placedAt).getTime();
      return orderBy === "asc" ? left - right : right - left;
    });

    res.json({
      ok: true,
      total: tickets.length,
      coupons: tickets,
      summary: couponSummary(tickets),
      filters: { from: from || null, to: to || null },
    });
  } catch (err) {
    console.error("Admin coupons error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

function bonusPaymentTicketKeys(ticket) {
  const keys = new Set();
  [ticket?.ticket_id, ticket?.ticketId, ticket?.id, ticket?.bet_id, ticket?.publicCode, ticket?.ticketHash].forEach((value) => {
    const key = couponSearchText(value);
    if (key) keys.add(key);
  });
  try {
    const publicCode = couponSearchText(ticketPublicCode(ticket));
    if (publicCode) keys.add(publicCode);
  } catch (_) {}
  try {
    const cashierCode = couponSearchText(couponCashierCode(ticket));
    if (cashierCode) keys.add(cashierCode);
  } catch (_) {}
  return Array.from(keys);
}

function bonusPaymentDateMs(value, endOfDay = false) {
  if (!value) return NaN;
  const raw = String(value).trim();
  const ms = new Date(raw).getTime();
  if (!Number.isFinite(ms)) return NaN;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return ms + 86399999;
  return ms;
}

function bonusPaymentAmountMatches(actual, expected, criteria) {
  const target = Number(expected);
  if (!Number.isFinite(target)) return true;
  const value = Number(actual || 0);
  const op = String(criteria || "eq").trim().toLowerCase();
  if (["gt", ">", "greater", "greater-than", "more"].includes(op)) return value > target;
  if (["gte", ">=", "greater-equal", "greater-than-or-equal"].includes(op)) return value >= target;
  if (["lt", "<", "less", "less-than"].includes(op)) return value < target;
  if (["lte", "<=", "less-equal", "less-than-or-equal"].includes(op)) return value <= target;
  return Math.abs(value - target) < 0.01;
}

function mapBonusPaymentRecord(tx, ticket, userMap) {
  const meta = (tx && tx.meta) || {};
  const userId = tx?.user_id || ticket?.user_id || meta.userId || meta.playerId || null;
  const user = userMap[String(userId)] || null;
  const ticketCode = ticket ? ticketPublicCode(ticket) : couponSearchText(meta.publicCode || tx?.reference || meta.ticketId).toUpperCase();
  const cashierCode = ticket
    ? couponCashierCode(ticket)
    : (meta.cashierCode || (meta.ticketId || tx?.reference ? couponCashierCode({ ticket_id: meta.ticketId || tx?.reference }) : null));
  const amount = couponNumber(tx ? Math.abs(Number(tx.amount || 0)) : (ticket?.bonus_amount || ticket?.bonus));
  const ruleName = ticket?.bonus_rule_name || meta.ruleName || meta.bonusRule || "Near-miss Bonus";
  const failedCount = meta.failedCount ?? ticket?.bonus_failed_count;
  const totalTeams = meta.totalTeams ?? ticket?.bonus_total_teams;
  const multiplier = meta.multiplier ?? ticket?.bonus_multiplier;
  const ticketStatus = couponSearchText(ticket?.status);
  const status = ticketStatus === "cancelled" ? "cancelled" : (tx || amount > 0 ? "paid" : "pending");
  const noteParts = [];
  if (ruleName) noteParts.push(ruleName);
  if (failedCount != null && totalTeams != null) noteParts.push(`Cut ${failedCount} of ${totalTeams} teams`);
  if (multiplier != null) noteParts.push(`${multiplier}x stake bonus`);

  return {
    id: tx?.id || `B-${ticket?.ticket_id || ticket?.id || ticketCode}`,
    transactionId: tx?.id || null,
    ticketId: ticket?.ticket_id || meta.ticketId || tx?.reference || null,
    betCode: cashierCode || ticketCode || tx?.reference || meta.ticketId || "—",
    publicCode: ticketCode || null,
    cashierCode: cashierCode || (ticket ? couponCashierCode(ticket) : null) || ticketCode || null,
    skin: ticket?.skin || meta.skin || "HabtamBet",
    bonus: ruleName,
    username: user ? (user.username || user.display_name || user.phone || `User ${user.id}`) : (userId ? `User ${userId}` : "Cashier Walk-in"),
    userId,
    date: tx?.created_at || ticket?.bonus_paid_at || ticket?.settled_at || ticket?.payment_date || ticket?.result_time || ticket?.placed_at || ticket?.created_at || null,
    note: meta.note || noteParts.filter(Boolean).join(" — ") || "Bonus payment credited to wallet",
    amount,
    status,
    balanceAfter: tx?.balance_after ?? null,
    multiplier: multiplier != null ? Number(multiplier) : null,
    failedCount: failedCount != null ? Number(failedCount) : null,
    totalTeams: totalTeams != null ? Number(totalTeams) : null,
    reference: tx?.reference || null,
  };
}

router.get("/bonus-payments", adminRequired, (req, res) => {
  try {
    const store = loadStore();
    const {
      from,
      to,
      status,
      betCode,
      id,
      username,
      amount,
      criteria,
      search,
      q,
    } = req.query;

    const userMap = {};
    (store.users || []).forEach((u) => {
      userMap[String(u.id)] = u;
    });

    const tickets = store.bets || [];
    const ticketScope = couponScope(store, req.user);
    const ticketByKey = new Map();
    tickets.forEach((ticket) => {
      bonusPaymentTicketKeys(ticket).forEach((key) => {
        if (key && !ticketByKey.has(key)) ticketByKey.set(key, ticket);
      });
    });

    const allowedUserIds = new Set(
      (store.users || [])
        .filter((u) => String(u.id) === String(req.user.id) || String(u.created_by_admin_id) === String(req.user.id))
        .map((u) => String(u.id))
    );
    const findTicketForTx = (tx) => {
      const meta = tx.meta || {};
      const candidates = [meta.ticketId, meta.betId, meta.publicCode, meta.ticketHash, tx.reference];
      for (const candidate of candidates) {
        const key = couponSearchText(candidate);
        if (key && ticketByKey.has(key)) return ticketByKey.get(key);
      }
      return null;
    };

    const seenTicketIds = new Set();
    let records = [];

    (store.transactions || [])
      .filter((tx) => couponSearchText(tx.type).includes("bonus"))
      .forEach((tx) => {
        const ticket = findTicketForTx(tx);
        if (ticket && !ticketScope(ticket)) return;
        if (!ticket && req.user.role === "admin" && !allowedUserIds.has(String(tx.user_id))) return;
        if (ticket) seenTicketIds.add(String(ticket.ticket_id || ticket.id));
        records.push(mapBonusPaymentRecord(tx, ticket, userMap));
      });

    tickets
      .filter(ticketScope)
      .filter((ticket) => couponNumber(ticket.bonus_amount || ticket.bonus) > 0)
      .forEach((ticket) => {
        const key = String(ticket.ticket_id || ticket.id);
        if (seenTicketIds.has(key)) return;
        seenTicketIds.add(key);
        records.push(mapBonusPaymentRecord(null, ticket, userMap));
      });

    const fromMs = bonusPaymentDateMs(from, false);
    const toMs = bonusPaymentDateMs(to, true);
    if (Number.isFinite(fromMs)) records = records.filter((row) => bonusPaymentDateMs(row.date) >= fromMs);
    if (Number.isFinite(toMs)) records = records.filter((row) => bonusPaymentDateMs(row.date) <= toMs);

    const statusFilter = couponSearchText(status);
    if (statusFilter && statusFilter !== "all") records = records.filter((row) => couponSearchText(row.status) === statusFilter);

    const codeFilter = couponSearchText(betCode);
    if (codeFilter) {
      records = records.filter((row) => [row.betCode, row.ticketId, row.publicCode, row.cashierCode, row.reference]
        .some((value) => couponSearchText(value).includes(codeFilter)));
    }

    const idFilter = couponSearchText(id);
    if (idFilter) records = records.filter((row) => couponSearchText(row.id).includes(idFilter) || couponSearchText(row.transactionId).includes(idFilter));

    const userFilter = couponSearchText(username);
    if (userFilter) records = records.filter((row) => [row.username, row.userId].some((value) => couponSearchText(value).includes(userFilter)));

    if (String(amount || "").trim()) records = records.filter((row) => bonusPaymentAmountMatches(row.amount, amount, criteria));

    const anySearch = couponSearchText(search || q);
    if (anySearch) {
      records = records.filter((row) => [row.id, row.betCode, row.publicCode, row.cashierCode, row.username, row.bonus, row.note, row.status]
        .some((value) => couponSearchText(value).includes(anySearch)));
    }

    records.sort((a, b) => bonusPaymentDateMs(b.date) - bonusPaymentDateMs(a.date));

    const total = records.length;
    const requestedLimit = Number(req.query.limit || 100);
    const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 100, 250));
    const requestedPage = Number(req.query.page || 1);
    const page = Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1);
    const start = (page - 1) * limit;
    const paged = records.slice(start, start + limit);
    const round = (value) => Number(Number(value || 0).toFixed(2));
    const summary = records.reduce((acc, row) => {
      acc.totalAmount += couponNumber(row.amount);
      if (row.status === "paid") acc.paidAmount += couponNumber(row.amount);
      if (row.status === "pending") acc.pendingAmount += couponNumber(row.amount);
      return acc;
    }, { count: total, totalAmount: 0, paidAmount: 0, pendingAmount: 0 });
    summary.totalAmount = round(summary.totalAmount);
    summary.paidAmount = round(summary.paidAmount);
    summary.pendingAmount = round(summary.pendingAmount);

    res.json({
      ok: true,
      total,
      page,
      limit,
      bonusPayments: paged,
      payments: paged,
      summary,
      filters: { from: from || null, to: to || null, status: status || "all" },
    });
  } catch (err) {
    console.error("Admin bonus payments error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/coupons/:ticketId/cancel", adminRequired, (req, res) => {
  try {
    const query = req.params.ticketId;
    const actor = req.user || {};
    const result = withStore((store) => {
      const userMap = {};
      (store.users || []).forEach((u) => {
        userMap[String(u.id)] = u;
      });
      const scope = couponScope(store, actor);
      const ticket = (store.bets || []).find((row) => {
        if (!scope(row)) return false;
        const coupon = mapCoupon(store, row, userMap, { user: actor });
        return couponMatchesPublicCode(coupon, query);
      });

      if (!ticket) {
        const error = new Error("Ticket not found or outside your shop scope");
        error.status = 404;
        throw error;
      }
      const status = String(ticket.status || "open").toLowerCase();
      if (status !== "open") {
        const error = new Error(`Only open tickets can be cancelled; current status is ${status}`);
        error.status = 409;
        throw error;
      }

      const placedMs = new Date(ticket.placed_at || ticket.created_at || 0).getTime();
      if (!Number.isFinite(placedMs) || Date.now() - placedMs > COUPON_CANCEL_WINDOW_MS) {
        const error = new Error("The 5-minute cancellation window has expired");
        error.status = 409;
        throw error;
      }
      if (ticket.cancelled_at || ticket.cancel_refunded_at) {
        const error = new Error("Ticket has already been cancelled and refunded");
        error.status = 409;
        throw error;
      }

      const stake = couponNumber(ticket.stake);
      const userKey = String(ticket.user_id);
      if (!store.wallets[userKey]) {
        store.wallets[userKey] = { user_id: ticket.user_id, balance: 0, currency: "ETB", updated_at: new Date().toISOString() };
      }
      const wallet = store.wallets[userKey];
      wallet.balance = Number((Number(wallet.balance || 0) + stake).toFixed(2));
      wallet.updated_at = new Date().toISOString();
      const now = new Date().toISOString();

      ticket.status = "cancelled";
      ticket.payout = 0;
      ticket.cancelled_at = now;
      ticket.cancelled_by = actor.id || actor.username || null;
      ticket.cancelled_by_username = actor.username || actor.email || null;
      ticket.cancellation_reason = String(req.body?.reason || "Cancelled by shop admin");
      ticket.cancel_refunded_at = now;
      ticket.settled_at = null;

      addTransaction(store, ticket.user_id, "bet_cancel_refund", stake, wallet.balance, ticket.ticket_id, {
        ticketId: ticket.ticket_id,
        publicCode: ticketPublicCode(ticket),
        cancelledBy: actor.id || actor.username || null,
      });
      addAuditLog(store, actor, "cancel_coupon", { type: "bet", id: ticket.ticket_id }, {
        stake,
        publicCode: ticketPublicCode(ticket),
        reason: ticket.cancellation_reason,
      });

      return {
        ticket: mapCoupon(store, ticket, userMap, { user: actor }),
        balance: wallet.balance,
      };
    });

    res.json({ ok: true, ...result, message: "Coupon cancelled and stake refunded" });
  } catch (err) {
    const status = Number(err.status) || 500;
    if (status >= 500) console.error("Admin coupon cancellation error:", err);
    res.status(status).json({ ok: false, error: err.message || "Could not cancel coupon" });
  }
});

// 11. Submit / Enter match result (scores and cards)
router.post("/match-result", adminRequired, (req, res) => {
  try {
    const fixtureId = Number(req.body.fixtureId);
    if (!fixtureId) {
      return res.status(400).json({ ok: false, error: "fixtureId is required" });
    }

    const homeGoals = Number(req.body.homeGoals ?? req.body.goalsHome ?? 0);
    const awayGoals = Number(req.body.awayGoals ?? req.body.goalsAway ?? 0);
    const htHomeGoals = Number(req.body.htHomeGoals ?? req.body.htHome ?? Math.floor(homeGoals / 2));
    const htAwayGoals = Number(req.body.htAwayGoals ?? req.body.htAway ?? Math.floor(awayGoals / 2));

    const homeYellow = Number(req.body.homeYellow ?? req.body.homeYellowCards ?? 0);
    const awayYellow = Number(req.body.awayYellow ?? req.body.awayYellowCards ?? 0);
    const htHomeYellow = Number(req.body.htHomeYellow ?? req.body.htHomeYellowCards ?? 0);
    const htAwayYellow = Number(req.body.htAwayYellow ?? req.body.htAwayYellowCards ?? 0);
    const homeRed = Number(req.body.homeRed ?? 0);
    const awayRed = Number(req.body.awayRed ?? 0);

    const matchResultObj = {
      fixtureId,
      status: "FT",
      homeGoals,
      awayGoals,
      htHomeGoals,
      htAwayGoals,
      homeYellow,
      awayYellow,
      totalYellow: homeYellow + awayYellow,
      htHomeYellow,
      htAwayYellow,
      htTotalYellow: htHomeYellow + htAwayYellow,
      shHomeYellow: Math.max(0, homeYellow - htHomeYellow),
      shAwayYellow: Math.max(0, awayYellow - htAwayYellow),
      shTotalYellow: Math.max(0, homeYellow - htHomeYellow) + Math.max(0, awayYellow - htAwayYellow),
      homeRed,
      awayRed,
      totalRed: homeRed + awayRed,
      submittedBy: req.user.id,
      submittedAt: new Date().toISOString(),
    };

    const homeCorners = req.body.homeCorners != null ? Number(req.body.homeCorners) : (req.body.corners?.home != null ? Number(req.body.corners.home) : null);
    const awayCorners = req.body.awayCorners != null ? Number(req.body.awayCorners) : (req.body.corners?.away != null ? Number(req.body.corners.away) : null);
    const htHomeCorners = req.body.htHomeCorners != null ? Number(req.body.htHomeCorners) : (req.body.corners?.htHome != null ? Number(req.body.corners.htHome) : null);
    const htAwayCorners = req.body.htAwayCorners != null ? Number(req.body.htAwayCorners) : (req.body.corners?.htAway != null ? Number(req.body.corners.htAway) : null);

    if (homeCorners != null && awayCorners != null) {
      const hH = htHomeCorners ?? Math.floor(homeCorners / 2);
      const hA = htAwayCorners ?? Math.floor(awayCorners / 2);
      matchResultObj.corners = {
        home: homeCorners,
        away: awayCorners,
        htHome: hH,
        htAway: hA,
        total: homeCorners + awayCorners,
        htTotal: hH + hA,
        shHome: Math.max(0, homeCorners - hH),
        shAway: Math.max(0, awayCorners - hA),
        shTotal: Math.max(0, homeCorners - hH) + Math.max(0, awayCorners - hA),
        firstCorner: req.body.firstCorner || (homeCorners >= awayCorners ? "home" : "away"),
        lastCorner: req.body.lastCorner || (awayCorners > 0 ? "away" : "home"),
      };
    }

    withStore((store) => {
      if (!store.matchResults) store.matchResults = {};
      store.matchResults[String(fixtureId)] = matchResultObj;
    });

    // Auto settle open tickets that include this fixture
    const betsRouter = require("./bets");
    if (betsRouter && typeof betsRouter.autoSettleOpenTickets === "function") {
      betsRouter.autoSettleOpenTickets().catch(() => {});
    }

    res.json({
      ok: true,
      message: `Result for match #${fixtureId} submitted successfully`,
      matchResult: matchResultObj,
    });
  } catch (err) {
    console.error("[POST /admin/match-result] Error:", err);
    res.status(500).json({ ok: false, error: err.message || "Could not save match result" });
  }
});

// GET /api/admin/tickets/:ticketId - Search and fetch ticket for editor
router.get("/tickets/:ticketId", superAdminRequired, (req, res) => {
  try {
    const store = loadStore();
    const query = req.params.ticketId;
    const target = String(query || "").trim().toLowerCase();
    const rawTarget = target.replace(/\D/g, "");

    const bet = (store.bets || []).find((b) => {
      const bid = String(b.ticket_id || b.id || "").toLowerCase();
      const bnum = String(b.ticketNumber || b.ticket_number || "").toLowerCase();
      const bcode = String(b.public_code || b.publicCode || b.ticket_hash || b.ticketHash || "").toLowerCase();
      const bcash = String(b.cashier_code || b.cashierCode || "").toLowerCase();
      if (bid === target || (rawTarget && bid.replace(/\D/g, "") === rawTarget)) return true;
      if (bnum === target) return true;
      if (bcode === target || bcode.includes(target)) return true;
      if (bcash === target || (rawTarget && bcash === rawTarget)) return true;
      return false;
    });

    if (!bet) {
      return res.status(404).json({ ok: false, error: `Ticket '${query}' not found` });
    }

    let selections = [];
    try {
      selections = typeof bet.selections === "string" ? JSON.parse(bet.selections) : (bet.selections || []);
    } catch (_) {
      selections = [];
    }

    const user = (store.users || []).find((u) => String(u.id) === String(bet.user_id));
    let wallet = null;
    if (store.wallets) {
      if (Array.isArray(store.wallets)) {
        wallet = store.wallets.find((w) => String(w.user_id) === String(bet.user_id));
      } else if (typeof store.wallets === "object") {
        wallet = store.wallets[String(bet.user_id)] || store.wallets[Number(bet.user_id)];
      }
    }

    const bonusRules = store.settings?.bonus_rules || [];

    res.json({
      ok: true,
      ticket: {
        id: bet.ticket_id || bet.id,
        ticketId: bet.ticket_id || bet.id,
        publicCode: bet.public_code || ticketPublicCode(bet),
        cashierCode: bet.cashier_code || "1000",
        userId: bet.user_id,
        status: bet.status,
        stake: bet.stake,
        totalOdds: bet.total_odds || bet.totalOdds,
        potentialWin: bet.potential_win || bet.potentialWin,
        payout: bet.payout || 0,
        bonusAwarded: Boolean(bet.bonus_awarded || (bet.bonus_amount && bet.bonus_amount > 0)),
        bonusAmount: bet.bonus_amount || 0,
        bonusMultiplier: bet.bonus_multiplier || null,
        bonusRuleName: bet.bonus_rule_name || null,
        bonusFailedCount: bet.bonus_failed_count || null,
        bonusTotalTeams: bet.bonus_total_teams || null,
        bonusEffectiveOdds: bet.bonus_effective_odds || null,
        placedAt: bet.placed_at,
        settledAt: bet.settled_at,
        mode: bet.mode || (selections.length > 1 ? "multiple" : "single"),
        selections,
      },
      player: {
        id: bet.user_id,
        username: user?.username || `User #${bet.user_id}`,
        displayName: user?.display_name || user?.username || `User #${bet.user_id}`,
        phone: user?.phone || "",
        balance: wallet ? Number(wallet.balance || 0) : 0,
      },
      bonusRules,
    });
  } catch (err) {
    console.error("[GET /admin/tickets/:ticketId] Error:", err);
    res.status(500).json({ ok: false, error: err.message || "Failed to fetch ticket" });
  }
});

// POST /api/admin/tickets/:ticketId/edit-settle - Edit selections, recalculate/force bonus or win, adjust wallet
router.post("/tickets/:ticketId/edit-settle", superAdminRequired, (req, res) => {
  try {
    const query = req.params.ticketId;
    const target = String(query || "").trim().toLowerCase();
    const rawTarget = target.replace(/\D/g, "");

    const {
      selections,
      ticketStatus,
      bonusAwarded,
      bonusRuleName,
      bonusMultiplier,
      bonusAmount,
      payout,
      adjustWallet = true,
      note = "",
    } = req.body;

    let updatedTicket = null;
    let payoutDelta = 0;
    let oldPayout = 0;
    let newPayout = 0;
    let targetUserId = null;
    let targetTicketId = null;

    withStore((store) => {
      const bet = (store.bets || []).find((b) => {
        const bid = String(b.ticket_id || b.id || "").toLowerCase();
        const bnum = String(b.ticketNumber || b.ticket_number || "").toLowerCase();
        const bcode = String(b.public_code || b.publicCode || b.ticket_hash || b.ticketHash || "").toLowerCase();
        const bcash = String(b.cashier_code || b.cashierCode || "").toLowerCase();
        if (bid === target || (rawTarget && bid.replace(/\D/g, "") === rawTarget)) return true;
        if (bnum === target) return true;
        if (bcode === target || bcode.includes(target)) return true;
        if (bcash === target || (rawTarget && bcash === rawTarget)) return true;
        return false;
      });

      if (!bet) {
        throw new Error(`Ticket '${query}' not found`);
      }

      targetUserId = bet.user_id;
      targetTicketId = bet.ticket_id || bet.id;
      oldPayout = Number(bet.payout || 0);

      let currentSelections = [];
      try {
        currentSelections = typeof bet.selections === "string" ? JSON.parse(bet.selections) : (bet.selections || []);
      } catch (_) {
        currentSelections = [];
      }

      if (Array.isArray(selections) && selections.length > 0) {
        currentSelections = selections.map((sel, idx) => {
          const prev = currentSelections[idx] || {};
          const newOdd = sel.odd != null ? Number(sel.odd) : (prev.odd != null ? Number(prev.odd) : 1);
          return {
            ...prev,
            ...sel,
            odd: newOdd,
            odds: newOdd,
            status: sel.status || prev.status || "open",
            htScore: sel.htScore != null ? sel.htScore : prev.htScore,
            ftScore: sel.ftScore != null ? sel.ftScore : prev.ftScore,
            score: sel.score != null ? sel.score : prev.score,
          };
        });
        bet.selections = JSON.stringify(currentSelections);

        const recalcTotalOdds = currentSelections.reduce((acc, s) => acc * (Number(s.odd || s.odds || 1) || 1), 1.0);
        const roundedTotalOdds = Math.round(recalcTotalOdds * 100) / 100;
        bet.total_odds = req.body.totalOdds != null ? Number(req.body.totalOdds) : roundedTotalOdds;
        bet.totalOdds = bet.total_odds;

        const recalcPotWin = Math.round(Number(bet.stake || 0) * (Number(bet.total_odds) || roundedTotalOdds) * 100) / 100;
        bet.potential_win = req.body.potentialWin != null ? Number(req.body.potentialWin) : recalcPotWin;
        bet.potentialWin = bet.potential_win;
      }

      const betsRouter = require("./bets");
      const calcBonusFn = betsRouter.calculateNearMissBonus || function() { return null; };

      const totalLegs = currentSelections.length;
      const lostCount = currentSelections.filter((s) => s.status === "lost").length;
      const openCount = currentSelections.filter((s) => s.status === "open" || !s.status).length;

      let effectiveOdds = 1.0;
      for (const s of currentSelections) {
        if (s.status === "won") {
          const o = Number(s.odd || s.odds || 1);
          if (o > 0) effectiveOdds *= o;
        }
      }
      effectiveOdds = Math.round(effectiveOdds * 100) / 100;

      const requestedMode = String(ticketStatus || "auto").toLowerCase();

      if (requestedMode === "auto") {
        if (openCount > 0) {
          bet.status = "open";
          newPayout = 0;
          bet.bonus_awarded = false;
          bet.bonus_amount = 0;
        } else if (lostCount === 0) {
          bet.status = "won";
          const potWin = Number(bet.potential_win || (bet.stake * effectiveOdds));
          newPayout = Math.round(potWin * 100) / 100;
          bet.bonus_awarded = false;
          bet.bonus_amount = 0;
        } else {
          const bonusInfo = calcBonusFn(bet.stake, currentSelections);
          if (bonusInfo && bonusInfo.amount > 0) {
            bet.status = "lost";
            bet.bonus_awarded = true;
            bet.bonus_amount = bonusInfo.amount;
            bet.bonus_multiplier = bonusInfo.multiplier;
            bet.bonus_rule_name = bonusInfo.rule?.name || "Cut Bonus";
            bet.bonus_failed_count = bonusInfo.failedCount;
            bet.bonus_total_teams = bonusInfo.totalTeams;
            bet.bonus_effective_odds = bonusInfo.effectiveOdds;
            newPayout = bonusInfo.amount;
          } else {
            bet.status = "lost";
            bet.bonus_awarded = false;
            bet.bonus_amount = 0;
            newPayout = 0;
          }
        }
      } else if (requestedMode === "bonus") {
        bet.status = "lost";
        bet.bonus_awarded = true;
        bet.bonus_amount = Number(bonusAmount != null ? bonusAmount : (payout != null ? payout : bet.stake));
        bet.bonus_multiplier = Number(bonusMultiplier || 1);
        bet.bonus_rule_name = bonusRuleName || "Cut Bonus (Manual)";
        bet.bonus_failed_count = lostCount || 1;
        bet.bonus_total_teams = totalLegs;
        bet.bonus_effective_odds = effectiveOdds;
        newPayout = bet.bonus_amount;
      } else if (requestedMode === "won") {
        bet.status = "won";
        bet.bonus_awarded = false;
        bet.bonus_amount = 0;
        newPayout = Number(payout != null ? payout : (bet.potential_win || (bet.stake * effectiveOdds)));
      } else if (requestedMode === "lost") {
        bet.status = "lost";
        if (bonusAwarded && Number(bonusAmount || payout) > 0) {
          bet.bonus_awarded = true;
          bet.bonus_amount = Number(bonusAmount || payout);
          bet.bonus_multiplier = Number(bonusMultiplier || 1);
          bet.bonus_rule_name = bonusRuleName || "Cut Bonus";
          bet.bonus_failed_count = lostCount || 1;
          bet.bonus_total_teams = totalLegs;
          bet.bonus_effective_odds = effectiveOdds;
          newPayout = bet.bonus_amount;
        } else {
          bet.bonus_awarded = false;
          bet.bonus_amount = 0;
          newPayout = 0;
        }
      } else if (requestedMode === "open") {
        bet.status = "open";
        bet.bonus_awarded = false;
        bet.bonus_amount = 0;
        newPayout = 0;
      }

      if (payout != null && requestedMode !== "auto") {
        newPayout = Number(payout);
      }

      bet.payout = newPayout;
      bet.settled_at = bet.status === "open" ? null : (bet.settled_at || new Date().toISOString());
      bet.edited_by = req.user.id;
      bet.edited_at = new Date().toISOString();
      bet.edit_note = note || undefined;

      payoutDelta = Math.round((newPayout - oldPayout) * 100) / 100;
      updatedTicket = bet;
    });

    if (adjustWallet && payoutDelta !== 0 && targetUserId) {
      if (payoutDelta > 0) {
        creditWallet(
          targetUserId,
          payoutDelta,
          updatedTicket.bonus_awarded ? "bonus_cut" : "admin_ticket_payout_adj",
          targetTicketId,
          {
            ticketId: targetTicketId,
            note: note || "Admin settlement edit",
            payoutDelta,
            newPayout,
            oldPayout,
            bonusAwarded: updatedTicket.bonus_awarded,
          }
        );
      } else if (payoutDelta < 0) {
        try {
          debitWallet(
            targetUserId,
            Math.abs(payoutDelta),
            "admin_ticket_payout_adj",
            targetTicketId,
            {
              ticketId: targetTicketId,
              note: note || "Admin settlement reduction",
              payoutDelta,
              newPayout,
              oldPayout,
            }
          );
        } catch (debitErr) {
          if (debitErr.code === "INSUFFICIENT_BALANCE") {
            withStore((store) => {
              const key = String(targetUserId);
              const wallet = store.wallets && store.wallets[key];
              if (wallet && wallet.balance > 0) {
                const deductAmt = wallet.balance;
                wallet.balance = 0;
                wallet.updated_at = new Date().toISOString();
                addTransaction(store, targetUserId, "admin_ticket_payout_adj", -deductAmt, 0, targetTicketId, {
                  ticketId: targetTicketId,
                  note: (note || "Admin settlement reduction") + ` (Capped from ${Math.abs(payoutDelta)} to available balance ${deductAmt})`,
                  payoutDelta,
                  actualDeducted: deductAmt,
                });
              }
            });
          } else {
            console.warn("[admin_ticket_payout_adj] debitWallet error:", debitErr.message);
          }
        }
      }
    }

    try {
      withStore((s) => {
        addAuditLog(s, req.user, "ticket_edit_settle", { type: "bet", id: targetTicketId }, {
          ticketId: targetTicketId,
          oldPayout,
          newPayout,
          payoutDelta,
          status: updatedTicket.status,
          bonusAwarded: updatedTicket.bonus_awarded,
          bonusAmount: updatedTicket.bonus_amount,
          note,
        });
      });
    } catch (auditErr) {
      console.warn("[ticket_edit_settle] Audit log warning:", auditErr.message);
    }

    const store = loadStore();
    let currentWallet = null;
    if (store.wallets) {
      if (Array.isArray(store.wallets)) {
        currentWallet = store.wallets.find((w) => String(w.user_id) === String(targetUserId));
      } else if (typeof store.wallets === "object") {
        currentWallet = store.wallets[String(targetUserId)] || store.wallets[Number(targetUserId)];
      }
    }

    res.json({
      ok: true,
      message: `Ticket #${targetTicketId} successfully updated and settled`,
      ticket: updatedTicket,
      payoutDelta,
      oldPayout,
      newPayout,
      newBalance: currentWallet ? currentWallet.balance : undefined,
    });
  } catch (err) {
    console.error("[POST /admin/tickets/:ticketId/edit-settle] Error:", err);
    res.status(500).json({ ok: false, error: err.message || "Failed to update ticket" });
  }
});

module.exports = router;
