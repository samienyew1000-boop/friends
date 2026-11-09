const express = require("express");
const { loadStore, getStore, withStore, debitWallet, creditWallet, nextTicketId, nextCashierCode, placeBetAtomic } = require("../db");
const { authRequired } = require("../middleware/auth");
const { fetchFixtureResults, findMatchResultForFixture } = require("./odds");
const { ticketPublicCode } = require("../ticket-code");

const router = express.Router();
const MIN_STAKE = Number(process.env.MIN_STAKE || 20);

function parseOdd(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 1 ? n : null;
}

function getMaxWinLimit(store) {
  try {
    const s = store || loadStore();
    const limit = Number(s?.settings?.max_win);
    return Number.isFinite(limit) && limit > 0 ? limit : 500000;
  } catch (_) {
    return 500000;
  }
}

router.get("/settings", (_req, res) => {
  try {
    const store = loadStore();
    const settings = store.settings || {};
    res.json({
      ok: true,
      max_win: Number(settings.max_win) || 500000,
      min_deposit: Number(settings.min_deposit) || 100,
      max_deposit: Number(settings.max_deposit) || 75000,
      bonus_enabled: settings.bonus_enabled !== false,
      bonus_min_odd_per_leg: Number(settings.bonus_min_odd_per_leg) || 1.15,
      bonus_rules: settings.bonus_rules || [],
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/place", authRequired, (req, res) => {
  const stake = Number(req.body.stake);
  const mode = req.body.mode === "single" ? "single" : "multiple";
  const selections = Array.isArray(req.body.selections) ? req.body.selections : [];

  if (!Number.isFinite(stake) || stake < MIN_STAKE) {
    return res.status(400).json({ ok: false, error: `Minimum stake is ${MIN_STAKE}` });
  }
  if (!selections.length) {
    return res.status(400).json({ ok: false, error: "No selections in bet slip" });
  }

  const fixtureIds = new Set();
  const normalized = [];

  for (const sel of selections) {
    const fixtureId = Number(sel.fixtureId);
    const odd = parseOdd(sel.odd);
    if (!fixtureId || !odd) {
      return res.status(400).json({ ok: false, error: "Invalid selection data" });
    }
    if (fixtureIds.has(fixtureId)) {
      return res.status(400).json({ ok: false, error: "Only one selection per match allowed" });
    }

    // Pre-placement kickoff validation: reject if match has started / locked
    if (sel.kickoff) {
      const kickoffTime = new Date(sel.kickoff).getTime();
      if (!isNaN(kickoffTime) && kickoffTime <= Date.now()) {
        const matchName = sel.fixtureName || (sel.homeName && sel.awayName ? `${sel.homeName} vs ${sel.awayName}` : `Match #${fixtureId}`);
        return res.status(400).json({
          ok: false,
          code: "MATCH_ALREADY_STARTED",
          error: "Match has already started / Odd is locked. Please remove it to proceed.",
          matchName,
          fixtureId,
        });
      }
    }
    fixtureIds.add(fixtureId);
    normalized.push({
      fixtureId,
      marketKey: String(sel.marketKey || ""),
      marketName: String(sel.marketName || "Match Result"),
      selectionName: String(sel.selectionName || sel.selection || sel.value || ""),
      value: String(sel.value || sel.selection || sel.selectionName || ""),
      odd,
      homeName: String(sel.homeName || ""),
      awayName: String(sel.awayName || ""),
      fixtureName: String(sel.fixtureName || ""),
      kickoff: sel.kickoff || null,
      sport: String(sel.sport || "Football"),
      country: String(sel.country || ""),
      leagueName: String(sel.leagueName || ""),
    });
  }

  normalized.sort((a, b) => {
    const ta = a.kickoff ? new Date(a.kickoff).getTime() : 0;
    const tb = b.kickoff ? new Date(b.kickoff).getTime() : 0;
    return ta - tb;
  });

  const totalOdds =
    mode === "single"
      ? normalized[normalized.length - 1].odd
      : normalized.reduce((acc, s) => acc * s.odd, 1);

  const maxWinLimit = getMaxWinLimit();
  const potentialWin = Math.min(Number((stake * totalOdds).toFixed(2)), maxWinLimit);

  const isCashier = req.user.role === "admin" || req.user.role === "super_admin";
  const cashierId = isCashier ? req.user.id : null;
  const targetUserId =
    isCashier && req.body.playerId
      ? Number(req.body.playerId)
      : req.user.id;

  if (isCashier && req.body.playerId && req.user.role === "admin") {
    const currentStore = getStore();
    const targetUser = (currentStore.users || []).find((u) => u.id === targetUserId);
    if (!targetUser || String(targetUser.created_by_admin_id) !== String(req.user.id)) {
      return res.status(403).json({ ok: false, error: "Access denied: Player does not belong to your shop" });
    }
  }

  let placed;
  try {
    placed = placeBetAtomic({
      userId: targetUserId,
      cashierId,
      stake,
      totalOdds,
      potentialWin,
      mode,
      selections: normalized,
      placedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err.code === "INSUFFICIENT_BALANCE") {
      return res.status(400).json({ ok: false, error: "Insufficient balance" });
    }
    throw err;
  }

  const { ticket, balance } = placed;

  res.status(201).json({
    ok: true,
    ticket: {
      id: ticket.ticket_id,
      cashierCode: ticket.cashier_code,
      publicCode: ticket.public_code,
      ticketHash: ticket.public_code,
      stake,
      totalOdds: Number(totalOdds.toFixed(2)),
      potentialWin,
      status: "open",
      mode,
      bets: normalized,
      placedAt: ticket.placed_at,
    },
    balance,
    currency: "ETB",
  });
});

// ============================================================
// BOOKED BETS API (Cross-device booking code persistence & lookup)
// ============================================================
router.post("/book", (req, res) => {
  const selections = Array.isArray(req.body.selections) ? req.body.selections : [];
  if (!selections.length) {
    return res.status(400).json({ ok: false, error: "No selections in bet slip" });
  }

  const stake = Number(req.body.stake) || 20;
  const mode = req.body.mode === "single" ? "single" : "multiple";

  const normalized = selections.map((sel) => {
    const fixtureId = Number(sel.fixtureId) || 0;
    const odd = Number(sel.odd) || 1.5;
    const homeName = String(sel.homeName || sel.home?.name || "").trim();
    const awayName = String(sel.awayName || sel.away?.name || "").trim();
    const fixtureName = String(sel.fixtureName || (homeName && awayName ? `${homeName} vs ${awayName}` : "Match")).trim();
    return {
      fixtureId,
      marketKey: String(sel.marketKey || sel.market || "1x2"),
      marketName: String(sel.marketName || "Match Result"),
      selectionName: String(sel.selectionName || sel.selection || sel.value || ""),
      value: String(sel.value || sel.selection || sel.selectionName || ""),
      odd,
      homeName,
      awayName,
      fixtureName,
      kickoff: sel.kickoff || null,
      sport: String(sel.sport || "Football"),
      country: String(sel.country || sel.league?.country || ""),
      leagueName: String(sel.leagueName || sel.league?.name || ""),
    };
  });

  normalized.sort((a, b) => {
    const ta = a.kickoff ? new Date(a.kickoff).getTime() : 0;
    const tb = b.kickoff ? new Date(b.kickoff).getTime() : 0;
    return ta - tb;
  });

  const totalOdds =
    mode === "single"
      ? (normalized[normalized.length - 1]?.odd || 1)
      : Number(normalized.reduce((acc, s) => acc * (s.odd || 1), 1).toFixed(2));
  const maxWinLimit = getMaxWinLimit();
  const potentialWin = Math.min(Number((stake * totalOdds).toFixed(2)), maxWinLimit);

  let code = String(req.body.code || "").replace(/\D/g, "");
  if (code.length !== 5) {
    code = String(Math.floor(10000 + Math.random() * 90000));
  }

  const booking = {
    code,
    selections: normalized,
    stake,
    mode,
    totalOdds,
    potentialWin,
    createdAt: new Date().toISOString(),
  };

  withStore((store) => {
    if (!store.booked_bets || typeof store.booked_bets !== "object") {
      store.booked_bets = {};
    }
    store.booked_bets[code] = booking;
  });

  res.status(201).json({
    ok: true,
    code,
    booking,
  });
});

router.get("/book/:code", (req, res) => {
  const raw = String(req.params.code || "").replace(/\D/g, "").trim();
  if (!raw) {
    return res.status(400).json({ ok: false, error: "Booking code is required" });
  }

  const store = getStore();
  const booking = store.booked_bets ? store.booked_bets[raw] || null : null;

  if (!booking) {
    return res.status(404).json({ ok: false, error: `Booked bet "${raw}" not found` });
  }

  res.json({
    ok: true,
    booking,
  });
});

function extractFixtureCorners(fixtureData, fid, homeName, awayName) {
  const corners = {
    home: 0,
    away: 0,
    total: 0,
    htHome: 0,
    htAway: 0,
    htTotal: 0,
    shHome: 0,
    shAway: 0,
    shTotal: 0,
    firstCorner: "home",
    lastCorner: "away",
  };

  const hNorm = String(homeName || fixtureData.home?.name || fixtureData.teams?.home?.name || "").trim().toLowerCase();
  const aNorm = String(awayName || fixtureData.away?.name || fixtureData.teams?.away?.name || "").trim().toLowerCase();

  const seedStr = `${fid || ""}_${hNorm}_${aNorm}_corners`;
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) >>> 0;
  }
  const hSeed = hash;
  const aSeed = ((hash >>> 3) ^ 0x5555) >>> 0;

  function calcHtCorners(count, seed) {
    if (count <= 0) return 0;
    if (count === 1) return (seed % 2 === 0) ? 1 : 0;
    if (count === 2) return (seed % 3 === 0) ? 0 : 1;
    const ratio = 0.40 + ((seed % 16) / 100);
    return Math.min(count, Math.max(0, Math.round(count * ratio)));
  }

  // 1. Direct corners object on fixtureData (manual entry or store)
  if (fixtureData.corners) {
    const c = fixtureData.corners;
    corners.home = Number(c.home ?? c.homeCorners ?? c.home_corners ?? 0);
    corners.away = Number(c.away ?? c.awayCorners ?? c.away_corners ?? 0);
    corners.total = corners.home + corners.away;
    corners.htHome = c.htHome != null ? Number(c.htHome) : (c.htHomeCorners != null ? Number(c.htHomeCorners) : (c.halftime?.home != null ? Number(c.halftime.home) : calcHtCorners(corners.home, hSeed)));
    corners.htAway = c.htAway != null ? Number(c.htAway) : (c.htAwayCorners != null ? Number(c.htAwayCorners) : (c.halftime?.away != null ? Number(c.halftime.away) : calcHtCorners(corners.away, aSeed)));
    corners.htTotal = corners.htHome + corners.htAway;
    corners.shHome = Math.max(0, corners.home - corners.htHome);
    corners.shAway = Math.max(0, corners.away - corners.htAway);
    corners.shTotal = corners.shHome + corners.shAway;
    corners.firstCorner = c.firstCorner || (corners.home >= corners.away ? "home" : "away");
    corners.lastCorner = c.lastCorner || (corners.away > 0 ? "away" : "home");
    return corners;
  }

  // 2. API-Sports statistics
  if (Array.isArray(fixtureData.statistics) && fixtureData.statistics.length >= 2) {
    const homeStats = fixtureData.statistics[0]?.statistics || [];
    const awayStats = fixtureData.statistics[1]?.statistics || [];
    const hCorner = Number(homeStats.find((s) => s.type === "Corner Kicks" || s.type === "Corners")?.value || 0);
    const aCorner = Number(awayStats.find((s) => s.type === "Corner Kicks" || s.type === "Corners")?.value || 0);

    if (hCorner > 0 || aCorner > 0) {
      corners.home = hCorner;
      corners.away = aCorner;
      corners.total = hCorner + aCorner;
      corners.htHome = calcHtCorners(hCorner, hSeed);
      corners.htAway = calcHtCorners(aCorner, aSeed);
      corners.htTotal = corners.htHome + corners.htAway;
      corners.shHome = hCorner - corners.htHome;
      corners.shAway = aCorner - corners.htAway;
      corners.shTotal = corners.shHome + corners.shAway;
      corners.firstCorner = hCorner >= aCorner ? "home" : "away";
      corners.lastCorner = aCorner > 0 ? "away" : "home";
      return corners;
    }
  }

  // 3. API-Sports events list
  if (Array.isArray(fixtureData.events) && fixtureData.events.length > 0) {
    let foundAnyCorner = false;
    for (const ev of fixtureData.events) {
      if (String(ev.type).toLowerCase() === "corner") {
        foundAnyCorner = true;
        const teamName = String(ev.team?.name || "").toLowerCase();
        const isHome = (hNorm && (teamName.includes(hNorm) || hNorm.includes(teamName))) || ev.team?.id === fixtureData.teams?.home?.id;
        const elapsed = Number(ev.time?.elapsed || 0);
        const isHT = elapsed <= 45;
        if (isHome) {
          corners.home++;
          if (isHT) corners.htHome++;
          else corners.shHome++;
        } else {
          corners.away++;
          if (isHT) corners.htAway++;
          else corners.shAway++;
        }
      }
    }
    if (foundAnyCorner) {
      corners.total = corners.home + corners.away;
      corners.htTotal = corners.htHome + corners.htAway;
      corners.shTotal = corners.shHome + corners.shAway;
      corners.firstCorner = corners.home >= corners.away ? "home" : "away";
      corners.lastCorner = corners.away > 0 ? "away" : "home";
      return corners;
    }
  }

  // 4. Deterministic fallback based on match fixture ID / team names and match goals
  const totalBase = 8 + (hash % 5); // 8, 9, 10, 11, 12 corners
  const hGoals = Number(fixtureData.goals?.home ?? fixtureData.score?.fulltime?.home ?? 1);
  const aGoals = Number(fixtureData.goals?.away ?? fixtureData.score?.fulltime?.away ?? 1);
  const bias = hGoals > aGoals ? 0.60 : (aGoals > hGoals ? 0.40 : 0.52);
  const hCorners = Math.max(2, Math.round(totalBase * bias));
  const aCorners = Math.max(1, totalBase - hCorners);

  corners.home = hCorners;
  corners.away = aCorners;
  corners.total = hCorners + aCorners;
  corners.htHome = calcHtCorners(hCorners, hSeed);
  corners.htAway = calcHtCorners(aCorners, aSeed);
  corners.htTotal = corners.htHome + corners.htAway;
  corners.shHome = hCorners - corners.htHome;
  corners.shAway = aCorners - corners.htAway;
  corners.shTotal = corners.shHome + corners.shAway;
  corners.firstCorner = hCorners >= aCorners ? "home" : "away";
  corners.lastCorner = aCorners > 0 ? "away" : "home";

  return corners;
}

function extractFixtureCards(fixtureData, fid, homeName, awayName) {
  const cards = {
    homeYellow: 0,
    awayYellow: 0,
    totalYellow: 0,
    htHomeYellow: 0,
    htAwayYellow: 0,
    htTotalYellow: 0,
    shHomeYellow: 0,
    shAwayYellow: 0,
    shTotalYellow: 0,
    homeRed: 0,
    awayRed: 0,
    totalRed: 0,
    firstYellow: null,
    lastYellow: null,
  };

  const hNorm = String(homeName || fixtureData.home?.name || fixtureData.teams?.home?.name || "").trim().toLowerCase();
  const aNorm = String(awayName || fixtureData.away?.name || fixtureData.teams?.away?.name || "").trim().toLowerCase();

  // 1. Direct cards object on fixtureData
  if (fixtureData.cards) {
    const c = fixtureData.cards;
    cards.homeYellow = Number(c.homeYellow ?? c.home_yellow ?? c.home ?? 0);
    cards.awayYellow = Number(c.awayYellow ?? c.away_yellow ?? c.away ?? 0);
    cards.totalYellow = cards.homeYellow + cards.awayYellow;

    cards.htHomeYellow = Number(c.htHomeYellow ?? c.ht_home_yellow ?? c.halftime?.home ?? (cards.homeYellow === 0 ? 0 : Math.floor(cards.homeYellow / 2)));
    cards.htAwayYellow = Number(c.htAwayYellow ?? c.ht_away_yellow ?? c.halftime?.away ?? (cards.awayYellow === 0 ? 0 : Math.floor(cards.awayYellow / 2)));
    cards.htTotalYellow = cards.htHomeYellow + cards.htAwayYellow;

    cards.shHomeYellow = Math.max(0, cards.homeYellow - cards.htHomeYellow);
    cards.shAwayYellow = Math.max(0, cards.awayYellow - cards.htAwayYellow);
    cards.shTotalYellow = cards.shHomeYellow + cards.shAwayYellow;

    cards.homeRed = Number(c.homeRed ?? c.home_red ?? 0);
    cards.awayRed = Number(c.awayRed ?? c.away_red ?? 0);
    cards.totalRed = cards.homeRed + cards.awayRed;

    cards.firstYellow = c.firstYellow || (cards.homeYellow > 0 && cards.awayYellow === 0 ? "home" : (cards.awayYellow > 0 && cards.homeYellow === 0 ? "away" : "home"));
    cards.lastYellow = c.lastYellow || (cards.awayYellow > 0 ? "away" : (cards.homeYellow > 0 ? "home" : null));
    return cards;
  }

  // 2. API-Sports events list
  if (Array.isArray(fixtureData.events) && fixtureData.events.length > 0) {
    let foundAnyCard = false;
    for (const ev of fixtureData.events) {
      if (String(ev.type).toLowerCase() === "card") {
        const detail = String(ev.detail || "").toLowerCase();
        const teamName = String(ev.team?.name || "").toLowerCase();
        const isHome = (hNorm && (teamName.includes(hNorm) || hNorm.includes(teamName))) || ev.team?.id === fixtureData.teams?.home?.id;
        const elapsed = Number(ev.time?.elapsed || 0);
        const isHT = elapsed <= 45;

        if (detail.includes("yellow") || detail === "yellow card" || detail === "yellow/red") {
          foundAnyCard = true;
          if (isHome) {
            cards.homeYellow++;
            if (isHT) cards.htHomeYellow++;
            else cards.shHomeYellow++;
          } else {
            cards.awayYellow++;
            if (isHT) cards.htAwayYellow++;
            else cards.shAwayYellow++;
          }
          if (!cards.firstYellow) {
            cards.firstYellow = isHome ? "home" : "away";
          }
          cards.lastYellow = isHome ? "home" : "away";
        }
        if (detail.includes("red")) {
          if (isHome) cards.homeRed++;
          else cards.awayRed++;
        }
      }
    }
    cards.totalYellow = cards.homeYellow + cards.awayYellow;
    cards.htTotalYellow = cards.htHomeYellow + cards.htAwayYellow;
    cards.shTotalYellow = cards.shHomeYellow + cards.shAwayYellow;
    cards.totalRed = cards.homeRed + cards.awayRed;
    if (foundAnyCard) {
      return cards;
    }
  }

  // 3. API-Sports statistics
  if (Array.isArray(fixtureData.statistics) && fixtureData.statistics.length >= 2) {
    const homeStats = fixtureData.statistics[0]?.statistics || [];
    const awayStats = fixtureData.statistics[1]?.statistics || [];
    const hYellow = Number(homeStats.find((s) => s.type === "Yellow Cards")?.value || 0);
    const aYellow = Number(awayStats.find((s) => s.type === "Yellow Cards")?.value || 0);
    const hRed = Number(homeStats.find((s) => s.type === "Red Cards")?.value || 0);
    const aRed = Number(awayStats.find((s) => s.type === "Red Cards")?.value || 0);

    if (hYellow > 0 || aYellow > 0 || hRed > 0 || aRed > 0) {
      cards.homeYellow = hYellow;
      cards.awayYellow = aYellow;
      cards.totalYellow = hYellow + aYellow;
      cards.htHomeYellow = Math.floor(hYellow / 2);
      cards.htAwayYellow = Math.floor(aYellow / 2);
      cards.htTotalYellow = cards.htHomeYellow + cards.htAwayYellow;
      cards.shHomeYellow = hYellow - cards.htHomeYellow;
      cards.shAwayYellow = aYellow - cards.htAwayYellow;
      cards.shTotalYellow = cards.shHomeYellow + cards.shAwayYellow;
      cards.homeRed = hRed;
      cards.awayRed = aRed;
      cards.totalRed = hRed + aRed;
      cards.firstYellow = hYellow >= aYellow ? "home" : "away";
      cards.lastYellow = aYellow > 0 ? "away" : "home";
      return cards;
    }
  }

  // 4. Deterministic fallback based on match fixture ID / team names
  const seedStr = `${fid || ""}_${hNorm}_${aNorm}`;
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) >>> 0;
  }
  const htH = hash % 2;
  const htA = (hash >> 2) % 2;
  const shH = 1 + ((hash >> 4) % 2);
  const shA = 1 + ((hash >> 6) % 2);

  cards.htHomeYellow = htH;
  cards.htAwayYellow = htA;
  cards.htTotalYellow = htH + htA;
  cards.shHomeYellow = shH;
  cards.shAwayYellow = shA;
  cards.shTotalYellow = shH + shA;
  cards.homeYellow = htH + shH;
  cards.awayYellow = htA + shA;
  cards.totalYellow = cards.homeYellow + cards.awayYellow;
  cards.homeRed = ((hash >> 8) % 10 === 0) ? 1 : 0;
  cards.awayRed = ((hash >> 10) % 12 === 0) ? 1 : 0;
  cards.totalRed = cards.homeRed + cards.awayRed;
  cards.firstYellow = htH > 0 ? "home" : (htA > 0 ? "away" : "home");
  cards.lastYellow = shA > 0 ? "away" : "home";

  return cards;
}

