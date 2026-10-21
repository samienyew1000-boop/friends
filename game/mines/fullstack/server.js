// src/server.ts
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// src/coefficients.ts
function combinations(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let c = 1;
  for (let i = 1; i <= k; i++) {
    c = c * (n - (k - i)) / i;
  }
  return c;
}
function calculateMultiplier(minesCount, hits, rtp = 0.95) {
  if (hits <= 0) return 1;
  const totalCells = 25;
  const safeCells = totalCells - minesCount;
  if (hits > safeCells) return 0;
  const fair = combinations(totalCells, hits) / combinations(safeCells, hits);
  const mult = rtp * fair;
  return Number(mult.toFixed(2));
}
var VERIFIED_COEFFICIENTS = {
  "1": ["1.00", "0.98", "1.03", "1.07", "1.13", "1.18", "1.24", "1.31", "1.39", "1.48", "1.58", "1.69", "1.82", "1.97", "2.15", "2.37", "2.63", "2.96", "3.39", "3.95", "4.75", "5.93", "7.91", "11.87", "23.75"],
  "2": ["1.00", "1.03", "1.12", "1.23", "1.35", "1.50", "1.66", "1.86", "2.09", "2.37", "2.71", "3.13", "3.65", "4.31", "5.18", "6.33", "7.91", "10.17", "13.57", "19.00", "28.50", "47.50", "95.00", "285.00"],
  "3": ["1.00", "1.07", "1.23", "1.41", "1.64", "1.91", "2.25", "2.67", "3.21", "3.90", "4.80", "6.00", "7.63", "9.93", "13.24", "18.20", "26.01", "39.01", "62.42", "109.25", "218.50", "546.25", "2185.00"],
  "4": ["1.00", "1.13", "1.35", "1.64", "2.00", "2.48", "3.10", "3.92", "5.04", "6.60", "8.80", "12.00", "16.80", "24.27", "36.41", "57.22", "95.37", "171.67", "343.35", "801.16", "2403.50", "12017.50"],
  "5": ["1.00", "1.18", "1.50", "1.91", "2.48", "3.25", "4.34", "5.89", "8.15", "11.55", "16.80", "25.21", "39.21", "63.72", "109.24", "200.29", "400.58", "901.31", "2403.49", "8412.24", "50473.49"],
  "6": ["1.00", "1.25", "1.66", "2.25", "3.10", "4.34", "6.20", "9.06", "13.59", "21.00", "33.61", "56.02", "98.04", "182.08", "364.16", "801.16", "2002.91", "6008.75", "24035.00", "168245.00"],
  "7": ["1.00", "1.31", "1.86", "2.67", "3.92", "5.89", "9.06", "14.34", "23.48", "39.91", "70.96", "133.06", "266.12", "576.59", "1383.83", "3805.54", "12685.13", "57083.12", "456665.00"],
  "8": ["1.00", "1.39", "2.09", "3.21", "5.04", "8.15", "13.59", "23.48", "42.26", "79.83", "159.67", "342.15", "798.36", "2075.74", "6227.25", "22833.25", "114166.25", "1027496.25"],
  "9": ["1.00", "1.48", "2.37", "3.90", "6.60", "11.55", "21.00", "39.91", "79.83", "169.65", "387.77", "969.44", "2714.44", "8821.93", "35287.74", "194082.62", "1940826.24"],
  "10": ["1.00", "1.58", "2.71", "4.80", "8.80", "16.80", "33.61", "70.96", "159.67", "387.77", "1034.07", "3102.21", "10857.76", "47050.33", "282302.00", "3105322.00"],
  "11": ["1.00", "1.69", "3.13", "6.00", "12.00", "25.21", "56.02", "133.06", "342.15", "969.44", "3102.21", "11633.32", "54288.84", "352877.50", "4234530.00"],
  "12": ["1.00", "1.82", "3.65", "7.63", "16.80", "39.21", "98.04", "266.12", "798.36", "2714.44", "10857.76", "54288.84", "380021.92", "4940284.99"],
  "13": ["1.00", "1.97", "4.31", "9.93", "24.27", "63.72", "182.08", "576.59", "2075.75", "8821.93", "47050.33", "352877.50", "4940285.00"],
  "14": ["1.00", "2.15", "5.18", "13.24", "36.41", "109.25", "364.16", "1383.83", "6227.25", "35287.75", "282302.00", "4234530.00"],
  "15": ["1.00", "2.37", "6.33", "18.20", "57.22", "200.29", "801.16", "3805.54", "22833.25", "194082.62", "3105322.00"],
  "16": ["1.00", "2.63", "7.91", "26.01", "95.37", "400.58", "2002.91", "12685.13", "114166.25", "1940826.25"],
  "17": ["1.00", "2.96", "10.17", "39.01", "171.67", "901.31", "6008.75", "57083.12", "1027496.25"],
  "18": ["1.00", "3.39", "13.57", "62.42", "343.35", "2403.50", "24035.00", "456664.99"],
  "19": ["1.00", "3.95", "19.00", "109.25", "801.16", "8412.25", "168245.00"],
  "20": ["1.00", "4.75", "28.50", "218.50", "2403.50", "50473.50"],
  "21": ["1.00", "5.93", "47.50", "546.25", "12017.50"],
  "22": ["1.00", "7.91", "95.00", "2185.00"],
  "23": ["1.00", "11.87", "285.00"],
  "24": ["1.00", "23.75"]
};

