/**
 * Mines Game Embedded Client-Side Engine
 * Replicates the fullstack/server.js protocol in-browser for 100% offline & standalone play
 * Synchronized with window.HabeshaWallet
 */
(function() {
  function combinations(n, k) {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    let c = 1;
    for (let i = 1; i <= k; i++) {
      c = (c * (n - (k - i))) / i;
    }
    return c;
  }

  function getMinesRTP() {
    if (window.HabeshaWallet && typeof window.HabeshaWallet.getGameMargin === 'function') {
      const margin = window.HabeshaWallet.getGameMargin('mines', 4.0);
      return Math.max(0.60, Math.min(0.99, 1 - (margin / 100)));
    }
    return 0.95;
  }

  function calculateMultiplier(minesCount, hits, rtp = null) {
    if (hits <= 0) return 1;
    const currentRtp = rtp !== null ? rtp : getMinesRTP();
    const totalCells = 25;
    const safeCells = totalCells - minesCount;
    if (hits > safeCells) return 0;
    const fair = combinations(totalCells, hits) / combinations(safeCells, hits);
    const mult = currentRtp * fair;
    return Number(mult.toFixed(2));
  }

  const VERIFIED_COEFFICIENTS = {
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

  function getRandomMines(count) {
    const cells = Array.from({ length: 25 }, (_, i) => i + 1);
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    return cells.slice(0, count).sort((a, b) => a - b);
  }

  function getWalletBalance() {
    if (window.HabeshaWallet && typeof window.HabeshaWallet.get === 'function') {
      return Number(window.HabeshaWallet.get());
    }
    const saved = localStorage.getItem('mines_local_balance');
    return saved ? Number(saved) : 1000;
  }

  function setWalletBalance(newBal) {
    if (window.HabeshaWallet && typeof window.HabeshaWallet.set === 'function') {
      window.HabeshaWallet.set(newBal);
    } else {
      localStorage.setItem('mines_local_balance', newBal.toFixed(2));
    }
  }

  function getCurrency() {
    if (window.HabeshaWallet && window.HabeshaWallet.currency) {
      return window.HabeshaWallet.currency;
    }
    return "ETB";
  }

  class MockSocket {
    constructor() {
      this.id = "mines-client-" + Math.random().toString(36).slice(2, 9);
      this.listeners = new Map();
      this.session = {
        balance: getWalletBalance(),
        currency: getCurrency(),
        nickname: "Player",
        game: {
          status: "none",
          amount: 0,
          currency: getCurrency(),
          minesCount: 3,
          minesCells: [],
          openedCells: [],
          coeff: 0,
          winAmount: "0"
        }
      };

      // Connect after microtask
      setTimeout(() => {
        this.emitLocal("connect");
        this.emitLocal("myData", {
          role: "player",
          userId: this.id,
          nickname: this.session.nickname,
          gameAvatar: null
        });
        this.emitLocal("onBalanceChange", {
          currency: getCurrency(),
          balance: getWalletBalance().toFixed(2)
        });
      }, 50);

      // Listen for window.HabeshaWallet updates
      window.addEventListener("balanceUpdated", (e) => {
        const bal = e.detail?.balance ?? getWalletBalance();
        this.session.balance = bal;
        this.emitLocal("onBalanceChange", {
          currency: getCurrency(),
          balance: Number(bal).toFixed(2)
        });
      });
    }

    on(event, callback) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, []);
      }
      this.listeners.get(event).push(callback);
      return this;
    }

    off(event, callback) {
      if (!this.listeners.has(event)) return this;
      if (!callback) {
        this.listeners.delete(event);
      } else {
        const arr = this.listeners.get(event).filter(cb => cb !== callback);
        this.listeners.set(event, arr);
      }
      return this;
    }

    emitLocal(event, ...args) {
      const cbs = this.listeners.get(event) || [];
      for (const cb of cbs) {
        try { cb(...args); } catch (e) { console.error("Error in mock socket callback:", e); }
      }
    }

    emit(event, data, ack) {
      if (event === "gameService") {
        const action = data?.action;
        const payload = data?.payload;
        console.log(`[Embedded Engine action]:`, action, payload || "");

        setTimeout(() => {
          this.handleGameService(action, payload, ack || (() => {}));
        }, 30);
      }
    }

    disconnect() {
      this.listeners.clear();
    }

    handleGameService(action, payload, ack) {
      const s = this.session;
      const curr = getCurrency();

      switch (action) {
        case "get-game-state": {
          if (s.game.status === "in-game") {
            return ack({
              status: "in-game",
              bet: {
                amount: s.game.amount.toFixed(2),
                currency: curr,
                decimalPlaces: 2
              },
              isFinished: false,
              isWin: false,
              coeff: s.game.coeff,
              winAmount: s.game.winAmount,
              minesCount: s.game.minesCount,
              openedCells: s.game.openedCells
            });
          }
          return ack({ status: "none", openedCells: [] });
        }

        case "get-game-config": {
          return ack({
            betConfig: {
              minBetAmount: "0.12",
              maxBetAmount: "500.00",
              maxWinAmount: "50000.00",
              defaultBetAmount: "5.00",
              betPresets: ["2.00", "5.00", "10.00", "50.00"],
              decimalPlaces: "2",
              currency: curr
            },
            coefficients: VERIFIED_COEFFICIENTS
          });
        }

        case "get-rates": {
          return ack({
            USD: 1,
            ETB: 125,
            EUR: 0.89,
            USDT: 1
          });
        }

        case "get-game-seeds": {
          return ack({
            clientSeed: "player-seed-" + this.id.slice(0, 6),
            serverSeedHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            nonce: 1
          });
        }

        case "play": {
          const amount = Number(payload?.amount) || 5;
          const minesCount = Math.max(1, Math.min(24, Number(payload?.value?.minesCount) || 3));
          const currentBal = getWalletBalance();

          if (currentBal < amount) {
            return ack({ error: "Insufficient balance" });
          }

          const newBal = Math.max(0, currentBal - amount);
          setWalletBalance(newBal);
          s.balance = newBal;

          this.emitLocal("onBalanceChange", {
            currency: curr,
            balance: newBal.toFixed(2)
          });

          const minesCells = getRandomMines(minesCount);
          s.game = {
            status: "in-game",
            amount,
            currency: curr,
            minesCount,
            minesCells,
            openedCells: [],
            coeff: 0,
            winAmount: "0"
          };

          console.log(`[Mines Engine Started] Bet: ${amount} ${curr}, Mines: ${minesCount}`);
          return ack({
            status: "in-game",
            bet: {
              amount: amount.toFixed(2),
              currency: curr,
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
          if (s.game.status !== "in-game") {
            return ack({ error: "No game in progress" });
          }
          const cellPos = Number(payload?.cellPosition);
          if (cellPos < 1 || cellPos > 25 || s.game.openedCells.includes(cellPos)) {
            return ack({ error: "Invalid cell position" });
          }

          // Check if detonation!
          if (s.game.minesCells.includes(cellPos)) {
            s.game.status = "lose";
            s.game.openedCells.push(cellPos);
            console.log(`[Detonation!] Cell: ${cellPos}`);
            return ack({
              status: "lose",
              bet: {
                amount: s.game.amount.toFixed(2),
                currency: curr,
                decimalPlaces: 2
              },
              isFinished: true,
              isWin: false,
              coeff: 0,
              winAmount: "0",
              minesCount: s.game.minesCount,
              openedCells: s.game.openedCells,
              minesCells: s.game.minesCells
            });
          }

          // Safe Star!
          s.game.openedCells.push(cellPos);
          const hits = s.game.openedCells.length;
          const safeTotal = 25 - s.game.minesCount;
          const coeff = calculateMultiplier(s.game.minesCount, hits);
          const winAmount = (s.game.amount * coeff).toFixed(2);
          s.game.coeff = coeff;
          s.game.winAmount = winAmount;

          if (hits === safeTotal) {
            // Cleared entire safe field!
            s.game.status = "win";
            const curBal = getWalletBalance();
            const newBal = curBal + Number(winAmount);
            setWalletBalance(newBal);
            s.balance = newBal;

            this.emitLocal("onBalanceChange", {
              currency: curr,
              balance: newBal.toFixed(2)
            });

            console.log(`[Field Cleared!] Full Win: ${winAmount} ${curr}`);
            return ack({
              status: "win",
              bet: {
                amount: s.game.amount.toFixed(2),
                currency: curr,
                decimalPlaces: 2
              },
              isFinished: true,
              isWin: true,
              coeff,
              winAmount,
              minesCount: s.game.minesCount,
              openedCells: s.game.openedCells,
              minesCells: s.game.minesCells
            });
          }

          console.log(`[Star Uncovered] Cell: ${cellPos}, Hits: ${hits}, Mult: x${coeff}`);
          return ack({
            status: "in-game",
            bet: {
              amount: s.game.amount.toFixed(2),
              currency: curr,
              decimalPlaces: 2
            },
            isFinished: false,
            isWin: false,
            coeff,
            winAmount,
            minesCount: s.game.minesCount,
            openedCells: s.game.openedCells
          });
        }

        case "payout": {
          if (s.game.status !== "in-game" || s.game.openedCells.length === 0) {
            return ack({ error: "Cannot payout in current state" });
          }
          s.game.status = "win";
          const winAmountNum = Number(s.game.winAmount);
          const curBal = getWalletBalance();
          const newBal = curBal + winAmountNum;
          setWalletBalance(newBal);
          s.balance = newBal;

          this.emitLocal("onBalanceChange", {
            currency: curr,
            balance: newBal.toFixed(2)
          });

          console.log(`[Cashout Payout]: ${s.game.winAmount} (x${s.game.coeff})`);
          return ack({
            status: "win",
            isFinished: true,
            isWin: true,
            coeff: s.game.coeff,
            winAmount: s.game.winAmount,
            minesCount: s.game.minesCount,
            openedCells: s.game.openedCells,
            minesCells: s.game.minesCells
          });
        }

        default:
          return ack({ error: `Unknown action: ${action}` });
      }
    }
  }

  window.__createMinesSocket = function() {
    console.log("[Mines Engine] Creating embedded mock socket connection...");
    return new MockSocket();
  };
})();