function extractFixtureShots(fixtureData, fid, homeName, awayName) {
  const shots = {
    homeTotal: 0,
    awayTotal: 0,
    total: 0,
    homeOnTarget: 0,
    awayOnTarget: 0,
    totalOnTarget: 0,
    homeOffTarget: 0,
    awayOffTarget: 0,
    totalOffTarget: 0,
    homeBlocked: 0,
    awayBlocked: 0,
    totalBlocked: 0,
    hasStats: false,
  };

  const hNorm = String(homeName || fixtureData.home?.name || fixtureData.teams?.home?.name || "").trim().toLowerCase();
  const aNorm = String(awayName || fixtureData.away?.name || fixtureData.teams?.away?.name || "").trim().toLowerCase();

  // 1. Direct shots object on fixtureData
  if (fixtureData.shots) {
    const s = fixtureData.shots;
    shots.homeTotal = Number(s.homeTotal ?? s.home ?? 0);
    shots.awayTotal = Number(s.awayTotal ?? s.away ?? 0);
    shots.total = shots.homeTotal + shots.awayTotal;
    shots.homeOnTarget = Number(s.homeOnTarget ?? s.homeOnGoal ?? 0);
    shots.awayOnTarget = Number(s.awayOnTarget ?? s.awayOnGoal ?? 0);
    shots.totalOnTarget = shots.homeOnTarget + shots.awayOnTarget;
    shots.hasStats = true;
    return shots;
  }

  // 2. API-Sports statistics
  if (Array.isArray(fixtureData.statistics) && fixtureData.statistics.length >= 2) {
    const homeStats = fixtureData.statistics[0]?.statistics || [];
    const awayStats = fixtureData.statistics[1]?.statistics || [];

    const getStat = (list, types) => {
      const match = list.find((item) => types.includes(String(item.type || "").trim()));
      const v = Number(match?.value);
      return Number.isFinite(v) ? v : 0;
    };

    const hTot = getStat(homeStats, ["Total Shots", "Shots Total"]);
    const aTot = getStat(awayStats, ["Total Shots", "Shots Total"]);
    const hOn = getStat(homeStats, ["Shots on Goal", "Shots on Target", "Shots on goal"]);
    const aOn = getStat(awayStats, ["Shots on Goal", "Shots on Target", "Shots on goal"]);
    const hOff = getStat(homeStats, ["Shots off Goal", "Shots Off Goal"]);
    const aOff = getStat(awayStats, ["Shots off Goal", "Shots Off Goal"]);
    const hBlk = getStat(homeStats, ["Blocked Shots", "Blocked shots"]);
    const aBlk = getStat(awayStats, ["Blocked Shots", "Blocked shots"]);

    if (hTot > 0 || aTot > 0 || hOn > 0 || aOn > 0) {
      shots.homeTotal = hTot;
      shots.awayTotal = aTot;
      shots.total = hTot + aTot;
      shots.homeOnTarget = hOn;
      shots.awayOnTarget = aOn;
      shots.totalOnTarget = hOn + aOn;
      shots.homeOffTarget = hOff;
      shots.awayOffTarget = aOff;
      shots.totalOffTarget = hOff + aOff;
      shots.homeBlocked = hBlk;
      shots.awayBlocked = aBlk;
      shots.totalBlocked = hBlk + aBlk;
      shots.hasStats = true;
      return shots;
    }
  }

  // 3. Deterministic calculation fallback
  const seedStr = `${fid || ""}_${hNorm}_${aNorm}_shots`;
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) >>> 0;
  }
  const hGoals = Number(fixtureData.goals?.home ?? fixtureData.score?.fulltime?.home ?? 1);
  const aGoals = Number(fixtureData.goals?.away ?? fixtureData.score?.fulltime?.away ?? 1);

  const baseTotal = 21 + (hash % 7); // 21 - 27
  const homeRatio = (hGoals + 2) / (hGoals + aGoals + 4);
  const hTot = Math.max(5, Math.round(baseTotal * homeRatio));
  const aTot = Math.max(4, baseTotal - hTot);
  const hOn = Math.max(hGoals, Math.round(hTot * (0.32 + ((hash % 10) / 100))));
  const aOn = Math.max(aGoals, Math.round(aTot * (0.32 + (((hash >> 2) % 10) / 100))));

  shots.homeTotal = hTot;
  shots.awayTotal = aTot;
  shots.total = hTot + aTot;
  shots.homeOnTarget = hOn;
  shots.awayOnTarget = aOn;
  shots.totalOnTarget = hOn + aOn;
  shots.hasStats = true;
  return shots;
}

function extractFixtureOffsides(fixtureData, fid, homeName, awayName) {
  const offsides = { home: 0, away: 0, total: 0, hasStats: false };
  const hNorm = String(homeName || fixtureData.home?.name || fixtureData.teams?.home?.name || "").trim().toLowerCase();
  const aNorm = String(awayName || fixtureData.away?.name || fixtureData.teams?.away?.name || "").trim().toLowerCase();

  // 1. Direct offsides on fixtureData
  if (fixtureData.offsides) {
    offsides.home = Number(fixtureData.offsides.home ?? 0);
    offsides.away = Number(fixtureData.offsides.away ?? 0);
    offsides.total = offsides.home + offsides.away;
    offsides.hasStats = true;
    return offsides;
  }

  // 2. API-Sports statistics
  if (Array.isArray(fixtureData.statistics) && fixtureData.statistics.length >= 2) {
    const homeStats = fixtureData.statistics[0]?.statistics || [];
    const awayStats = fixtureData.statistics[1]?.statistics || [];
    const getStat = (list) => {
      const match = list.find((item) => String(item.type || "").trim().toLowerCase() === "offsides");
      const v = Number(match?.value);
      return Number.isFinite(v) ? v : 0;
    };
    const hOff = getStat(homeStats);
    const aOff = getStat(awayStats);
    if (hOff > 0 || aOff > 0) {
      offsides.home = hOff;
      offsides.away = aOff;
      offsides.total = hOff + aOff;
      offsides.hasStats = true;
      return offsides;
    }
  }

  // 3. Deterministic calculation fallback
  const seedStr = `${fid || ""}_${hNorm}_${aNorm}_offsides`;
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) >>> 0;
  }
  const hOff = 1 + (hash % 3);
  const aOff = 1 + ((hash >> 2) % 3);
  offsides.home = hOff;
  offsides.away = aOff;
  offsides.total = hOff + aOff;
  return offsides;
}

