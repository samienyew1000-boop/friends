const ProvablyFair = require('./provably-fair');

class GameEngine {
    constructor() {
        this.provablyFair = new ProvablyFair();
        
        // Game States
        this.STATE_WAITING = 'WAITING_FOR_BETS';
        this.STATE_TAKEOFF = 'TAKEOFF';
        this.STATE_FLYING = 'IN_FLIGHT';
        this.STATE_CRASHED = 'CRASHED';

        this.currentState = this.STATE_WAITING;
        this.currentRoundId = 1001;
        this.targetCrashMultiplier = 1.00;
        this.currentMultiplier = 1.00;
        this.flightStartTime = 0;
        this.flightStep = 0;
        this.countdownRemaining = 5.0;

        // Active bets in current round
        this.activeBets = new Map(); // key: `${userId}_${position}` => betObj
        this.connectedClients = new Set();
        this.clientBalances = new Map(); // userId => balance
        
        // Multiplayer simulated player roster
        this.onlinePlayerCount = 1280;
        this.simulatedBets = [];
        this.roundTotalWin = 0;
        
        // History of last 100 rounds
        this.last100Spins = this.generateInitialHistory();
        
        // Top Winners records
        this.topWins = this.generateInitialTopWins();

        // Start engine tick loop
        this.loopInterval = null;
        this.startEngine();
    }

    generateInitialHistory() {
        const history = [];
        const samples = [
            1.55, 224.59, 2.45, 21.88, 1.02, 3.99, 2.39, 12.18, 3.82, 27.50,
            1.00, 1.47, 2.04, 5.16, 1.05, 4.54, 1.40, 1.34, 7.82, 1.04,
            2.60, 8.05, 1.44, 7.18, 2.25, 1.53, 1.12, 15.60, 1.88, 3.20
        ];
        for (let i = 0; i < samples.length; i++) {
            history.unshift({
                roundId: 1000 - i,
                multiplier: samples[i],
                hash: require('crypto').createHash('sha256').update(`seed_${i}`).digest('hex'),
                time: new Date(Date.now() - (i * 25000)).toISOString()
            });
        }
        return history;
    }

    generateInitialTopWins() {
        return {
            daily: [
                { player: 'D••••4', bet: 100.0, mult: 100.0, win: 10000.0, time: '23:50' },
                { player: 'D••••3', bet: 100.0, mult: 85.5, win: 8550.0, time: '21:14' },
                { player: 'D••••8', bet: 50.0, mult: 142.0, win: 7100.0, time: '19:02' },
                { player: 'D••••7', bet: 20.0, mult: 250.0, win: 5000.0, time: '14:35' },
                { player: 'D••••2', bet: 10.0, mult: 420.0, win: 4200.0, time: '11:20' }
            ],
            weekly: [
                { player: 'D••••7', bet: 40.0, mult: 625.0, win: 25000.0, time: '10-19' },
                { player: 'D••••8', bet: 100.0, mult: 180.0, win: 18000.0, time: '10-18' },
                { player: 'D••••4', bet: 50.0, mult: 300.0, win: 15000.0, time: '10-16' }
            ],
            monthly: [
                { player: 'D••••8', bet: 100.0, mult: 288.95, win: 28895.13, time: '09-24' },
                { player: 'D••••7', bet: 50.0, mult: 500.0, win: 25000.0, time: '09-15' },
                { player: 'D••••2', bet: 100.0, mult: 210.0, win: 21000.0, time: '09-08' }
            ]
        };
    }

    getBalance(userId) {
        if (!this.clientBalances.has(userId)) {
            this.clientBalances.set(userId, 20000.00); // Standard demo balance
        }
        return this.clientBalances.get(userId);
    }

    setBalance(userId, amount) {
        const val = Math.max(0, Number(amount.toFixed(2)));
        this.clientBalances.set(userId, val);
        return val;
    }

    addClient(ws, userId) {
        this.connectedClients.add(ws);
        ws.userId = userId;

        // Send initial load info matching JetX
        const initialInfo = {
            type: 'INIT_STATE',
            state: this.currentState,
            roundId: this.currentRoundId,
            countdown: this.countdownRemaining,
            multiplier: this.currentMultiplier,
            balance: this.getBalance(userId),
            onlinePlayers: this.onlinePlayerCount,
            last100Spins: this.last100Spins,
            topWins: this.topWins,
            activeBets: Array.from(this.activeBets.values()).filter(b => b.userId === userId),
            simulatedBets: this.simulatedBets.slice(0, 50),
            roundTotalWin: this.roundTotalWin
        };
        ws.send(JSON.stringify(initialInfo));
    }

    removeClient(ws) {
        this.connectedClients.delete(ws);
    }