// src/server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
app.use(cors());
app.use(express.json());
var httpServer = createServer(app);
var io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  // Support both default Socket.io path and production path
  path: "/io/"
});
app.post("/api/auth", (req, res) => {
  res.status(201).json({
    token: "mock-jwt-token-1234567890",
    userId: "18c69718-943c-4f2d-a5ea-1fc386ff7290",
    nickname: "Magenta Unexpected Dolphin",
    balance: "1000000.00",
    currency: "USD"
  });
});
var sessions = /* @__PURE__ */ new Map();
function getRandomMines(count) {
  const cells = Array.from({ length: 25 }, (_, i) => i + 1);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells.slice(0, count).sort((a, b) => a - b);
}
io.on("connection", (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);
  const session = {
    balance: 1e6,
    currency: "USD",
    nickname: "Magenta Unexpected Dolphin",
    game: {
      status: "none",
      amount: 0,
      currency: "USD",
      minesCount: 3,
      minesCells: [],
      openedCells: [],
      coeff: 0,
      winAmount: "0"
    }
  };
  sessions.set(socket.id, session);
  socket.emit("myData", {
    role: "player",
    userId: socket.id,
    nickname: session.nickname,
    gameAvatar: null
  });
  socket.emit("onBalanceChange", {
    currency: session.currency,
    balance: session.balance.toFixed(2)
  });
  socket.on("gameService", (data, ack) => {
    const action = data?.action;
    const payload = data?.payload;
    console.log(`[gameService Action] ${action}`, payload || "");
    switch (action) {
      case "get-game-state": {
        if (session.game.status === "in-game") {
          return ack({
            status: "in-game",
            bet: {
              amount: session.game.amount.toFixed(2),
              currency: session.game.currency,
              decimalPlaces: 2
            },
            isFinished: false,
            isWin: false,
            coeff: session.game.coeff,
            winAmount: session.game.winAmount,
            minesCount: session.game.minesCount,
            openedCells: session.game.openedCells
          });
        }
        return ack({ status: "none" });
      }
      case "get-game-config": {
        return ack({
          betConfig: {
            minBetAmount: "0.12",
            maxBetAmount: "200.00",
            maxWinAmount: "20000.00",
            defaultBetAmount: "3.00",
            betPresets: ["2.00", "3.00", "8.00", "20.00"],
            decimalPlaces: "2",
            currency: "USD"
          },
          coefficients: VERIFIED_COEFFICIENTS
        });
      }
      case "get-rates": {
        return ack({
          USD: 1,
          EUR: 0.89,
          GBP: 0.75,
          BTC: 12e-6,
          ETH: 41e-5,
          USDT: 1,
          USDC: 1
        });
      }
      case "get-game-seeds": {
        return ack({
          clientSeed: "player-seed-" + socket.id.slice(0, 6),
          serverSeedHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          nonce: 1
        });
      }
      case "play": {
        const amount = Number(payload?.amount) || 3;
        const minesCount = Math.max(1, Math.min(24, Number(payload?.value?.minesCount) || 3));
        const currency = payload?.currency || "USD";
        if (session.balance < amount) {
          return ack({ error: "Insufficient balance" });
        }
        session.balance -= amount;
        socket.emit("onBalanceChange", {
          currency: session.currency,
          balance: session.balance.toFixed(2)
        });
        const minesCells = getRandomMines(minesCount);
        session.game = {
          status: "in-game",
          amount,
          currency,
          minesCount,
          minesCells,
          openedCells: [],
          coeff: 0,
          winAmount: "0"
        };
        console.log(`[Game Started] Bet: ${amount} ${currency}, Mines (${minesCount}):`, minesCells);
        return ack({
          status: "in-game",
          bet: {
            amount: amount.toFixed(2),
            currency,
            decimalPlaces: 2
          },
          isFinished: false,
          isWin: false,
          coeff: 0,
          winAmount: "0",
          minesCount,
          openedCells: []
        });
      }
      case "step": {
        if (session.game.status !== "in-game") {
          return ack({ error: "No game in progress" });
        }
        const cellPos = Number(payload?.cellPosition);
        if (cellPos < 1 || cellPos > 25 || session.game.openedCells.includes(cellPos)) {
          return ack({ error: "Invalid cell position" });
        }
        if (session.game.minesCells.includes(cellPos)) {
          session.game.status = "lose";
          session.game.openedCells.push(cellPos);
          console.log(`[Detonation!] Cell: ${cellPos}`);
          return ack({
            status: "lose",
            bet: {
              amount: session.game.amount.toFixed(2),
              currency: session.game.currency,
              decimalPlaces: 2
            },
            isFinished: true,
            isWin: false,
            coeff: 0,
            winAmount: "0",
            minesCount: session.game.minesCount,
            openedCells: session.game.openedCells,
            minesCells: session.game.minesCells
            // Reveal remaining bombs
          });
        }
        session.game.openedCells.push(cellPos);
        const hits = session.game.openedCells.length;
        const safeTotal = 25 - session.game.minesCount;
        const coeff = calculateMultiplier(session.game.minesCount, hits);
        const winAmount = (session.game.amount * coeff).toFixed(2);
        session.game.coeff = coeff;
        session.game.winAmount = winAmount;
        if (hits === safeTotal) {
          session.game.status = "win";
          session.balance += Number(winAmount);
          socket.emit("onBalanceChange", {
            currency: session.currency,
            balance: session.balance.toFixed(2)
          });
          console.log(`[Field Cleared! Full Win] Amount: ${winAmount}`);
          return ack({
            status: "win",
            bet: {
              amount: session.game.amount.toFixed(2),
              currency: session.game.currency,
              decimalPlaces: 2
            },
            isFinished: true,
            isWin: true,
            coeff,
            winAmount,
            minesCount: session.game.minesCount,
            openedCells: session.game.openedCells,
            minesCells: session.game.minesCells
          });
        }
        console.log(`[Star Uncovered] Cell: ${cellPos}, Hits: ${hits}, Mult: x${coeff}`);
        return ack({
          status: "in-game",
          bet: {
            amount: session.game.amount.toFixed(2),
            currency: session.game.currency,
            decimalPlaces: 2
          },
          isFinished: false,
          isWin: false,
          coeff,
          winAmount,
          minesCount: session.game.minesCount,
          openedCells: session.game.openedCells
        });
      }
      case "payout": {
        if (session.game.status !== "in-game" || session.game.openedCells.length === 0) {
          return ack({ error: "Cannot payout in current state" });
        }
        session.game.status = "win";
        const winAmountNum = Number(session.game.winAmount);
        session.balance += winAmountNum;
        socket.emit("onBalanceChange", {
          currency: session.currency,
          balance: session.balance.toFixed(2)
        });
        console.log(`[Cashout Win] Payout: ${session.game.winAmount} (x${session.game.coeff})`);
        return ack({
          status: "win",
          isFinished: true,
          isWin: true,
          coeff: session.game.coeff,
          winAmount: session.game.winAmount,
          minesCount: session.game.minesCount,
          openedCells: session.game.openedCells,
          minesCells: session.game.minesCells
          // Reveal remaining bombs
        });
      }
      default:
        console.warn(`[Unknown Action] ${action}`);
        return ack({ error: `Unknown action: ${action}` });
    }
  });
  socket.on("disconnect", () => {
    console.log(`[Socket Disconnected] ID: ${socket.id}`);
    sessions.delete(socket.id);
  });
});
var publicDir = [
  path.resolve(__dirname, "./public"),
  path.resolve(__dirname, "../public"),
  path.resolve(__dirname, "../../client/dist")
].find((p) => fs.existsSync(p));
if (publicDir) {
  console.log(`[Static Files] Serving from ${publicDir}`);
  app.use(express.static(publicDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/io/") || req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(publicDir, "index.html"));
  });
}
var PORT = process.env.PORT || 4e3;
httpServer.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`\u{1F680} Mines Game Server running on port ${PORT}`);
  console.log(`   WebSocket URL: ws://localhost:${PORT}/io/`);
  console.log(`   REST Auth URL: http://localhost:${PORT}/api/auth`);
  console.log(`===============================================`);
});