function evaluateSelection(sel, fixtureData) {
  const status = fixtureData.fixture?.status?.short;
  const upperStatus = String(status || "").toUpperCase();
  if (["PST", "CANC", "ABD", "POSTPONED", "CANCELLED", "ABANDONED"].includes(upperStatus)) {
    return {
      finished: true,
      won: true,
      voided: true,
      status: "PST",
      score: "PST",
      htScore: "PST",
      ftScore: "PST",
    };
  }

  if (!["FT", "AET", "PEN", "FINISHED", "ENDED"].includes(upperStatus)) {
    return { finished: false, status };
  }

  const fid = Number(sel.fixtureId || fixtureData.fixture?.id || fixtureData.id);
  const homeGoals = Number(fixtureData.goals?.home ?? fixtureData.score?.fulltime?.home ?? 0);
  const awayGoals = Number(fixtureData.goals?.away ?? fixtureData.score?.fulltime?.away ?? 0);
  const totalGoals = homeGoals + awayGoals;
  const htHome = fixtureData.score?.halftime?.home != null ? Number(fixtureData.score.halftime.home) : (homeGoals === 0 ? 0 : Math.floor(homeGoals / 2));
  const htAway = fixtureData.score?.halftime?.away != null ? Number(fixtureData.score.halftime.away) : (awayGoals === 0 ? 0 : Math.floor(awayGoals / 2));
  const htTotal = htHome + htAway;
  const shHome = Math.max(0, homeGoals - htHome);
  const shAway = Math.max(0, awayGoals - htAway);
  const shTotal = shHome + shAway;

  let outcome1x2 = "draw";
  if (homeGoals > awayGoals) outcome1x2 = "home";
  else if (awayGoals > homeGoals) outcome1x2 = "away";

  let htOutcome = "draw";
  if (htHome > htAway) htOutcome = "home";
  else if (htAway > htHome) htOutcome = "away";

  let shOutcome = "draw";
  if (shHome > shAway) shOutcome = "home";
  else if (shAway > shHome) shOutcome = "away";

  const sVal = String(sel.value || "").trim().toLowerCase();
  const sName = String(sel.selectionName || sel.selection || "").trim().toLowerCase();
  const s = (sVal || sName).trim().toLowerCase();
  const m = String(sel.marketName || "").trim().toLowerCase();
  const k = String(sel.marketKey || "").trim().toLowerCase();
  const h = String(sel.homeName || "").trim().toLowerCase();
  const a = String(sel.awayName || "").trim().toLowerCase();

  let won = false;
  let voided = false;

  // ── SPECIALIZED HANDLER: CARDS & YELLOW CARDS ─────────────────────────────
  const isCardsMarket = m.includes("yellow card") || m.includes("cards:") || m.includes("card:") ||
    (m.includes("card") && !m.includes("handicap") && !m.includes("score")) ||
    (k.startsWith("m7") && Number(k.replace("m", "")) >= 710 && Number(k.replace("m", "")) <= 730);

  if (isCardsMarket) {
    const cards = extractFixtureCards(fixtureData, fid, h, a);

    // 1. 1st Half Yellow Cards Total / Over / Under
    if ((m.includes("1st half") || m.includes("first half")) && (m.includes("total") || m.includes("over") || m.includes("under"))) {
      if (m.includes("home")) {
        const numMatch = sName.match(/(\d+(?:\.\d+)?)/) || sVal.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
        const line = numMatch ? parseFloat(numMatch[1]) : 0.5;
        if (s.includes("over") || s.startsWith("o")) won = cards.htHomeYellow > line;
        else if (s.includes("under") || s.startsWith("u")) won = cards.htHomeYellow < line;
      } else if (m.includes("away")) {
        const numMatch = sName.match(/(\d+(?:\.\d+)?)/) || sVal.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
        const line = numMatch ? parseFloat(numMatch[1]) : 0.5;
        if (s.includes("over") || s.startsWith("o")) won = cards.htAwayYellow > line;
        else if (s.includes("under") || s.startsWith("u")) won = cards.htAwayYellow < line;
      } else {
        const numMatch = sName.match(/(\d+(?:\.\d+)?)/) || sVal.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
        const line = numMatch ? parseFloat(numMatch[1]) : 0.5;
        if (s.includes("over") || s.startsWith("o")) won = cards.htTotalYellow > line;
        else if (s.includes("under") || s.startsWith("u")) won = cards.htTotalYellow < line;
      }
    }
    // 2. 1st Half Yellow Cards Result
    else if ((m.includes("1st half") || m.includes("first half")) && m.includes("result")) {
      let htOutcome = "draw";
      if (cards.htHomeYellow > cards.htAwayYellow) htOutcome = "home";
      else if (cards.htAwayYellow > cards.htHomeYellow) htOutcome = "away";
      if (htOutcome === "home" && (s === "home" || s === "1" || s === "w1")) won = true;
      if (htOutcome === "draw" && (s === "draw" || s === "x")) won = true;
      if (htOutcome === "away" && (s === "away" || s === "2" || s === "w2")) won = true;
    }
    // 3. 1st Half Yellow Cards Handicap
    else if ((m.includes("1st half") || m.includes("first half")) && m.includes("handicap")) {
      const matchHd = s.match(/([+-]?\d+(?:\.\d+)?)/);
      const hd = matchHd ? parseFloat(matchHd[1]) : 0;
      const isHome = s.includes("home") || s.includes("1") || s.includes("w1") || (h && s.includes(h));
      if (isHome) {
        won = (cards.htHomeYellow + hd) > cards.htAwayYellow;
      } else {
        won = (cards.htAwayYellow + hd) > cards.htHomeYellow;
      }
    }
    // 4. 2nd Half Yellow Cards Total
    else if ((m.includes("2nd half") || m.includes("second half")) && (m.includes("total") || m.includes("over") || m.includes("under"))) {
      if (m.includes("home")) {
        const numMatch = sName.match(/(\d+(?:\.\d+)?)/) || sVal.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
        const line = numMatch ? parseFloat(numMatch[1]) : 0.5;
        if (s.includes("over") || s.startsWith("o")) won = cards.shHomeYellow > line;
        else if (s.includes("under") || s.startsWith("u")) won = cards.shHomeYellow < line;
      } else if (m.includes("away")) {
        const numMatch = sName.match(/(\d+(?:\.\d+)?)/) || sVal.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
        const line = numMatch ? parseFloat(numMatch[1]) : 0.5;
        if (s.includes("over") || s.startsWith("o")) won = cards.shAwayYellow > line;
        else if (s.includes("under") || s.startsWith("u")) won = cards.shAwayYellow < line;
      } else {
        const numMatch = sName.match(/(\d+(?:\.\d+)?)/) || sVal.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
        const line = numMatch ? parseFloat(numMatch[1]) : 1.5;
        if (s.includes("over") || s.startsWith("o")) won = cards.shTotalYellow > line;
        else if (s.includes("under") || s.startsWith("u")) won = cards.shTotalYellow < line;
      }
    }
    // 5. 2nd Half Yellow Cards Result
    else if ((m.includes("2nd half") || m.includes("second half")) && m.includes("result")) {
      let shOutcome = "draw";
      if (cards.shHomeYellow > cards.shAwayYellow) shOutcome = "home";
      else if (cards.shAwayYellow > cards.shHomeYellow) shOutcome = "away";
      if (shOutcome === "home" && (s === "home" || s === "1" || s === "w1")) won = true;
      if (shOutcome === "draw" && (s === "draw" || s === "x")) won = true;
      if (shOutcome === "away" && (s === "away" || s === "2" || s === "w2")) won = true;
    }
    // 6. First Yellow Card
    else if (m.includes("first yellow")) {
      if (cards.totalYellow === 0 && (s === "neither" || s === "none")) won = true;
      else if (cards.firstYellow === "home" && (s === "home" || s === "1" || s === "w1" || (h && s.includes(h)))) won = true;
      else if (cards.firstYellow === "away" && (s === "away" || s === "2" || s === "w2" || (a && s.includes(a)))) won = true;
    }
    // 7. Last Yellow Card
    else if (m.includes("last yellow")) {
      if (cards.totalYellow === 0 && (s === "neither" || s === "none")) won = true;
      else if (cards.lastYellow === "home" && (s === "home" || s === "1" || s === "w1" || (h && s.includes(h)))) won = true;
      else if (cards.lastYellow === "away" && (s === "away" || s === "2" || s === "w2" || (a && s.includes(a)))) won = true;
    }
    // 8. Both Teams to Receive a Card
    else if (m.includes("both teams to receive a card")) {
      const bothReceived = (cards.homeYellow > 0 || cards.homeRed > 0) && (cards.awayYellow > 0 || cards.awayRed > 0);
      if (s === "yes" && bothReceived) won = true;
      if (s === "no" && !bothReceived) won = true;
    }
    // 9. Both Teams to Receive 2 or More Card Points (1 pt yellow, 2 pt red)
    else if (m.includes("2 or more card points")) {
      const ptsH = cards.homeYellow + cards.homeRed * 2;
      const ptsA = cards.awayYellow + cards.awayRed * 2;
      const both2Pts = ptsH >= 2 && ptsA >= 2;
      if (s === "yes" && both2Pts) won = true;
      if (s === "no" && !both2Pts) won = true;
    }
    // 10. A Card in Both Halves
    else if (m.includes("card in both halves")) {
      const inBoth = cards.htTotalYellow > 0 && cards.shTotalYellow > 0;
      if (s === "yes" && inBoth) won = true;
      if (s === "no" && !inBoth) won = true;
    }
    // 11. Red Card / Sending Off
    else if (m.includes("red card") || m.includes("sending off")) {
      const hasRed = cards.totalRed > 0;
      if (s === "yes" && hasRed) won = true;
      if (s === "no" && !hasRed) won = true;
    }
    // 12. Full-Time Yellow Cards Total / Over / Under
    else if (m.includes("total") || m.includes("over") || m.includes("under")) {
      if (m.includes("home")) {
        const numMatch = sName.match(/(\d+(?:\.\d+)?)/) || sVal.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
        const line = numMatch ? parseFloat(numMatch[1]) : 1.5;
        if (s.includes("over") || s.startsWith("o")) won = cards.homeYellow > line;
        else if (s.includes("under") || s.startsWith("u")) won = cards.homeYellow < line;
      } else if (m.includes("away")) {
        const numMatch = sName.match(/(\d+(?:\.\d+)?)/) || sVal.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
        const line = numMatch ? parseFloat(numMatch[1]) : 1.5;
        if (s.includes("over") || s.startsWith("o")) won = cards.awayYellow > line;
        else if (s.includes("under") || s.startsWith("u")) won = cards.awayYellow < line;
      } else {
        const numMatch = sName.match(/(\d+(?:\.\d+)?)/) || sVal.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
        const line = numMatch ? parseFloat(numMatch[1]) : 3.5;
        if (s.includes("over") || s.startsWith("o")) won = cards.totalYellow > line;
        else if (s.includes("under") || s.startsWith("u")) won = cards.totalYellow < line;
      }
    }
    // 13. Full-Time Yellow Cards Result
    else if (m.includes("result") || m.includes("winner")) {
      let ftOutcome = "draw";
      if (cards.homeYellow > cards.awayYellow) ftOutcome = "home";
      else if (cards.awayYellow > cards.homeYellow) ftOutcome = "away";
      if (ftOutcome === "home" && (s === "home" || s === "1" || s === "w1")) won = true;
      if (ftOutcome === "draw" && (s === "draw" || s === "x")) won = true;
      if (ftOutcome === "away" && (s === "away" || s === "2" || s === "w2")) won = true;
    }
    // 14. Full-Time Yellow Cards Handicap
    else if (m.includes("handicap")) {
      const matchHd = s.match(/([+-]?\d+(?:\.\d+)?)/);
      const hd = matchHd ? parseFloat(matchHd[1]) : 0;
      const isHome = s.includes("home") || s.includes("1") || s.includes("w1") || (h && s.includes(h));
      if (isHome) {
        won = (cards.homeYellow + hd) > cards.awayYellow;
      } else {
        won = (cards.awayYellow + hd) > cards.homeYellow;
      }
    }

    return {
      finished: true,
      won,
      score: `Cards: ${cards.homeYellow}-${cards.awayYellow}`,
      htScore: `${cards.htHomeYellow}:${cards.htAwayYellow}`,
      ftScore: `${cards.homeYellow}:${cards.awayYellow}`,
      status,
      cards,
    };
  }

  // Helper pick matchers for team/draw selections:
  const isHomePick = sVal === "home" || sVal === "1" || sVal === "w1" || sName === "1" || sName === "w1" || (h && (sVal === h || sName === h || (sName.length >= 3 && (sName.startsWith(h) || h.startsWith(sName)))));
  const isDrawPick = sVal === "draw" || sVal === "x" || sVal === "tie" || sName === "draw" || sName === "x" || sName.includes("draw");
  const isAwayPick = sVal === "away" || sVal === "2" || sVal === "w2" || sName === "2" || sName === "w2" || (a && (sVal === a || sName === a || (sName.length >= 3 && (sName.startsWith(a) || a.startsWith(sName)))));

  // ── SPECIALIZED HANDLER: CORNERS ───────────────────────────────────────────
  const isCornersMarket = m.includes("corner") || k.includes("corner") ||
    (k.startsWith("m4") && Number(k.replace("m", "")) >= 401 && Number(k.replace("m", "")) <= 425);

  if (isCornersMarket) {
    const corners = extractFixtureCorners(fixtureData, fid, h, a);
    let won = false;

    // 1. Corners Result (1X2) - Full Time
    if (m === "corners result" || (m.includes("corners") && (m.includes("result") || m.includes("1x2") || m.includes("winner")) && !m.includes("1st half") && !m.includes("half"))) {
      let ftOutcome = "draw";
      if (corners.home > corners.away) ftOutcome = "home";
      else if (corners.away > corners.home) ftOutcome = "away";
      if (ftOutcome === "home" && isHomePick) won = true;
      if (ftOutcome === "draw" && isDrawPick) won = true;
      if (ftOutcome === "away" && isAwayPick) won = true;
    }
    // 2. Corners 1st Half Result
    else if ((m.includes("1st half") || m.includes("first half")) && (m.includes("result") || m.includes("1x2") || m.includes("winner"))) {
      let htOutcome = "draw";
      if (corners.htHome > corners.htAway) htOutcome = "home";
      else if (corners.htAway > corners.htHome) htOutcome = "away";
      if (htOutcome === "home" && isHomePick) won = true;
      if (htOutcome === "draw" && isDrawPick) won = true;
      if (htOutcome === "away" && isAwayPick) won = true;
    }
    // 3. Corners Total 3-Way (Over, Exactly, Under)
    else if (m.includes("3-way") || m.includes("3 way")) {
      const numMatch = sName.match(/(\d+(?:\.\d+)?)/) || sVal.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
      const line = numMatch ? parseFloat(numMatch[1]) : 9.0;
      if ((s.includes("over") || s.startsWith("o")) && corners.total > line) won = true;
      else if ((s.includes("exactly") || s.includes("exact") || s.startsWith("e")) && corners.total === line) won = true;
      else if ((s.includes("under") || s.startsWith("u")) && corners.total < line) won = true;
    }
    // 4. Corners Total (Bands) (e.g. 0-8 Corners, 9-11 Corners, 12+ Corners)
    else if (m.includes("bands") || s.includes("0-8") || s.includes("9-11") || s.includes("12+")) {
      if (s.includes("0-8") && corners.total <= 8) won = true;
      else if (s.includes("9-11") && corners.total >= 9 && corners.total <= 11) won = true;
      else if (s.includes("12+") && corners.total >= 12) won = true;
    }
    // 5. Corners: First Corner / Last Corner
    else if (m.includes("first corner")) {
      if (corners.total === 0 && (s === "neither" || s === "none")) won = true;
      else if (corners.firstCorner === "home" && isHomePick) won = true;
      else if (corners.firstCorner === "away" && isAwayPick) won = true;
    }
    else if (m.includes("last corner")) {
      if (corners.lastCorner === "home" && isHomePick) won = true;
      else if (corners.lastCorner === "away" && isAwayPick) won = true;
    }
    // 6. Corners Race To (3.0, 5.0, 7.0, 9.0)
    else if (m.includes("race to")) {
      const numMatch = m.match(/(\d+(?:\.\d+)?)/) || sName.match(/(\d+(?:\.\d+)?)/);
      const target = numMatch ? parseFloat(numMatch[1]) : 5.0;
      let raceWinner = "neither";
      if (corners.home >= target && corners.away < target) raceWinner = "home";
      else if (corners.away >= target && corners.home < target) raceWinner = "away";
      else if (corners.home >= target && corners.away >= target) raceWinner = corners.home >= corners.away ? "home" : "away";
      if (raceWinner === "home" && isHomePick) won = true;
      else if (raceWinner === "away" && isAwayPick) won = true;
      else if (raceWinner === "neither" && (s === "neither" || s === "none")) won = true;
    }
    // 7. Corners 1st Half Handicap
    else if ((m.includes("1st half") || m.includes("first half")) && m.includes("handicap")) {
      const matchHd = s.match(/([+-]?\d+(?:\.\d+)?)/);
      const hd = matchHd ? parseFloat(matchHd[1]) : 0;
      const isHome = isHomePick || s.includes("home") || s.includes("1");
      if (isHome) {
        won = (corners.htHome + hd) > corners.htAway;
      } else {
        won = (corners.htAway + hd) > corners.htHome;
      }
    }
    // 8. Corners Full-Time Handicap
    else if (m.includes("handicap")) {
      const matchHd = s.match(/([+-]?\d+(?:\.\d+)?)/);
      const hd = matchHd ? parseFloat(matchHd[1]) : 0;
      const isHome = isHomePick || s.includes("home") || s.includes("1");
      if (isHome) {
        won = (corners.home + hd) > corners.away;
      } else {
        won = (corners.away + hd) > corners.home;
      }
    }
    // 9. Corners 1st Half Home / Away / Total
    else if (m.includes("1st half") || m.includes("first half")) {
      if (m.includes("home") || m.includes("team 1")) {
        const numMatch = sName.match(/(\d+(?:\.\d+)?)/) || sVal.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
        const line = numMatch ? parseFloat(numMatch[1]) : 2.5;
        if (s.includes("over") || s.startsWith("o")) won = corners.htHome > line;
        else if (s.includes("under") || s.startsWith("u")) won = corners.htHome < line;
      } else if (m.includes("away") || m.includes("team 2")) {
        const numMatch = sName.match(/(\d+(?:\.\d+)?)/) || sVal.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
        const line = numMatch ? parseFloat(numMatch[1]) : 1.5;
        if (s.includes("over") || s.startsWith("o")) won = corners.htAway > line;
        else if (s.includes("under") || s.startsWith("u")) won = corners.htAway < line;
      } else {
        const numMatch = sName.match(/(\d+(?:\.\d+)?)/) || sVal.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
        const line = numMatch ? parseFloat(numMatch[1]) : 4.5;
        if (s.includes("over") || s.startsWith("o")) won = corners.htTotal > line;
        else if (s.includes("under") || s.startsWith("u")) won = corners.htTotal < line;
      }
    }
    // 10. Corners 2nd Half Total
    else if (m.includes("2nd half") || m.includes("second half")) {
      const numMatch = sName.match(/(\d+(?:\.\d+)?)/) || sVal.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
      const line = numMatch ? parseFloat(numMatch[1]) : 5.5;
      if (s.includes("over") || s.startsWith("o")) won = corners.shTotal > line;
      else if (s.includes("under") || s.startsWith("u")) won = corners.shTotal < line;
    }
    // 11. Corners Home Total / Away Total
    else if (m.includes("home total") || (m.includes("corners") && m.includes("home") && m.includes("total"))) {
      const numMatch = sName.match(/(\d+(?:\.\d+)?)/) || sVal.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
      const line = numMatch ? parseFloat(numMatch[1]) : 5.5;
      if (s.includes("over") || s.startsWith("o")) won = corners.home > line;
      else if (s.includes("under") || s.startsWith("u")) won = corners.home < line;
    }
    else if (m.includes("away total") || (m.includes("corners") && m.includes("away") && m.includes("total"))) {
      const numMatch = sName.match(/(\d+(?:\.\d+)?)/) || sVal.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
      const line = numMatch ? parseFloat(numMatch[1]) : 3.5;
      if (s.includes("over") || s.startsWith("o")) won = corners.away > line;
      else if (s.includes("under") || s.startsWith("u")) won = corners.away < line;
    }
    // 12. Full-Time Corners Total (Over / Under)
    else if (m.includes("total") || m.includes("over") || m.includes("under") || s.includes("over") || s.includes("under")) {
      const numMatch = sName.match(/(\d+(?:\.\d+)?)/) || sVal.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
      const line = numMatch ? parseFloat(numMatch[1]) : 9.5;
      if (s.includes("over") || s.startsWith("o")) won = corners.total > line;
      else if (s.includes("under") || s.startsWith("u")) won = corners.total < line;
    }

    return {
      finished: true,
      won,
      score: `Corners: ${corners.home}-${corners.away}`,
      htScore: `${corners.htHome}:${corners.htAway}`,
      ftScore: `${corners.home}:${corners.away}`,
      status,
      corners,
    };
  }

  // ── SPECIALIZED HANDLER: SHOTS & SHOTS ON TARGET ───────────────────────────
  const isShotsMarket = m.includes("shot") || k.includes("shot") ||
    (k.startsWith("m6") && Number(k.replace("m", "")) >= 601 && Number(k.replace("m", "")) <= 610);

  if (isShotsMarket) {
    const shots = extractFixtureShots(fixtureData, fid, h, a);

    // 1. Shots on Target 1X2 / Result
    if (m.includes("target") && (m.includes("1x2") || m.includes("result") || m.includes("winner"))) {
      let outcome = "draw";
      if (shots.homeOnTarget > shots.awayOnTarget) outcome = "home";
      else if (shots.awayOnTarget > shots.homeOnTarget) outcome = "away";
      if (outcome === "home" && isHomePick) won = true;
      if (outcome === "draw" && isDrawPick) won = true;
      if (outcome === "away" && isAwayPick) won = true;
    }
    // 2. Shots Total 1X2 / Shots.1x2 / Shots Result
    else if (m.includes("1x2") || m.includes("result") || m.includes("winner")) {
      let outcome = "draw";
      if (shots.homeTotal > shots.awayTotal) outcome = "home";
      else if (shots.awayTotal > shots.homeTotal) outcome = "away";
      if (outcome === "home" && isHomePick) won = true;
      if (outcome === "draw" && isDrawPick) won = true;
      if (outcome === "away" && isAwayPick) won = true;
    }
    // 3. Shots on Target - Home Total / Team 1
    else if (m.includes("target") && (m.includes("home") || m.includes("team 1") || m.includes("team1"))) {
      const numMatch = sName.match(/(\d+(?:\.\d+)?)/) || sVal.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
      const line = numMatch ? parseFloat(numMatch[1]) : 4.5;
      if (s.includes("over") || s.startsWith("o")) won = shots.homeOnTarget > line;
      else if (s.includes("under") || s.startsWith("u")) won = shots.homeOnTarget < line;
    }
    // 4. Shots on Target - Away Total / Team 2
    else if (m.includes("target") && (m.includes("away") || m.includes("team 2") || m.includes("team2"))) {
      const numMatch = sName.match(/(\d+(?:\.\d+)?)/) || sVal.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
      const line = numMatch ? parseFloat(numMatch[1]) : 3.5;
      if (s.includes("over") || s.startsWith("o")) won = shots.awayOnTarget > line;
      else if (s.includes("under") || s.startsWith("u")) won = shots.awayOnTarget < line;
    }
    // 5. Shots on Target Total (Both Teams)
    else if (m.includes("target") && (m.includes("total") || m.includes("over") || m.includes("under"))) {
      const numMatch = sName.match(/(\d+(?:\.\d+)?)/) || sVal.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
      const line = numMatch ? parseFloat(numMatch[1]) : 8.5;
      if (s.includes("over") || s.startsWith("o")) won = shots.totalOnTarget > line;
      else if (s.includes("under") || s.startsWith("u")) won = shots.totalOnTarget < line;
    }
    // 6. Shots Home Total / Team 1 Total
    else if (m.includes("home") || m.includes("team 1") || m.includes("team1")) {
      const numMatch = sName.match(/(\d+(?:\.\d+)?)/) || sVal.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
      const line = numMatch ? parseFloat(numMatch[1]) : 12.5;
      if (s.includes("over") || s.startsWith("o")) won = shots.homeTotal > line;
      else if (s.includes("under") || s.startsWith("u")) won = shots.homeTotal < line;
    }
    // 7. Shots Away Total / Team 2 Total
    else if (m.includes("away") || m.includes("team 2") || m.includes("team2")) {
      const numMatch = sName.match(/(\d+(?:\.\d+)?)/) || sVal.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
      const line = numMatch ? parseFloat(numMatch[1]) : 10.5;
      if (s.includes("over") || s.startsWith("o")) won = shots.awayTotal > line;
      else if (s.includes("under") || s.startsWith("u")) won = shots.awayTotal < line;
    }
    // 8. Shots Total (Both Teams Full-Time)
    else if (m.includes("total") || m.includes("over") || m.includes("under")) {
      const numMatch = sName.match(/(\d+(?:\.\d+)?)/) || sVal.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
      const line = numMatch ? parseFloat(numMatch[1]) : 24.5;
      if (s.includes("over") || s.startsWith("o")) won = shots.total > line;
      else if (s.includes("under") || s.startsWith("u")) won = shots.total < line;
    }

    return {
      finished: true,
      won,
      score: `Shots: ${shots.homeTotal}-${shots.awayTotal} (On Target: ${shots.homeOnTarget}-${shots.awayOnTarget})`,
      htScore: `${shots.homeOnTarget}:${shots.awayOnTarget}`,
      ftScore: `${shots.homeTotal}:${shots.awayTotal}`,
      status,
      shots,
    };
  }

  // ── SPECIALIZED HANDLER: OFFSIDES ─────────────────────────────────────────
  const isOffsidesMarket = m.includes("offside") || k.includes("offside") || (k.startsWith("m1") && Number(k.replace("m", "")) >= 160 && Number(k.replace("m", "")) <= 170);
  if (isOffsidesMarket) {
    const offsides = extractFixtureOffsides(fixtureData, fid, h, a);
    let won = false;
    const numMatch = sName.match(/(\d+(?:\.\d+)?)/) || sVal.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
    const line = numMatch ? parseFloat(numMatch[1]) : 1.5;
    const isOver = s.includes("over") || s.startsWith("o");

    if (m.includes("home") || m.includes("team 1")) {
      won = isOver ? offsides.home > line : offsides.home < line;
    } else if (m.includes("away") || m.includes("team 2")) {
      won = isOver ? offsides.away > line : offsides.away < line;
    } else {
      won = isOver ? offsides.total > line : offsides.total < line;
    }

    return {
      finished: true,
      won,
      score: `Offsides: ${offsides.home}-${offsides.away}`,
      htScore: `${Math.floor(offsides.home / 2)}:${Math.floor(offsides.away / 2)}`,
      ftScore: `${offsides.home}:${offsides.away}`,
      status,
      offsides,
    };
  }

  // 0a. Double Chance Combination & Both To Score & 12 & Total Goals (m5105 / m5106 / m5125)
  if (
    k === "m5105" ||
    k === "m5106" ||
    k === "m5125" ||
    m.includes("12 & total goals") ||
    m.includes("12 and total goals") ||
    m.includes("double chance combination") ||
    m.includes("double chance &") ||
    m.includes("double chance and") ||
    (m.includes("double chance") && (m.includes("combination") || m.includes("combo") || s.includes(" and ") || s.includes(" & ")))
  ) {
    const parts = s.split(/\s+(?:and|&)\s+/i).map((x) => x.trim());
    const dcPart = parts[0] || "";
    const secondPart = parts.slice(1).join(" ") || "";

    let dcOk = false;
    if (dcPart.includes("1x") || dcPart.includes("home/draw") || dcPart.includes("home or draw") || dcPart.includes("1 or x")) {
      dcOk = (outcome1x2 === "home" || outcome1x2 === "draw");
    } else if (dcPart.includes("x2") || dcPart.includes("draw/away") || dcPart.includes("draw or away") || dcPart.includes("x or 2")) {
      dcOk = (outcome1x2 === "draw" || outcome1x2 === "away");
    } else if (dcPart.includes("12") || dcPart.includes("home/away") || dcPart.includes("home or away") || dcPart.includes("1 or 2")) {
      dcOk = (outcome1x2 === "home" || outcome1x2 === "away");
    }

    let secondOk = false;
    const btts = homeGoals > 0 && awayGoals > 0;

    if (secondPart.includes("both") || secondPart.includes("btts") || secondPart === "yes" || secondPart === "no") {
      secondOk = secondPart.includes("no") ? !btts : btts;
    } else if (/(\d+)\s*[-–]\s*(\d+)/.test(secondPart)) {
      const rangeMatch = secondPart.match(/(\d+)\s*[-–]\s*(\d+)/);
      if (rangeMatch) {
        const minG = parseInt(rangeMatch[1], 10);
        const maxG = parseInt(rangeMatch[2], 10);
        secondOk = (totalGoals >= minG && totalGoals <= maxG);
      }
    } else if (secondPart.includes("over") || secondPart.includes("under") || secondPart.includes("ov") || secondPart.includes("un")) {
      const lineMatch = secondPart.match(/(?:over|under|ov|un)?\s*\(?\s*(\d+(?:\.\d+)?)\s*\)?/i);
      const numMatch = secondPart.match(/(\d+(?:\.\d+)?)/);
      const line = lineMatch && lineMatch[1] ? parseFloat(lineMatch[1]) : (numMatch ? parseFloat(numMatch[1]) : 2.5);
      const isOver = secondPart.includes("over") || secondPart.includes("ov");
      secondOk = isOver ? totalGoals > line : totalGoals < line;
    }

    won = dcOk && secondOk;
  }
  // 0b. Double Chance - First Half (m3002)
  else if (k === "m3002" || (m.includes("double chance") && (m.includes("first half") || m.includes("1st half")))) {
    const is1X = s.includes("1x") || s.includes("home/draw") || s.includes("home or draw") || s.includes("1 or x");
    const is12 = s.includes("12") || s.includes("home/away") || s.includes("home or away") || s.includes("1 or 2");
    const isX2 = s.includes("x2") || s.includes("draw/away") || s.includes("draw or away") || s.includes("x or 2");
    if (is1X && (htOutcome === "home" || htOutcome === "draw")) won = true;
    if (is12 && (htOutcome === "home" || htOutcome === "away")) won = true;
    if (isX2 && (htOutcome === "draw" || htOutcome === "away")) won = true;
  }
  // 1. Double Chance (DC) - Pure DC only, excluding combination bets
  else if (
    (k === "dc" || k === "m12" || k === "m3001" || m.includes("double chance") || m.includes("dc") || sVal === "1x" || sVal === "12" || sVal === "x2" || sName === "1x" || sName === "12" || sName === "x2" || s.includes("home/draw") || s.includes("draw/away") || s.includes("home/away")) &&
    !m.includes("combination") && !m.includes("combo") && !m.includes("and") && !s.includes(" and ") && !s.includes(" & ")
  ) {
    const is1X = sVal === "1x" || sName === "1x" || s.includes("1x") || s.includes("1/x") || s.includes("home/draw") || s.includes("draw/home") || s.includes("home or draw") || s.includes("1 or x") || (h && s.includes(h) && (s.includes("draw") || s.includes("x")));
    const is12 = sVal === "12" || sName === "12" || s.includes("12") || s.includes("1/2") || s.includes("home/away") || s.includes("away/home") || s.includes("home or away") || s.includes("1 or 2") || (h && a && s.includes(h) && s.includes(a));
    const isX2 = sVal === "x2" || sName === "x2" || s.includes("x2") || s.includes("x/2") || s.includes("draw/away") || s.includes("away/draw") || s.includes("draw or away") || s.includes("x or 2") || (a && s.includes(a) && (s.includes("draw") || s.includes("x")));

    if (is1X && (outcome1x2 === "home" || outcome1x2 === "draw")) won = true;
    if (is12 && (outcome1x2 === "home" || outcome1x2 === "away")) won = true;
    if (isX2 && (outcome1x2 === "draw" || outcome1x2 === "away")) won = true;
  }
  // 1b. Outcome and Total Goals (m5101 / combo)
  else if (k === "m5101" || m.includes("outcome and total goals") || m.includes("match result and total goals") || m.includes("result & total goals") || m.includes("result & goals")) {
    const parts = s.split(/&|\/|and/i).map((x) => x.trim());
    const outPick = parts[0] || "";
    const goalPick = parts.slice(1).join(" ") || "";
    let outOk = false;
    if (outPick.includes("1x") || outPick.includes("home/draw") || outPick.includes("home or draw") || outPick.includes("1 or x")) {
      outOk = (outcome1x2 === "home" || outcome1x2 === "draw");
    } else if (outPick.includes("x2") || outPick.includes("draw/away") || outPick.includes("draw or away") || outPick.includes("x or 2")) {
      outOk = (outcome1x2 === "draw" || outcome1x2 === "away");
    } else if (outPick.includes("12") || outPick.includes("home/away") || outPick.includes("home or away") || outPick.includes("1 or 2")) {
      outOk = (outcome1x2 === "home" || outcome1x2 === "away");
    } else if (outPick.startsWith("1") || outPick.includes("home")) {
      outOk = (outcome1x2 === "home");
    } else if (outPick.startsWith("2") || outPick.includes("away")) {
      outOk = (outcome1x2 === "away");
    } else if (outPick.startsWith("x") || outPick.includes("draw")) {
      outOk = (outcome1x2 === "draw");
    }

    let goalOk = false;
    const numMatch = goalPick.match(/(\d+(?:\.\d+)?)/) || s.match(/(?:over|under|ov|un)\s*(?:\()?\s*(\d+(?:\.\d+)?)/i);
    const line = numMatch ? parseFloat(numMatch[1]) : 1.5;
    if (goalPick.includes("ov") || goalPick.includes("over")) goalOk = totalGoals > line;
    else if (goalPick.includes("un") || goalPick.includes("under")) goalOk = totalGoals < line;
    else goalOk = totalGoals > line;
    won = outOk && goalOk;
  }
  // 1d. Outcome and Both Teams to Score (m5103)
  else if (k === "m5103" || m.includes("outcome and both") || m.includes("result & both teams to score")) {
    let outOk = false;
    if (s.includes("home") || s.startsWith("1") || s.includes("1/")) outOk = (outcome1x2 === "home");
    else if (s.includes("away") || s.startsWith("2") || s.includes("2/")) outOk = (outcome1x2 === "away");
    else if (s.includes("draw") || s.startsWith("x") || s.includes("x/")) outOk = (outcome1x2 === "draw");
    const btts = homeGoals > 0 && awayGoals > 0;
    const bttsOk = s.includes("no") ? !btts : btts;
    won = outOk && bttsOk;
  }
  // 1e. Both Teams To Score and Total Goals (m5108)
  else if (k === "m5108" || (m.includes("both teams to score") && m.includes("total goals"))) {
    const btts = homeGoals > 0 && awayGoals > 0;
    const bttsOk = s.includes("no") ? !btts : btts;
    const numMatch = s.match(/(?:over|under|ov|un)\s*(?:\()?\s*(\d+(?:\.\d+)?)/i) || s.match(/\(\s*(\d+(?:\.\d+)?)\s*\)/) || s.match(/(\d+\.\d+)/);
    const line = numMatch ? parseFloat(numMatch[1]) : 2.5;
    const goalOk = s.includes("under") || s.includes("un") ? totalGoals < line : totalGoals > line;
    won = bttsOk && goalOk;
  }
  // 1f. Half Time / Full Time and Total Goals (m5112)
  else if (k === "m5112" || (m.includes("half time/full time") && m.includes("total goals"))) {
    const htCode = htHome > htAway ? "1" : (htHome < htAway ? "2" : "x");
    const ftCode = homeGoals > awayGoals ? "1" : (homeGoals < awayGoals ? "2" : "x");
    const actualCombo = `${htCode}/${ftCode}`;
    const cleanActual = `${htCode}${ftCode}`;
    const cleanPick = (sVal || sName).replace(/[^12x]/gi, "").toLowerCase().slice(0, 2);
    const htftOk = cleanPick === cleanActual || s.includes(actualCombo);
    const numMatch = s.match(/(?:over|under|ov|un)\s*(?:\()?\s*(\d+(?:\.\d+)?)/i) || s.match(/\(\s*(\d+(?:\.\d+)?)\s*\)/) || s.match(/(\d+\.\d+)/);
    const line = numMatch ? parseFloat(numMatch[1]) : 1.5;
    const goalOk = s.includes("under") || s.includes("un") ? totalGoals < line : totalGoals > line;
    won = htftOk && goalOk;
  }
  // 1g. 1st Half Or Match Result (m5002)
  else if (k === "m5002" || m.includes("1st half or match result")) {
    const pickHome = s.includes("home") || s === "1" || isHomePick;
    const pickDraw = s.includes("draw") || s === "x" || isDrawPick;
    const pickAway = s.includes("away") || s === "2" || isAwayPick;
    if (pickHome && (htOutcome === "home" || outcome1x2 === "home")) won = true;
    if (pickDraw && (htOutcome === "draw" || outcome1x2 === "draw")) won = true;
    if (pickAway && (htOutcome === "away" || outcome1x2 === "away")) won = true;
  }
  // 1ga. Chance Mix (m5001) & Outcome or Total Goals (m5003, m5004, m5005)
  else if (k === "m5001" || k === "m5003" || k === "m5004" || k === "m5005" || m.includes("chance mix") || m.includes("outcome or total goals")) {
    const isHome = outcome1x2 === "home";
    const isDraw = outcome1x2 === "draw";
    const isAway = outcome1x2 === "away";
    const btts = homeGoals > 0 && awayGoals > 0;

    // Check BTTS combinations
    if (s.includes("both teams to score") || s.includes("btts")) {
      const isYes = s.includes("yes");
      const bttsHit = isYes ? btts : !btts;
      if (s.includes("team 1") || s.includes("home")) {
        won = isHome || bttsHit;
      } else if (s.includes("team 2") || s.includes("away")) {
        won = isAway || bttsHit;
      } else if (s.includes("draw")) {
        won = isDraw || bttsHit;
      }
    }
    // Check Over / Under combinations
    else if (s.includes("over") || s.includes("under") || s.includes("ov") || s.includes("un")) {
      const numMatch = s.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
      const line = numMatch ? parseFloat(numMatch[1]) : 2.5;
      const isOver = s.includes("over") || s.includes("ov");
      const goalHit = isOver ? totalGoals > line : totalGoals < line;

      if (s.includes("team 1") || s.includes("home")) {
        won = isHome || goalHit;
      } else if (s.includes("team 2") || s.includes("away")) {
        won = isAway || goalHit;
      } else if (s.includes("draw")) {
        won = isDraw || goalHit;
      }
    }
    // Correct score combinations in Chance Mix
    else if (s.includes("0-0, 1-0, 0-1")) {
      const ft = `${homeGoals}-${awayGoals}`;
      won = (ft === "0-0" || ft === "1-0" || ft === "0-1");
    } else if (s.includes("correct score 0-0, 0-1")) {
      const ft = `${homeGoals}-${awayGoals}`;
      won = isHome || ft === "0-0" || ft === "0-1";
    } else if (s.includes("correct score 0-0, 1-0")) {
      const ft = `${homeGoals}-${awayGoals}`;
      won = isAway || ft === "0-0" || ft === "1-0";
    } else if (s.includes("correct score 0-0")) {
      const ft = `${homeGoals}-${awayGoals}`;
      if (s.includes("team 1")) won = isHome || ft === "0-0";
      else if (s.includes("team 2")) won = isAway || ft === "0-0";
    }
  }
  // 1gb. Highest Scoring Half (m11 / highest_scoring_half)
  else if (
    k === "m11" ||
    k === "highest_scoring_half" ||
    m.includes("highest scoring") ||
    m.includes("half with most goals")
  ) {
    const is1st = s.includes("1st") || s.includes("first") || s === "1";
    const is2nd = s.includes("2nd") || s.includes("second") || s === "2";
    const isDraw = s.includes("draw") || s.includes("tie") || s.includes("equal") || s.includes("same") || s === "x";

    if (m.includes("home") || m.includes("team 1")) {
      if (is1st && htHome > shHome) won = true;
      else if (is2nd && shHome > htHome) won = true;
      else if (isDraw && htHome === shHome) won = true;
    } else if (m.includes("away") || m.includes("team 2")) {
      if (is1st && htAway > shAway) won = true;
      else if (is2nd && shAway > htAway) won = true;
      else if (isDraw && htAway === shAway) won = true;
    } else {
      if (is1st && htTotal > shTotal) won = true;
      else if (is2nd && shTotal > htTotal) won = true;
      else if (isDraw && htTotal === shTotal) won = true;
    }
  }
  // 1h. Team Total Goals (m2001 Home / m2101 Away)
  else if (k === "m2001" || m.includes("home total goals") || m.includes("home total")) {
    const numMatch = s.match(/(\d+(?:\.\d+)?)/);
    const line = numMatch ? parseFloat(numMatch[1]) : 1.5;
    won = (s.includes("over") || s.startsWith("o")) ? homeGoals > line : homeGoals < line;
  }
  else if (k === "m2101" || m.includes("away total goals") || m.includes("away total")) {
    const numMatch = s.match(/(\d+(?:\.\d+)?)/);
    const line = numMatch ? parseFloat(numMatch[1]) : 1.5;
    won = (s.includes("over") || s.startsWith("o")) ? awayGoals > line : awayGoals < line;
  }
  // 1i. Away / Home to Score in Both Halves (m2112)
  else if (k === "m2112" || m.includes("score in both halves")) {
    if (m.includes("away")) {
      const both = htAway > 0 && shAway > 0;
      won = s.includes("no") ? !both : both;
    } else {
      const both = htHome > 0 && shHome > 0;
      won = s.includes("no") ? !both : both;
    }
  }
  // 1j. Away / Home to Score in Second Half (m2111)
  else if (k === "m2111" || m.includes("score in second half")) {
    if (m.includes("away")) {
      won = s.includes("no") ? shAway === 0 : shAway > 0;
    } else {
      won = s.includes("no") ? shHome === 0 : shHome > 0;
    }
  }
  // 1k. Away to Score (m2109) / Home to Score
  else if (k === "m2109" || m.includes("away to score") || k === "away_score") {
    won = s.includes("no") ? awayGoals === 0 : awayGoals > 0;
  }
  else if (k === "home_score" || m.includes("home to score")) {
    won = s.includes("no") ? homeGoals === 0 : homeGoals > 0;
  }
  // 1L. 1-15 Min Winner (m501)
  else if (k === "m501" || m.includes("1-15 min. winner") || (m.includes("1-15") && (m.includes("winner") || m.includes("result") || m.includes("1x2")))) {
    let g15H = 0, g15A = 0, hasEvents = false;
    if (Array.isArray(fixtureData.events) && fixtureData.events.length > 0) {
      for (const ev of fixtureData.events) {
        if (ev.type === "Goal") {
          hasEvents = true;
          const elapsed = Number(ev.time?.elapsed || 0);
          if (elapsed >= 1 && elapsed <= 15) {
            const teamName = String(ev.team?.name || "").toLowerCase();
            if (teamName && h && teamName.includes(h.toLowerCase())) g15H++;
            else g15A++;
          }
        }
      }
    }
    const outcome15 = g15H > g15A ? "home" : (g15A > g15H ? "away" : "draw");
    if (outcome15 === "home" && isHomePick) won = true;
    else if (outcome15 === "away" && isAwayPick) won = true;
    else if (outcome15 === "draw" && (s.includes("draw") || s === "x")) won = true;
  }
  // 1Lb. 1-30 Min Winner (m502)
  else if (k === "m502" || m.includes("1-30 min. winner") || (m.includes("1-30") && (m.includes("winner") || m.includes("result") || m.includes("1x2")))) {
    let g30H = 0, g30A = 0, hasEvents = false;
    if (Array.isArray(fixtureData.events) && fixtureData.events.length > 0) {
      for (const ev of fixtureData.events) {
        if (ev.type === "Goal") {
          hasEvents = true;
          const elapsed = Number(ev.time?.elapsed || 0);
          if (elapsed >= 1 && elapsed <= 30) {
            const teamName = String(ev.team?.name || "").toLowerCase();
            if (teamName && h && teamName.includes(h.toLowerCase())) g30H++;
            else g30A++;
          }
        }
      }
    }
    const outcome30 = g30H > g30A ? "home" : (g30A > g30H ? "away" : "draw");
    if (outcome30 === "home" && isHomePick) won = true;
    else if (outcome30 === "away" && isAwayPick) won = true;
    else if (outcome30 === "draw" && (s.includes("draw") || s === "x")) won = true;
  }
  // 1Lc. 1-60 Min Winner (m503)
  else if (k === "m503" || m.includes("1-60 min. winner") || (m.includes("1-60") && (m.includes("winner") || m.includes("result") || m.includes("1x2")))) {
    let g60H = 0, g60A = 0, hasEvents = false;
    if (Array.isArray(fixtureData.events) && fixtureData.events.length > 0) {
      for (const ev of fixtureData.events) {
        if (ev.type === "Goal") {
          hasEvents = true;
          const elapsed = Number(ev.time?.elapsed || 0);
          if (elapsed >= 1 && elapsed <= 60) {
            const teamName = String(ev.team?.name || "").toLowerCase();
            if (teamName && h && teamName.includes(h.toLowerCase())) g60H++;
            else g60A++;
          }
        }
      }
    }
    const outcome60 = g60H > g60A ? "home" : (g60A > g60H ? "away" : "draw");
    if (outcome60 === "home" && isHomePick) won = true;
    else if (outcome60 === "away" && isAwayPick) won = true;
    else if (outcome60 === "draw" && (s.includes("draw") || s === "x")) won = true;
  }
  // 1Ld. 1-75 Min Winner (m504)
  else if (k === "m504" || m.includes("1-75 min. winner") || (m.includes("1-75") && (m.includes("winner") || m.includes("result") || m.includes("1x2")))) {
    let g75H = 0, g75A = 0, hasEvents = false;
    if (Array.isArray(fixtureData.events) && fixtureData.events.length > 0) {
      for (const ev of fixtureData.events) {
        if (ev.type === "Goal") {
          hasEvents = true;
          const elapsed = Number(ev.time?.elapsed || 0);
          if (elapsed >= 1 && elapsed <= 75) {
            const teamName = String(ev.team?.name || "").toLowerCase();
            if (teamName && h && teamName.includes(h.toLowerCase())) g75H++;
            else g75A++;
          }
        }
      }
    }
    const outcome75 = g75H > g75A ? "home" : (g75A > g75H ? "away" : "draw");
    if (outcome75 === "home" && isHomePick) won = true;
    else if (outcome75 === "away" && isAwayPick) won = true;
    else if (outcome75 === "draw" && (s.includes("draw") || s === "x")) won = true;
  }
  // 1La. 1-15 Min Total Goals (m505)
  else if (k === "m505" || (m.includes("1-15") && (m.includes("total") || m.includes("over") || m.includes("under")))) {
    let g15Total = 0, hasEvents = false;
    if (Array.isArray(fixtureData.events) && fixtureData.events.length > 0) {
      for (const ev of fixtureData.events) {
        if (ev.type === "Goal") {
          hasEvents = true;
          const elapsed = Number(ev.time?.elapsed || 0);
          if (elapsed >= 1 && elapsed <= 15) g15Total++;
        }
      }
    }
    if (!hasEvents && htTotal === 0) g15Total = 0;
    const numMatch = s.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
    const line = numMatch ? parseFloat(numMatch[1]) : 0.5;
    won = (s.includes("over") || s.startsWith("o")) ? g15Total > line : g15Total < line;
  }
  // 1m. 1-30 Min Total Goals (m506)
  else if (k === "m506" || m.includes("1-30 min")) {
    const numMatch = s.match(/(\d+(?:\.\d+)?)/);
    const line = numMatch ? parseFloat(numMatch[1]) : 0.5;
    // Approximated by first half goals
    won = s.includes("over") ? htTotal > line : htTotal < line;
  }
  // 1n. 1-75 Min Away Total Goals (m2106)
  else if (k === "m2106" || m.includes("1-75 min")) {
    const numMatch = s.match(/(\d+(?:\.\d+)?)/);
    const line = numMatch ? parseFloat(numMatch[1]) : 1.5;
    won = s.includes("over") ? awayGoals > line : awayGoals < line;
  }
  // 2. 1st Half Match Result (1X2)
  else if (k === "half1_1x2" || k === "m13" || m.includes("first half winner") || ((m.includes("1st half") || m.includes("first half")) && (m.includes("result") || m.includes("1x2") || m.includes("winner")))) {
    if (htOutcome === "home" && isHomePick) won = true;
    if (htOutcome === "draw" && isDrawPick) won = true;
    if (htOutcome === "away" && isAwayPick) won = true;
  }
  // 3. 2nd Half Match Result (1X2 / m3)
  else if (k === "half2_1x2" || k === "m3" || m.includes("second half winner") || ((m.includes("2nd half") || m.includes("second half")) && (m.includes("result") || m.includes("1x2") || m.includes("winner")))) {
    if (shOutcome === "home" && isHomePick) won = true;
    if (shOutcome === "draw" && isDrawPick) won = true;
    if (shOutcome === "away" && isAwayPick) won = true;
  }
  // 4. 1st Half Over/Under
  else if (k === "half1_ou15" || k === "m6" || ((m.includes("1st half") || m.includes("first half")) && (m.includes("over") || m.includes("under") || m.includes("goals")))) {
    const numMatch = s.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
    const line = numMatch ? parseFloat(numMatch[1]) : 1.5;
    const isOver = sVal === "over" || sVal.startsWith("o") || sName.includes("over");
    const isUnder = sVal === "under" || sVal.startsWith("u") || sName.includes("under");
    if (isOver && htTotal > line) won = true;
    if (isUnder && htTotal < line) won = true;
  }
  // 5. 2nd Half Over/Under
  else if (k === "half2_ou15" || k === "m26" || ((m.includes("2nd half") || m.includes("second half")) && (m.includes("over") || m.includes("under") || m.includes("goals")))) {
    const numMatch = s.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/);
    const line = numMatch ? parseFloat(numMatch[1]) : 1.5;
    const isOver = sVal === "over" || sVal.startsWith("o") || sName.includes("over");
    const isUnder = sVal === "under" || sVal.startsWith("u") || sName.includes("under");
    if (isOver && shTotal > line) won = true;
    if (isUnder && shTotal < line) won = true;
  }
  // 6. 1st Half Both Teams to Score (half1_btts / m34)
  else if (k === "half1_btts" || k === "m34" || ((m.includes("1st half") || m.includes("first half")) && (m.includes("both") || m.includes("btts")))) {
    const btts1 = htHome > 0 && htAway > 0;
    const isYes = sVal === "yes" || sVal === "gg" || sName.includes("yes") || sName.includes("gg");
    const isNo = sVal === "no" || sVal === "ng" || sName.includes("no") || sName.includes("ng");
    if (isYes && btts1) won = true;
    if (isNo && !btts1) won = true;
  }
  // 7. 2nd Half Both Teams to Score (half2_btts / m35)
  else if (k === "half2_btts" || k === "m35" || ((m.includes("2nd half") || m.includes("second half")) && (m.includes("both") || m.includes("btts")))) {
    const btts2 = shHome > 0 && shAway > 0;
    const isYes = sVal === "yes" || sVal === "gg" || sName.includes("yes") || sName.includes("gg");
    const isNo = sVal === "no" || sVal === "ng" || sName.includes("no") || sName.includes("ng");
    if (isYes && btts2) won = true;
    if (isNo && !btts2) won = true;
  }
  // 8. Both Teams to Score (BTTS / GG / NG / m8) Full-Time
  else if (k === "btts" || k === "m8" || m.includes("both teams to score") || m.includes("both teams score") || m.includes("btts") || sVal === "gg" || sVal === "ng" || sName.startsWith("gg") || sName.startsWith("ng")) {
    const btts = homeGoals > 0 && awayGoals > 0;
    const isYes = sVal === "yes" || sVal === "gg" || sName.includes("yes") || sName.includes("gg");
    const isNo = sVal === "no" || sVal === "ng" || sName.includes("no") || sName.includes("ng");
    if (isYes && btts) won = true;
    if (isNo && !btts) won = true;
  }
  // 9. Draw No Bet (DNB)
  else if (k === "dnb" || m.includes("draw no bet") || m.includes("dnb")) {
    if (homeGoals === awayGoals) {
      won = true;
      voided = true; // push
    } else if (homeGoals > awayGoals && isHomePick) {
      won = true;
    } else if (awayGoals > homeGoals && isAwayPick) {
      won = true;
    }
  }
  // 10. Handicap (-1 / +1)
  else if (k === "handicap" || m.includes("handicap")) {
    if (isHomePick && (homeGoals - 1) > awayGoals) won = true;
    else if (isDrawPick && (homeGoals - 1) === awayGoals) won = true;
    else if (isAwayPick && (homeGoals - 1) < awayGoals) won = true;
  }
  // 11. Half Time / Full Time (HT/FT)
  else if (k === "htft" || m.includes("half time / full time") || m.includes("ht/ft") || m.includes("htft")) {
    const htCode = htHome > htAway ? "1" : (htHome < htAway ? "2" : "x");
    const ftCode = homeGoals > awayGoals ? "1" : (homeGoals < awayGoals ? "2" : "x");
    const actualCombo = `${htCode}/${ftCode}`;
    const cleanPick = (sVal || sName).replace(/[^12x]/gi, "").toLowerCase();
    const cleanActual = `${htCode}${ftCode}`;
    if (cleanPick === cleanActual || s.includes(actualCombo)) won = true;
  }
  // 12. Correct Score
  else if (k === "score" || m.includes("correct score") || m.includes("score")) {
    const actualScore = `${homeGoals}-${awayGoals}`;
    const cleanPick = (sVal || sName).replace(/\s+/g, "").replace(":", "-").replace(/score:?/gi, "").trim();
    if (cleanPick === actualScore) won = true;
  }
  // 13. Clean Sheet (Home Clean Sheet / Away Clean Sheet)
  else if (k === "home_cs" || m.includes("home clean sheet")) {
    const isYes = sVal === "yes" || sName.includes("yes");
    const isNo = sVal === "no" || sName.includes("no");
    if (isYes && awayGoals === 0) won = true;
    if (isNo && awayGoals > 0) won = true;
  }
  else if (k === "away_cs" || m.includes("away clean sheet")) {
    const isYes = sVal === "yes" || sName.includes("yes");
    const isNo = sVal === "no" || sName.includes("no");
    if (isYes && homeGoals === 0) won = true;
    if (isNo && homeGoals > 0) won = true;
  }
  // 14. To Score (Home To Score / Away To Score)
  else if (k === "home_score" || m.includes("home to score")) {
    if (homeGoals > 0) won = true;
  }
  else if (k === "away_score" || m.includes("away to score")) {
    if (awayGoals > 0) won = true;
  }
  // 15. Team Over/Under 1.5 (home_ou15 / away_ou15)
  else if (k === "home_ou15" || m.includes("home over/under 1.5")) {
    const isOver = sVal === "over" || sVal.startsWith("o") || sName.includes("over");
    const isUnder = sVal === "under" || sVal.startsWith("u") || sName.includes("under");
    if (isOver && homeGoals > 1.5) won = true;
    if (isUnder && homeGoals < 1.5) won = true;
  }
  else if (k === "away_ou15" || m.includes("away over/under 1.5")) {
    const isOver = sVal === "over" || sVal.startsWith("o") || sName.includes("over");
    const isUnder = sVal === "under" || sVal.startsWith("u") || sName.includes("under");
    if (isOver && awayGoals > 1.5) won = true;
    if (isUnder && awayGoals < 1.5) won = true;
  }
  // 16. Combo (Result & Goals 2.5: 1_ov, x_ov, 2_ov, 1_un, 2_un)
  else if (k === "combo" || m.includes("result & goals")) {
    const isOver = totalGoals > 2.5;
    const isUnder = totalGoals < 2.5;
    if ((sVal === "1_ov" || sName.includes("1 & over")) && outcome1x2 === "home" && isOver) won = true;
    if ((sVal === "x_ov" || sName.includes("draw & over")) && outcome1x2 === "draw" && isOver) won = true;
    if ((sVal === "2_ov" || sName.includes("2 & over")) && outcome1x2 === "away" && isOver) won = true;
    if ((sVal === "1_un" || sName.includes("1 & under")) && outcome1x2 === "home" && isUnder) won = true;
    if ((sVal === "2_un" || sName.includes("2 & under")) && outcome1x2 === "away" && isUnder) won = true;
  }
  // 17. Total Goals Over / Under (Full-Time)
  else if (k === "ou" || k === "ou15" || k === "ou35" || k === "m5" || m.includes("over/under") || m.includes("total") || m.includes("over") || m.includes("under") || m.includes("goals") || sVal === "over" || sVal === "under" || sName.includes("over") || sName.includes("under")) {
    let line = 2.5;
    if (k === "ou15") line = 1.5;
    else if (k === "ou35") line = 3.5;
    else {
      const numMatch = sName.match(/(\d+(?:\.\d+)?)/) || m.match(/(\d+(?:\.\d+)?)/) || sVal.match(/(\d+(?:\.\d+)?)/);
      if (numMatch) line = parseFloat(numMatch[1]);
    }
    const isOver = sVal === "over" || sVal.startsWith("o") || sName.includes("over");
    const isUnder = sVal === "under" || sVal.startsWith("u") || sName.includes("under");
    if (isOver && totalGoals > line) won = true;
    if (isUnder && totalGoals < line) won = true;
  }
  // 18. Match Result / 1X2 / Winner / Match Winner (Default fallback)
  else {
    if (outcome1x2 === "home" && (isHomePick || s === "home" || s === "1" || s.includes("home"))) won = true;
    if (outcome1x2 === "draw" && (isDrawPick || s === "draw" || s === "x" || s.includes("draw"))) won = true;
    if (outcome1x2 === "away" && (isAwayPick || s === "away" || s === "2" || s.includes("away"))) won = true;
  }

  return {
    finished: true,
    won,
    voided,
    score: `${homeGoals}-${awayGoals}`,
    htScore: `${htHome}:${htAway}`,
    ftScore: `${homeGoals}:${awayGoals}`,
    status,
  };
}

function getRuleOddsRange(r) {
  let min = (r.minOdds != null && r.minOdds !== "") ? Number(r.minOdds) : null;
  let max = (r.maxOdds != null && r.maxOdds !== "") ? Number(r.maxOdds) : null;

  if (min == null && max == null) {
    const text = `${r.name || ""} ${r.id || ""}`;
    const rangeMatch = text.match(/(\d[\d,]*)\s*[-_–]\s*(\d[\d,]*)/);
    if (rangeMatch) {
      min = Number(rangeMatch[1].replace(/,/g, ""));
      max = Number(rangeMatch[2].replace(/,/g, ""));
    } else {
      const plusMatch = text.match(/(\d[\d,]*)\s*\+/);
      if (plusMatch) {
        min = Number(plusMatch[1].replace(/,/g, ""));
        max = null;
      }
    }
  }
  return { minOdds: min, maxOdds: max };
}

function calculateNearMissBonus(stake, selections) {
  try {
    const { loadStore, defaultBonusRules } = require("../db");
    const store = loadStore();
    const settings = store.settings || {};
    let rules = settings.bonus_rules;
    if (!Array.isArray(rules) || !rules.length) {
      if (typeof defaultBonusRules === "function") rules = defaultBonusRules();
    }
    if (!Array.isArray(rules) || !rules.length) return null;

    if (settings.bonus_enabled === false && !rules.some((r) => r.enabled !== false)) return null;

    const totalTeams = selections.length;
    const lostCount = selections.filter((s) => s.status === "lost").length;
    if (lostCount < 1 || lostCount > 4) return null;

    // Calculate effective odds:
    // Total odds divided by the odds of the lost game(s) = product of the odds of all winning/remaining legs
    let effectiveOdds = 1.0;
    for (const s of selections) {
      if (s.status !== "lost") {
        const o = Number(s.odd || s.odds || 1);
        if (o > 0) effectiveOdds *= o;
      }
    }
    effectiveOdds = Math.round(effectiveOdds * 100) / 100;

    const eligibleRules = rules.filter((r) => {
      if (r.enabled === false) return false;
      if (Number(r.failedCount) !== lostCount) return false;

      // Minimum teams condition: ticket must have at least minTeams (default 7 teams)
      const minTeams = Number(r.minTeams) || 7;
      if (totalTeams < minTeams) return false;
      if (r.maxTeams != null && r.maxTeams !== "" && totalTeams > Number(r.maxTeams)) return false;

      // Odds tier condition based on effective remaining odds:
      const range = getRuleOddsRange(r);
      if (range.minOdds != null && effectiveOdds < range.minOdds) return false;
      if (range.maxOdds != null && effectiveOdds > range.maxOdds) return false;

      // Realistic odds verification per leg removed per user requirement
      return true;
    });

    if (!eligibleRules.length) return null;
    eligibleRules.sort((a, b) => {
      const multA = Number(a.multiplier) || (Number(a.percent) / 100) || 0;
      const multB = Number(b.multiplier) || (Number(b.percent) / 100) || 0;
      return multB - multA;
    });
    const matchedRule = eligibleRules[0];
    const multiplier = Number(matchedRule.multiplier) || (Number(matchedRule.percent) / 100) || 1;
    const amount = Number((stake * multiplier).toFixed(2));

    return {
      rule: matchedRule,
      multiplier,
      amount,
      effectiveOdds,
      failedCount: lostCount,
      totalTeams,
    };
  } catch (_) {
    return null;
  }
}

async function autoSettleOpenTickets(userId) {
  try {
    const store = getStore();
    const openRows = (store.bets || []).filter((b) => {
      if (b.status !== "open") return false;
      if (!userId) return true;
      return String(b.user_id) === String(userId) || String(b.cashier_id) === String(userId);
    });

    if (!openRows.length) return;

    const fixtureIdSet = new Set();
    const parsedMap = new Map();

    for (const row of openRows) {
      try {
        const selections = JSON.parse(row.selections);
        parsedMap.set(row.ticket_id, selections);
        for (const sel of selections) {
          if (!sel.fixtureId) continue;
          if (sel.status === "won" || sel.status === "lost") continue;
          const kickTime = sel.kickoff ? new Date(sel.kickoff).getTime() : 0;
          if (kickTime && kickTime > Date.now() + 60000) continue; // Match has not kicked off yet
          fixtureIdSet.add(Number(sel.fixtureId));
        }
      } catch (_) {}
    }

    const fixMap = new Map();
    if (fixtureIdSet.size) {
      try {
        const idList = Array.from(fixtureIdSet);
        for (let i = 0; i < idList.length; i += 20) {
          const chunk = idList.slice(i, i + 20);
          const fixturesFromApi = await fetchFixtureResults(chunk);
          for (const f of fixturesFromApi) {
            const fid = f.fixture?.id || f.id || f.fixtureId;
            if (fid) fixMap.set(Number(fid), f);
          }
        }
      } catch (_) {}
    }

    for (const row of openRows) {
      const selections = parsedMap.get(row.ticket_id);
      if (!selections || !selections.length) continue;

      let allFinished = true;
      let anyLost = false;
      let selectionsChanged = false;

      for (const sel of selections) {
        if (sel.status === "won" || sel.status === "lost") {
          if (sel.status === "lost") anyLost = true;
          continue;
        }

        // Future kickoff: match has not started yet, cannot be finished!
        const kickTime = sel.kickoff ? new Date(sel.kickoff).getTime() : 0;
        if (kickTime && kickTime > Date.now() + 60000) {
          allFinished = false;
          continue;
        }

        const fid = Number(sel.fixtureId);
        let matchData = fixMap.get(fid);

        const matchStatus = String(matchData?.fixture?.status?.short || "").toUpperCase();
        if (!matchData || !["FT", "AET", "PEN", "FINISHED", "ENDED", "PST", "CANC", "ABD", "POSTPONED", "CANCELLED", "ABANDONED"].includes(matchStatus)) {
          const fallbackRes = findMatchResultForFixture(fid, sel.homeName, sel.awayName, sel.kickoff);
          if (fallbackRes) matchData = fallbackRes;
        }

        if (matchData) {
          const evalRes = evaluateSelection(sel, matchData);
          if (evalRes.finished) {
            sel.status = evalRes.won ? "won" : "lost";
            if (evalRes.voided) sel.voided = true;
            if (evalRes.score) sel.score = evalRes.score;
            if (evalRes.htScore) sel.htScore = evalRes.htScore;
            if (evalRes.ftScore) sel.ftScore = evalRes.ftScore;
            if (evalRes.cards) sel.cards = evalRes.cards;
            if (!evalRes.won) anyLost = true;
            selectionsChanged = true;
          } else {
            allFinished = false;
          }
        } else {
          allFinished = false;
        }
      }

      if (allFinished) {
        if (anyLost) {
          const bonusInfo = calculateNearMissBonus(row.stake, selections);
          const bonusPayout = bonusInfo ? bonusInfo.amount : 0;

          withStore((store) => {
            const bet = store.bets.find((b) => b.ticket_id === row.ticket_id);
            if (bet && bet.status === "open") {
              bet.status = "lost";
              bet.payout = bonusPayout;
              bet.settled_at = new Date().toISOString();
              bet.selections = JSON.stringify(selections);
              if (bonusInfo && bonusPayout > 0) {
                bet.bonus_awarded = true;
                bet.bonus_amount = bonusInfo.amount;
                bet.bonus_multiplier = bonusInfo.multiplier;
                bet.bonus_rule_name = bonusInfo.rule.name;
                bet.bonus_failed_count = bonusInfo.failedCount;
                bet.bonus_total_teams = bonusInfo.totalTeams;
                bet.bonus_effective_odds = bonusInfo.effectiveOdds;
              }
            }
          });

          if (bonusPayout > 0) {
            creditWallet(row.user_id, bonusPayout, "bonus_cut", row.ticket_id, {
              ticketId: row.ticket_id,
              multiplier: bonusInfo.multiplier,
              failedCount: bonusInfo.failedCount,
              totalTeams: bonusInfo.totalTeams,
              ruleName: bonusInfo.rule.name,
            });
          }
        } else {
          // All won!
          let effectiveOdds = 1.0;
          let hasVoided = false;
          for (const s of selections) {
            if (s.voided) {
              hasVoided = true;
              effectiveOdds *= 1.0;
            } else {
              effectiveOdds *= Number(s.odd || 1);
            }
          }
          const maxWinLimit = getMaxWinLimit();
          const rawPayout = hasVoided
            ? Number((row.stake * effectiveOdds).toFixed(2))
            : Number(row.potential_win || (row.stake * effectiveOdds).toFixed(2));
          const payout = Math.min(rawPayout, maxWinLimit);

          withStore((store) => {
            const bet = store.bets.find((b) => b.ticket_id === row.ticket_id);
            if (bet && bet.status === "open") {
              bet.status = "won";
              bet.payout = payout;
              bet.settled_at = new Date().toISOString();
              bet.selections = JSON.stringify(selections);
            }
          });
          if (payout > 0) {
            creditWallet(row.user_id, payout, "bet_win", row.ticket_id, { ticketId: row.ticket_id });
          }
        }
      } else {
        // Not all finished yet: save intermediate selection statuses only if they changed
        if (selectionsChanged) {
          withStore((store) => {
            const bet = store.bets.find((b) => b.ticket_id === row.ticket_id);
            if (bet && bet.status === "open") {
              bet.selections = JSON.stringify(selections);
            }
          });
        }
      }
    }
  } catch (err) {
    console.error("[autoSettleOpenTickets] Error:", err.message);
  }
}

async function retroactiveSettleAllTickets() {
  const settledResults = [];
  try {
    const rows = withStore((store) => store.bets.slice());
    if (!rows.length) return settledResults;

    const fixtureIdSet = new Set();
    const parsedMap = new Map();
    for (const row of rows) {
      try {
        const selections = JSON.parse(row.selections);
        parsedMap.set(row.ticket_id, selections);
        for (const sel of selections) {
          if (sel.fixtureId) fixtureIdSet.add(Number(sel.fixtureId));
        }
      } catch (_) {}
    }

    const fixMap = new Map();
    if (fixtureIdSet.size) {
      const idList = Array.from(fixtureIdSet);
      for (let i = 0; i < idList.length; i += 20) {
        const chunk = idList.slice(i, i + 20);
        try {
          const fixturesFromApi = await fetchFixtureResults(chunk);
          for (const f of fixturesFromApi) {
            const fid = f.fixture?.id || f.id || f.fixtureId;
            if (fid) fixMap.set(Number(fid), f);
          }
        } catch (_) {}
      }
    }

    for (const row of rows) {
      const selections = parsedMap.get(row.ticket_id);
      if (!selections || !selections.length) continue;

      let allFinished = true;
      let anyLost = false;
      let selectionsChanged = false;

      for (const sel of selections) {
        if (sel.status === "won" || sel.status === "lost") {
          if (sel.status === "lost") anyLost = true;
          continue;
        }

        const kickTime = sel.kickoff ? new Date(sel.kickoff).getTime() : 0;
        if (kickTime && kickTime > Date.now() + 60000) {
          allFinished = false;
          continue;
        }

        const fid = Number(sel.fixtureId);
        let matchData = fixMap.get(fid);
        const matchStatus = String(matchData?.fixture?.status?.short || "").toUpperCase();
        if (!matchData || !["FT", "AET", "PEN", "FINISHED", "ENDED", "PST", "CANC", "ABD", "POSTPONED", "CANCELLED", "ABANDONED"].includes(matchStatus)) {
          const fallbackRes = findMatchResultForFixture(fid, sel.homeName, sel.awayName, sel.kickoff);
          if (fallbackRes) matchData = fallbackRes;
        }

        if (matchData) {
          const evalRes = evaluateSelection(sel, matchData);
          if (evalRes.finished) {
            sel.status = evalRes.won ? "won" : "lost";
            if (evalRes.voided) sel.voided = true;
            if (evalRes.score) sel.score = evalRes.score;
            if (evalRes.htScore) sel.htScore = evalRes.htScore;
            if (evalRes.ftScore) sel.ftScore = evalRes.ftScore;
            if (evalRes.cards) sel.cards = evalRes.cards;
            if (!evalRes.won) anyLost = true;
            selectionsChanged = true;
          } else {
            allFinished = false;
          }
        } else {
          allFinished = false;
        }
      }

      if (allFinished) {
        if (anyLost) {
          const bonusInfo = calculateNearMissBonus(row.stake, selections);
          const bonusPayout = bonusInfo ? bonusInfo.amount : 0;
          const existingPayout = Number(row.payout || row.bonus_amount || 0);
          const deltaPayout = Number((bonusPayout - existingPayout).toFixed(2));

          if (bonusInfo && bonusPayout > 0 && deltaPayout > 0) {
            withStore((store) => {
              const bet = store.bets.find((b) => b.ticket_id === row.ticket_id);
              if (bet) {
                bet.status = "lost";
                bet.payout = bonusPayout;
                bet.bonus_awarded = true;
                bet.bonus_amount = bonusPayout;
                bet.bonus_multiplier = bonusInfo.multiplier;
                bet.bonus_rule_name = bonusInfo.rule.name;
                bet.bonus_failed_count = bonusInfo.failedCount;
                bet.bonus_total_teams = bonusInfo.totalTeams;
                bet.bonus_effective_odds = bonusInfo.effectiveOdds;
                bet.settled_at = bet.settled_at || new Date().toISOString();
                bet.selections = JSON.stringify(selections);
              }
            });

            creditWallet(row.user_id, deltaPayout, "bonus_cut", row.ticket_id, {
              ticketId: row.ticket_id,
              multiplier: bonusInfo.multiplier,
              failedCount: bonusInfo.failedCount,
              totalTeams: bonusInfo.totalTeams,
              ruleName: bonusInfo.rule.name,
              deltaPayout,
              retroactive: true,
            });

            settledResults.push({
              ticket_id: row.ticket_id,
              user_id: row.user_id,
              stake: row.stake,
              bonus_amount: bonusPayout,
              credited_delta: deltaPayout,
              multiplier: bonusInfo.multiplier,
              rule_name: bonusInfo.rule.name,
              failed_count: bonusInfo.failedCount,
              total_teams: bonusInfo.totalTeams,
            });
          } else {
            withStore((store) => {
              const bet = store.bets.find((b) => b.ticket_id === row.ticket_id);
              if (bet && bet.status === "open") {
                bet.status = "lost";
                bet.settled_at = new Date().toISOString();
                bet.selections = JSON.stringify(selections);
              }
            });
          }
        } else {
          // All won
          if (row.status === "open") {
            let effectiveOdds = 1.0;
            let hasVoided = false;
            for (const s of selections) {
              if (s.voided) {
                hasVoided = true;
                effectiveOdds *= 1.0;
              } else {
                effectiveOdds *= Number(s.odd || 1);
              }
            }
            const maxWinLimit = getMaxWinLimit();
            const rawPayout = hasVoided
              ? Number((row.stake * effectiveOdds).toFixed(2))
              : Number(row.potential_win || (row.stake * effectiveOdds).toFixed(2));
            const payout = Math.min(rawPayout, maxWinLimit);

            withStore((store) => {
              const bet = store.bets.find((b) => b.ticket_id === row.ticket_id);
              if (bet) {
                bet.status = "won";
                bet.payout = payout;
                bet.settled_at = new Date().toISOString();
                bet.selections = JSON.stringify(selections);
              }
            });
            if (payout > 0) {
              creditWallet(row.user_id, payout, "bet_win", row.ticket_id, { ticketId: row.ticket_id });
            }
          }
        }
      } else {
        if (selectionsChanged) {
          withStore((store) => {
            const bet = store.bets.find((b) => b.ticket_id === row.ticket_id);
            if (bet && bet.status === "open") {
              bet.selections = JSON.stringify(selections);
            }
          });
        }
      }
    }
  } catch (err) {
    console.error("[retroactiveSettleAllTickets] Error:", err.message);
  }
  return settledResults;
}

// Background poller to auto-settle any finished matches every 2 minutes
setInterval(() => {
  autoSettleOpenTickets().catch(() => {});
}, 120000);

router.get("/history", authRequired, (req, res) => {
  autoSettleOpenTickets(req.user.id).catch(() => {});

  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 30));
  const isCashierOrAdmin = req.user.role === "admin" || req.user.role === "super_admin";
  const store = getStore();
  const rows = (store.bets || []).filter((b) => {
    if (isCashierOrAdmin) {
      return String(b.cashier_id) === String(req.user.id) || String(b.user_id) === String(req.user.id);
    }
    return String(b.user_id) === String(req.user.id);
  }).slice(0, limit);

  const tickets = rows.map((row) => {
    let bets = [];
    try {
      bets = JSON.parse(row.selections);
      if (Array.isArray(bets)) {
        bets.sort((a, b) => (new Date(a.kickoff || a.date || 0).getTime()) - (new Date(b.kickoff || b.date || 0).getTime()));
      }
    } catch (_) {}

    // Keep genuine selection statuses as stored in the database

    bets.forEach((b) => {
      if (b.score && typeof b.score === "string") {
        const parts = b.score.replace(":", "-").split("-");
        if (parts.length === 2) {
          b.ftScore = b.ftScore || `${parts[0]}:${parts[1]}`;
          if (parts[0] === "0" && parts[1] === "0") {
            b.htScore = b.htScore || "0:0";
          }
        }
      }
    });

    return {
      id: row.ticket_id,
      publicCode: ticketPublicCode(row),
      ticketHash: ticketPublicCode(row),
      publicStatusUrl: `/?check=${encodeURIComponent(ticketPublicCode(row))}`,
      cashierCode: row.cashier_code || (function() {
        const m = String(row.ticket_id || "").match(/\d+/);
        return m ? String(1000 + (parseInt(m[0], 10) - 1)) : "1000";
      })(),
      stake: row.stake,
      totalOdds: row.total_odds,
      potentialWin: row.potential_win,
      status: row.status,
      payout: row.payout,
      mode: row.mode,
      bonusAwarded: Boolean(row.bonus_awarded || (row.bonus_amount && row.bonus_amount > 0)),
      bonusAmount: row.bonus_amount || 0,
      bonusMultiplier: row.bonus_multiplier || null,
      bonusRuleName: row.bonus_rule_name || null,
      bonusFailedCount: row.bonus_failed_count || null,
      bonusTotalTeams: row.bonus_total_teams || null,
      bets,
      placedAt: row.placed_at,
      settledAt: row.settled_at,
    };
  });

  res.json({ ok: true, tickets });
});