    broadcast(data) {
        const msg = JSON.stringify(data);
        for (const client of this.connectedClients) {
            if (client.readyState === 1) { // OPEN
                client.send(msg);
            }
        }
    }

    startEngine() {
        this.initiateNewRound();
        
        // 50ms tick loop
        this.loopInterval = setInterval(() => {
            this.tick();
        }, 50);
    }

    initiateNewRound() {
        this.currentRoundId++;
        this.currentState = this.STATE_WAITING;
        this.countdownRemaining = 5.0;
        this.currentMultiplier = 1.00;
        this.flightStep = 0;
        this.activeBets.clear();
        this.simulatedBets = [];
        this.roundTotalWin = 0;

        // Generate crash target for this round
        const crashData = this.provablyFair.generateCrashPoint();
        this.targetCrashMultiplier = crashData.multiplier;
        this.currentRoundHash = crashData.hash;

        // Fluctuating online players
        this.onlinePlayerCount = 1200 + Math.floor(Math.random() * 200);

        // Populate realistic simulated bets for multiplayer social proof
        this.generateSimulatedBets();

        this.broadcast({
            type: 'ROUND_START',
            roundId: this.currentRoundId,
            countdown: this.countdownRemaining,
            onlinePlayers: this.onlinePlayerCount,
            simulatedBets: this.simulatedBets.slice(0, 50)
        });
    }

    generateSimulatedBets() {
        const betCount = 80 + Math.floor(Math.random() * 60);
        const playerNames = ['D••••7', 'D••••2', 'D••••4', 'D••••9', 'D••••8', 'D••••3', 'D••••0', 'D••••5', 'D••••1', 'D••••6'];
        const commonStakes = [1, 2, 5, 10, 20, 50, 100];

        for (let i = 0; i < betCount; i++) {
            const name = playerNames[Math.floor(Math.random() * playerNames.length)];
            const betAmount = commonStakes[Math.floor(Math.random() * commonStakes.length)];
            // Simulated cashout target
            const targetMult = Number((1.10 + Math.random() * 8.0).toFixed(2));
            const avatar = Math.floor(Math.random() * 24);

            this.simulatedBets.push({
                id: `sim_${i}`,
                player: name,
                avatar: avatar,
                bet: betAmount,
                targetMult: targetMult,
                cashedOut: false,
                win: 0,
                cashoutMult: null
            });
        }
    }

    tick() {
        if (this.currentState === this.STATE_WAITING) {
            this.countdownRemaining -= 0.05;
            if (this.countdownRemaining <= 0) {
                this.currentState = this.STATE_TAKEOFF;
                this.countdownRemaining = 0;
                this.flightStartTime = Date.now();
                
                this.broadcast({
                    type: 'TAKEOFF',
                    roundId: this.currentRoundId
                });

                // Short takeoff transition (800ms)
                setTimeout(() => {
                    if (this.currentState === this.STATE_TAKEOFF) {
                        this.currentState = this.STATE_FLYING;
                        this.flightStartTime = Date.now();
                    }
                }, 800);
            }
        } else if (this.currentState === this.STATE_FLYING) {
            this.flightStep++;
            const elapsedSeconds = (Date.now() - this.flightStartTime) / 1000;
            
            // JetX exponential multiplier progression: M(t) = e^(0.06 * t)
            const calculatedMult = Number((Math.pow(Math.E, 0.065 * elapsedSeconds)).toFixed(2));
            this.currentMultiplier = Math.max(1.00, calculatedMult);

            // Compute predicted next multiplier for client-side frame interpolation
            const nextMult = Number((Math.pow(Math.E, 0.065 * (elapsedSeconds + 0.08))).toFixed(2));

            // Check if crashed
            if (this.currentMultiplier >= this.targetCrashMultiplier) {
                this.currentMultiplier = this.targetCrashMultiplier;
                this.handleCrash();
                return;
            }

            // Check auto-cashouts for real and simulated players
            this.processAutoCashouts();

            // Broadcast flight tick every 2 steps (~100ms)
            if (this.flightStep % 2 === 0) {
                this.broadcast({
                    type: 'FLIGHT_TICK',
                    multiplier: this.currentMultiplier,
                    nextMultiplier: nextMult,
                    step: this.flightStep,
                    roundTotalWin: Number(this.roundTotalWin.toFixed(2))
                });
            }
        }
    }