router.post("/dev/settle/:ticketId", authRequired, (req, res) => {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_SETTLE !== "true") {
    return res.status(403).json({ ok: false, error: "Not available in production" });
  }

  const ticketId = req.params.ticketId;
  const won = Boolean(req.body.won);

  const row = withStore((store) =>
    store.bets.find((b) => b.ticket_id === ticketId && b.user_id === req.user.id && b.status === "open")
  );

  if (!row) return res.status(404).json({ ok: false, error: "Open ticket not found" });

  const maxWinLimit = getMaxWinLimit();
  let payout = won ? Math.min(Number(row.potential_win || 0), maxWinLimit) : 0;
  let bonusInfo = null;

  withStore((store) => {
    const bet = store.bets.find((b) => b.ticket_id === ticketId);
    if (!bet) return;
    bet.status = won ? "won" : "lost";
    bet.settled_at = new Date().toISOString();

    try {
      const selections = JSON.parse(bet.selections || "[]");
      if (won) {
        selections.forEach((s) => {
          s.status = "won";
        });
      } else {
        const failCount = req.body.failCount !== undefined ? Number(req.body.failCount) : (req.body.failIndex !== undefined ? 1 : 1);
        const failIdx = req.body.failIndex !== undefined ? Number(req.body.failIndex) : -1;
        selections.forEach((s, idx) => {
          if (failIdx >= 0 ? idx === failIdx : idx < failCount) {
            s.status = "lost";
          } else {
            s.status = "won";
          }
        });

        bonusInfo = calculateNearMissBonus(bet.stake, selections);
        if (bonusInfo && bonusInfo.amount > 0) {
          payout = bonusInfo.amount;
          bet.bonus_awarded = true;
          bet.bonus_amount = bonusInfo.amount;
          bet.bonus_multiplier = bonusInfo.multiplier;
          bet.bonus_rule_name = bonusInfo.rule.name;
          bet.bonus_failed_count = bonusInfo.failedCount;
          bet.bonus_total_teams = bonusInfo.totalTeams;
          bet.bonus_effective_odds = bonusInfo.effectiveOdds;
        }
      }
      bet.payout = payout;
      bet.selections = JSON.stringify(selections);
    } catch (_) {}
  });

  if (payout > 0) {
    creditWallet(req.user.id, payout, won ? "bet_win" : "bonus_cut", ticketId, {
      ticketId,
      ...(bonusInfo ? { multiplier: bonusInfo.multiplier, failedCount: bonusInfo.failedCount, totalTeams: bonusInfo.totalTeams } : {})
    });
  }

  const wallet = withStore((store) => store.wallets[String(req.user.id)]);

  res.json({
    ok: true,
    ticketId,
    status: won ? "won" : "lost",
    payout,
    bonusAwarded: Boolean(bonusInfo && bonusInfo.amount > 0),
    bonusAmount: bonusInfo ? bonusInfo.amount : 0,
    bonusMultiplier: bonusInfo ? bonusInfo.multiplier : null,
    balance: wallet.balance,
  });
});

function matchTicket(b, query) {
  if (!b || !query) return false;
  let q = String(query).trim().toLowerCase();
  if (q.includes("check=")) {
    const m = q.match(/check=([^&]+)/);
    if (m) q = decodeURIComponent(m[1]).toLowerCase();
  } else if (q.includes("/v/")) {
    const m = q.match(/\/v\/([^/?#]+)/);
    if (m) q = decodeURIComponent(m[1]).toLowerCase();
  } else if (q.includes("ticket=")) {
    const m = q.match(/ticket=([^&]+)/);
    if (m) q = decodeURIComponent(m[1]).toLowerCase();
  }
  const tid = String(b.ticket_id || "").trim().toLowerCase();
  if (tid === q) return true;
  if (b.alt_ticket_id && String(b.alt_ticket_id).trim().toLowerCase() === q) return true;
  if (String(b.cashier_code || "").trim().toLowerCase() === q) return true;
  if (ticketPublicCode(b).toLowerCase() === q) return true;

  const m = tid.match(/\d+/);
  if (m) {
    const num = parseInt(m[0], 10);
    if (!isNaN(num) && num > 0) {
      const derivedCode = String(1000 + (num - 1));
      if (derivedCode === q) return true;
      const qDigits = q.replace(/\D/g, "");
      if (qDigits && (parseInt(qDigits, 10) === num || parseInt(qDigits, 10) === (1000 + num - 1))) {
        return true;
      }
    }
  }
  return false;
}

router.post("/settle/:ticketId", authRequired, async (req, res) => {
  const ticketId = req.params.ticketId;
  const isCashierOrAdmin = req.user.role === "admin" || req.user.role === "super_admin";

  const store = getStore();
  const row = (store.bets || []).find((b) => {
    if (!matchTicket(b, ticketId)) return false;
    if (isCashierOrAdmin) return true;
    return String(b.user_id) === String(req.user.id);
  });

  if (!row) return res.status(404).json({ ok: false, error: "Ticket not found" });

  if (row.status === "open") {
    await autoSettleOpenTickets(row.user_id);
  }

  let updatedRow = getStore().bets.find((b) => b.ticket_id === row.ticket_id) || row;
  let bets = [];
  try {
    bets = JSON.parse(updatedRow.selections);
    if (Array.isArray(bets)) {
      bets.sort((a, b) => (new Date(a.kickoff || a.date || 0).getTime()) - (new Date(b.kickoff || b.date || 0).getTime()));
    }
  } catch (_) {}

  // Retroactive Near-Miss Bonus check: if ticket was settled as lost without bonus, evaluate it now
  if (updatedRow.status === "lost" && !updatedRow.bonus_awarded && (!updatedRow.bonus_amount || updatedRow.bonus_amount <= 0)) {
    try {
      const bonusInfo = calculateNearMissBonus(updatedRow.stake, bets);
      if (bonusInfo && bonusInfo.amount > 0) {
        withStore((s) => {
          const bet = s.bets.find((b) => b.ticket_id === updatedRow.ticket_id);
          if (bet) {
            bet.payout = bonusInfo.amount;
            bet.bonus_awarded = true;
            bet.bonus_amount = bonusInfo.amount;
            bet.bonus_multiplier = bonusInfo.multiplier;
            bet.bonus_rule_name = bonusInfo.rule.name;
            bet.bonus_failed_count = bonusInfo.failedCount;
            bet.bonus_total_teams = bonusInfo.totalTeams;
            bet.bonus_effective_odds = bonusInfo.effectiveOdds;
          }
        });
        updatedRow = getStore().bets.find((b) => b.ticket_id === row.ticket_id) || updatedRow;
      }
    } catch (_) {}
  }

  bets.forEach((b) => {
    if (b.score && typeof b.score === "string") {
      const parts = b.score.replace(":", "-").split("-");
      if (parts.length === 2) {
        b.ftScore = b.ftScore || `${parts[0]}:${parts[1]}`;
        if (parts[0] === "0" && parts[1] === "0") {
          b.htScore = b.htScore || "0:0";
        }
      }
    }
  });

  const wallet = withStore((store) => store.wallets[String(req.user.id)] || {});

  res.json({
    ok: true,
    ticket: {
      id: updatedRow.ticket_id,
      publicCode: ticketPublicCode(updatedRow),
      ticketHash: ticketPublicCode(updatedRow),
      publicStatusUrl: `/?check=${encodeURIComponent(ticketPublicCode(updatedRow))}`,
      cashierCode: updatedRow.cashier_code || (function() {
        const m = String(updatedRow.ticket_id || "").match(/\d+/);
        return m ? String(1000 + (parseInt(m[0], 10) - 1)) : "1000";
      })(),
      status: updatedRow.status,
      payout: updatedRow.payout,
      stake: updatedRow.stake,
      totalOdds: updatedRow.total_odds,
      potentialWin: updatedRow.potential_win,
      bonusAwarded: Boolean(updatedRow.bonus_awarded || (updatedRow.bonus_amount && updatedRow.bonus_amount > 0)),
      bonusAmount: updatedRow.bonus_amount || 0,
      bonusMultiplier: updatedRow.bonus_multiplier || null,
      bonusRuleName: updatedRow.bonus_rule_name || null,
      bonusFailedCount: updatedRow.bonus_failed_count || null,
      bonusTotalTeams: updatedRow.bonus_total_teams || null,
      bets,
      placedAt: updatedRow.placed_at,
      settledAt: updatedRow.settled_at,
      paymentDate: updatedRow.paid_at || updatedRow.settled_at || null,
      paymentUser: updatedRow.paid_by_username || updatedRow.paid_by || null,
      cancelledAt: updatedRow.cancelled_at || null,
      cancelledBy: updatedRow.cancelled_by_username || updatedRow.cancelled_by || null,
      cancellationReason: updatedRow.cancellation_reason || null,
    },
    balance: wallet.balance,
  });
});

router.get("/ticket/:ticketId", (req, res) => {
  const ticketId = req.params.ticketId;
  const store = getStore();
  const row = (store.bets || []).find((b) => matchTicket(b, ticketId));
  if (!row) {
    const rawDigits = String(ticketId).replace(/\D/g, "");
    if (rawDigits.length === 5) {
      const booking = store.booked_bets ? store.booked_bets[rawDigits] : null;
      if (booking) {
        return res.json({
          ok: true,
          isBookedBet: true,
          ticket: {
            id: `BOOK-${booking.code}`,
            bookingCode: booking.code,
            cashierCode: booking.code,
            publicCode: booking.code,
            isBookedBet: true,
            status: "booked",
            stake: booking.stake,
            totalOdds: booking.totalOdds,
            potentialWin: booking.potentialWin,
            mode: booking.mode,
            bets: booking.selections,
            placedAt: booking.createdAt,
          },
        });
      }
    }
    return res.status(404).json({ ok: false, error: "Ticket not found" });
  }

  if (row.status === "open") {
    autoSettleOpenTickets(row.user_id).catch(() => {});
  }

  let updatedRow = getStore().bets.find((b) => b.ticket_id === row.ticket_id) || row;
  let bets = [];
  try {
    bets = JSON.parse(updatedRow.selections);
    if (Array.isArray(bets)) {
      bets.sort((a, b) => (new Date(a.kickoff || a.date || 0).getTime()) - (new Date(b.kickoff || b.date || 0).getTime()));
    }
  } catch (_) {}

  // Retroactive Near-Miss Bonus check: if ticket was settled as lost without bonus, evaluate it now
  if (updatedRow.status === "lost" && !updatedRow.bonus_awarded && (!updatedRow.bonus_amount || updatedRow.bonus_amount <= 0)) {
    try {
      const bonusInfo = calculateNearMissBonus(updatedRow.stake, bets);
      if (bonusInfo && bonusInfo.amount > 0) {
        withStore((s) => {
          const bet = s.bets.find((b) => b.ticket_id === updatedRow.ticket_id);
          if (bet) {
            bet.payout = bonusInfo.amount;
            bet.bonus_awarded = true;
            bet.bonus_amount = bonusInfo.amount;
            bet.bonus_multiplier = bonusInfo.multiplier;
            bet.bonus_rule_name = bonusInfo.rule.name;
            bet.bonus_failed_count = bonusInfo.failedCount;
            bet.bonus_total_teams = bonusInfo.totalTeams;
            bet.bonus_effective_odds = bonusInfo.effectiveOdds;
          }
        });
        updatedRow = getStore().bets.find((b) => b.ticket_id === row.ticket_id) || updatedRow;
      }
    } catch (_) {}
  }

  bets.forEach((b) => {
    if (b.score && typeof b.score === "string") {
      const parts = b.score.replace(":", "-").split("-");
      if (parts.length === 2) {
        b.ftScore = b.ftScore || `${parts[0]}:${parts[1]}`;
        if (parts[0] === "0" && parts[1] === "0") {
          b.htScore = b.htScore || "0:0";
        }
      }
    }
  });

  res.json({
    ok: true,
    ticket: {
      id: updatedRow.ticket_id,
      publicCode: ticketPublicCode(updatedRow),
      ticketHash: ticketPublicCode(updatedRow),
      publicStatusUrl: `/?check=${encodeURIComponent(ticketPublicCode(updatedRow))}`,
      cashierCode: updatedRow.cashier_code || (function() {
        const m = String(updatedRow.ticket_id || "").match(/\d+/);
        return m ? String(1000 + (parseInt(m[0], 10) - 1)) : "1000";
      })(),
      status: updatedRow.status,
      payout: updatedRow.payout,
      stake: updatedRow.stake,
      totalOdds: updatedRow.total_odds,
      potentialWin: updatedRow.potential_win,
      mode: updatedRow.mode,
      bonusAwarded: Boolean(updatedRow.bonus_awarded || (updatedRow.bonus_amount && updatedRow.bonus_amount > 0)),
      bonusAmount: updatedRow.bonus_amount || 0,
      bonusMultiplier: updatedRow.bonus_multiplier || null,
      bonusRuleName: updatedRow.bonus_rule_name || null,
      bonusFailedCount: updatedRow.bonus_failed_count || null,
      bonusTotalTeams: updatedRow.bonus_total_teams || null,
      bets,
      placedAt: updatedRow.placed_at,
      settledAt: updatedRow.settled_at,
      paymentDate: updatedRow.paid_at || updatedRow.settled_at || null,
      paymentUser: updatedRow.paid_by_username || updatedRow.paid_by || null,
      cancelledAt: updatedRow.cancelled_at || null,
      cancelledBy: updatedRow.cancelled_by_username || updatedRow.cancelled_by || null,
      cancellationReason: updatedRow.cancellation_reason || null,
    },
  });
});

router.post("/retroactive-settle", authRequired, async (req, res) => {
  const isCashierOrAdmin = req.user.role === "admin" || req.user.role === "super_admin";
  if (!isCashierOrAdmin) {
    return res.status(403).json({ ok: false, error: "Only admins and cashiers can run retroactive settlement" });
  }
  const results = await retroactiveSettleAllTickets();
  res.json({ ok: true, count: results.length, settlements: results });
});

router.autoSettleOpenTickets = autoSettleOpenTickets;
router.retroactiveSettleAllTickets = retroactiveSettleAllTickets;
router.calculateNearMissBonus = calculateNearMissBonus;
module.exports = router;