    processAutoCashouts() {
        // 1. Real active bets
        for (const [key, bet] of this.activeBets.entries()) {
            if (!bet.cashedOut && bet.autoCashout && bet.autoCashoutValue > 1.0) {
                if (this.currentMultiplier >= bet.autoCashoutValue) {
                    this.executeCashout(bet.userId, bet.position, bet.autoCashoutValue);
                }
            }
        }

        // 2. Simulated players cashout
        for (const sim of this.simulatedBets) {
            if (!sim.cashedOut && this.currentMultiplier >= sim.targetMult && sim.targetMult <= this.targetCrashMultiplier) {
                sim.cashedOut = true;
                sim.cashoutMult = sim.targetMult;
                sim.win = Number((sim.bet * sim.cashoutMult).toFixed(2));
                this.roundTotalWin += sim.win;

                // Broadcast cashout event with parachutist ejection trigger
                this.broadcast({
                    type: 'PLAYER_CASHOUT',
                    player: sim.player,
                    bet: sim.bet,
                    multiplier: sim.cashoutMult,
                    win: sim.win,
                    isSimulated: true
                });
            }
        }
    }

    handleCrash() {
        this.currentState = this.STATE_CRASHED;
        const finalCrash = this.targetCrashMultiplier;

        // Settle all uncashed real bets as losses
        for (const [key, bet] of this.activeBets.entries()) {
            if (!bet.cashedOut) {
                bet.lost = true;
            }
        }

        // Record to history
        const roundRecord = {
            roundId: this.currentRoundId,
            multiplier: finalCrash,
            hash: this.currentRoundHash,
            time: new Date().toISOString()
        };
        this.last100Spins.unshift(roundRecord);
        if (this.last100Spins.length > 100) {
            this.last100Spins.pop();
        }

        this.broadcast({
            type: 'BOOM',
            multiplier: finalCrash,
            hash: this.currentRoundHash,
            roundId: this.currentRoundId,
            last100Spins: this.last100Spins.slice(0, 30)
        });

        // Cooldown for 3.5 seconds before starting next round
        setTimeout(() => {
            this.initiateNewRound();
        }, 3500);
    }

    // Player Actions
    placeBet(userId, position, amount, autoCashout, autoCashoutValue) {
        if (this.currentState !== this.STATE_WAITING) {
            return { success: false, error: 'Betting is closed for this round' };
        }

        const balance = this.getBalance(userId);
        const betAmount = Number(amount);
        if (isNaN(betAmount) || betAmount < 0.10 || betAmount > 100.00) {
            return { success: false, error: 'Invalid bet amount (range $0.10 - $100.00)' };
        }

        if (balance < betAmount) {
            return { success: false, error: 'Insufficient balance' };
        }

        const betKey = `${userId}_${position}`;
        if (this.activeBets.has(betKey)) {
            return { success: false, error: 'Bet already placed on this panel' };
        }

        // Deduct stake
        const newBalance = this.setBalance(userId, balance - betAmount);

        const betObj = {
            userId,
            position,
            amount: betAmount,
            autoCashout: Boolean(autoCashout),
            autoCashoutValue: autoCashout ? Number(autoCashoutValue) : 0,
            cashedOut: false,
            win: 0
        };

        this.activeBets.set(betKey, betObj);

        // Notify client
        return {
            success: true,
            balance: newBalance,
            bet: betObj
        };
    }

    cancelBet(userId, position) {
        if (this.currentState !== this.STATE_WAITING) {
            return { success: false, error: 'Cannot cancel after takeoff' };
        }

        const betKey = `${userId}_${position}`;
        const bet = this.activeBets.get(betKey);
        if (!bet) {
            return { success: false, error: 'No active bet found' };
        }

        // Refund stake
        const currentBalance = this.getBalance(userId);
        const newBalance = this.setBalance(userId, currentBalance + bet.amount);
        this.activeBets.delete(betKey);

        return {
            success: true,
            balance: newBalance,
            position
        };
    }

    executeCashout(userId, position, forcedMultiplier = null) {
        if (this.currentState !== this.STATE_FLYING) {
            return { success: false, error: 'Not in flight' };
        }

        const betKey = `${userId}_${position}`;
        const bet = this.activeBets.get(betKey);
        if (!bet || bet.cashedOut) {
            return { success: false, error: 'No uncashed bet on this panel' };
        }

        const cashoutMult = forcedMultiplier || this.currentMultiplier;
        const wonAmount = Number((bet.amount * cashoutMult).toFixed(2));

        bet.cashedOut = true;
        bet.cashoutMult = cashoutMult;
        bet.win = wonAmount;

        const currentBalance = this.getBalance(userId);
        const newBalance = this.setBalance(userId, currentBalance + wonAmount);
        this.roundTotalWin += wonAmount;

        // Broadcast player cashout (triggers parachute ejection on stage)
        this.broadcast({
            type: 'PLAYER_CASHOUT',
            player: 'You',
            bet: bet.amount,
            multiplier: cashoutMult,
            win: wonAmount,
            userId,
            position,
            newBalance
        });

        return {
            success: true,
            multiplier: cashoutMult,
            win: wonAmount,
            balance: newBalance,
            position
        };
    }
}

module.exports = GameEngine;
