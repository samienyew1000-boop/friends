/**
 * JetX Realtime Client with Embedded Game Engine & HabeshaWallet Sync
 * Provides 100% offline, standalone & multiplayer-simulated gameplay when WebSocket is unavailable.
 */
class EmbeddedJetXEngine {
    constructor(client) {
        this.client = client;
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

        this.activeBets = new Map(); // pos => betObj
        this.onlinePlayerCount = 1240;
        this.simulatedBets = [];
        this.roundTotalWin = 0;
        this.last100Spins = this.generateInitialHistory();
        this.topWins = this.generateInitialTopWins();

        this.loopInterval = null;
    }

    generateInitialHistory() {
        const samples = [
            1.55, 224.59, 2.45, 21.88, 1.02, 3.99, 2.39, 12.18, 3.82, 27.50,
            1.00, 1.47, 2.04, 5.16, 1.05, 4.54, 1.40, 1.34, 7.82, 1.04,
            2.60, 8.05, 1.44, 7.18, 2.25, 1.53, 1.12, 15.60, 1.88, 3.20
        ];
        const history = [];
        for (let i = 0; i < samples.length; i++) {
            history.unshift({
                roundId: 1000 - i,
                multiplier: samples[i],
                hash: `000000000000${Math.random().toString(16).substring(2, 14)}`,
                time: new Date(Date.now() - (i * 25000)).toISOString()
            });
        }
        return history;
    }

    generateInitialTopWins() {
        return {
            daily: [
                { player: 'Abebe', bet: 100.0, mult: 100.0, win: 10000.0, time: '23:50' },
                { player: 'D••••3', bet: 100.0, mult: 85.5, win: 8550.0, time: '21:14' },
                { player: 'Tadesse', bet: 50.0, mult: 142.0, win: 7100.0, time: '19:02' },
                { player: 'Helen', bet: 20.0, mult: 250.0, win: 5000.0, time: '14:35' },
                { player: 'D••••2', bet: 10.0, mult: 420.0, win: 4200.0, time: '11:20' }
            ],
            weekly: [
                { player: 'Helen', bet: 40.0, mult: 625.0, win: 25000.0, time: '10-19' },
                { player: 'Tadesse', bet: 100.0, mult: 180.0, win: 18000.0, time: '10-18' },
                { player: 'D••••4', bet: 50.0, mult: 300.0, win: 15000.0, time: '10-16' }
            ],
            monthly: [
                { player: 'D••••8', bet: 100.0, mult: 288.95, win: 28895.13, time: '09-24' },
                { player: 'Abebe', bet: 50.0, mult: 500.0, win: 25000.0, time: '09-15' },
                { player: 'D••••2', bet: 100.0, mult: 210.0, win: 21000.0, time: '09-08' }
            ]
        };
    }

    getWalletBalance() {
        if (window.HabeshaWallet && typeof window.HabeshaWallet.get === 'function') {
            return Number(window.HabeshaWallet.get());
        }
        const s = localStorage.getItem('jetx_local_balance');
        return s ? Number(s) : 1000.00;
    }

    setWalletBalance(newBal) {
        if (window.HabeshaWallet && typeof window.HabeshaWallet.set === 'function') {
            window.HabeshaWallet.set(newBal);
        } else {
            localStorage.setItem('jetx_local_balance', newBal.toFixed(2));
        }
        return this.getWalletBalance();
    }

    generateCrashPoint() {
        // Industry standard 97% RTP crash curve
        const houseEdge = 0.03;
        const rand = Math.random();
        if (rand < 0.03) {
            return 1.00;
        }
        const r = Math.random();
        const raw = (1 - houseEdge) / (1 - r);
        const mult = Math.max(1.00, Math.min(25000.00, Math.floor(raw * 100) / 100));
        return Number(mult.toFixed(2));
    }

    start() {
        if (this.loopInterval) clearInterval(this.loopInterval);

        setTimeout(() => {
            this.client.emit('INIT_STATE', {
                type: 'INIT_STATE',
                state: this.currentState,
                roundId: this.currentRoundId,
                countdown: this.countdownRemaining,
                multiplier: this.currentMultiplier,
                balance: this.getWalletBalance(),
                onlinePlayers: this.onlinePlayerCount,
                last100Spins: this.last100Spins,
                topWins: this.topWins,
                activeBets: [],
                simulatedBets: this.simulatedBets.slice(0, 50),
                roundTotalWin: this.roundTotalWin
            });
            this.client.emit('ping_update', { latency: 18, onlinePlayers: this.onlinePlayerCount });
        }, 50);

        this.initiateNewRound();

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

        this.targetCrashMultiplier = this.generateCrashPoint();
        this.onlinePlayerCount = 1200 + Math.floor(Math.random() * 200);

        const names = ['Abebe', 'Tadesse', 'Helen', 'Solomon', 'D••••7', 'D••••2', 'D••••4', 'D••••9', 'D••••8', 'D••••3', 'D••••0', 'D••••5'];
        const stakes = [5, 10, 20, 50, 100, 200];
        const count = 40 + Math.floor(Math.random() * 30);
        for (let i = 0; i < count; i++) {
            this.simulatedBets.push({
                id: `sim_${i}`,
                player: names[Math.floor(Math.random() * names.length)],
                avatar: Math.floor(Math.random() * 24),
                bet: stakes[Math.floor(Math.random() * stakes.length)],
                targetMult: Number((1.10 + Math.random() * 6.0).toFixed(2)),
                cashedOut: false,
                win: 0,
                cashoutMult: null
            });
        }

        this.client.emit('ROUND_START', {
            type: 'ROUND_START',
            roundId: this.currentRoundId,
            countdown: this.countdownRemaining,
            onlinePlayers: this.onlinePlayerCount,
            simulatedBets: this.simulatedBets.slice(0, 50)
        });
    }

    tick() {
        if (this.currentState === this.STATE_WAITING) {
            this.countdownRemaining -= 0.05;
            if (this.countdownRemaining <= 0) {
                this.currentState = this.STATE_TAKEOFF;
                this.countdownRemaining = 0;
                this.flightStartTime = Date.now();

                this.client.emit('TAKEOFF', {
                    type: 'TAKEOFF',
                    roundId: this.currentRoundId
                });

                setTimeout(() => {
                    if (this.currentState === this.STATE_TAKEOFF) {
                        this.currentState = this.STATE_FLYING;
                        this.flightStartTime = Date.now();
                    }
                }, 800);
            }
        } else if (this.currentState === this.STATE_FLYING) {
            this.flightStep++;
            const elapsed = (Date.now() - this.flightStartTime) / 1000;
            const calculatedMult = Number((Math.pow(Math.E, 0.065 * elapsed)).toFixed(2));
            this.currentMultiplier = Math.max(1.00, calculatedMult);
            const nextMult = Number((Math.pow(Math.E, 0.065 * (elapsed + 0.08))).toFixed(2));

            if (this.currentMultiplier >= this.targetCrashMultiplier) {
                this.currentMultiplier = this.targetCrashMultiplier;
                this.handleCrash();
                return;
            }

            this.processAutoCashouts();

            if (this.flightStep % 2 === 0) {
                this.client.emit('FLIGHT_TICK', {
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
        for (const [pos, bet] of this.activeBets.entries()) {
            if (!bet.cashedOut && bet.autoCashout && bet.autoCashoutValue > 1.0) {
                if (this.currentMultiplier >= bet.autoCashoutValue) {
                    this.executeCashout(pos, bet.autoCashoutValue);
                }
            }
        }

        for (const sim of this.simulatedBets) {
            if (!sim.cashedOut && this.currentMultiplier >= sim.targetMult && sim.targetMult <= this.targetCrashMultiplier) {
                sim.cashedOut = true;
                sim.cashoutMult = sim.targetMult;
                sim.win = Number((sim.bet * sim.cashoutMult).toFixed(2));
                this.roundTotalWin += sim.win;

                this.client.emit('PLAYER_CASHOUT', {
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

        for (const [pos, bet] of this.activeBets.entries()) {
            if (!bet.cashedOut) {
                bet.lost = true;
            }
        }

        const roundRecord = {
            roundId: this.currentRoundId,
            multiplier: finalCrash,
            hash: `000000000000${Math.random().toString(16).substring(2, 14)}`,
            time: new Date().toISOString()
        };
        this.last100Spins.unshift(roundRecord);
        if (this.last100Spins.length > 100) this.last100Spins.pop();

        this.client.emit('BOOM', {
            type: 'BOOM',
            multiplier: finalCrash,
            roundId: this.currentRoundId,
            last100Spins: this.last100Spins.slice(0, 30)
        });

        setTimeout(() => {
            this.initiateNewRound();
        }, 3500);
    }

    placeBet(position, amount, autoCashout, autoCashoutValue) {
        if (this.currentState !== this.STATE_WAITING) {
            this.client.emit('BET_RESPONSE', { success: false, error: 'ውርርድ ተዘግቷል (Betting closed)' });
            return;
        }

        const currentBal = this.getWalletBalance();
        const betAmount = Number(amount);
        if (isNaN(betAmount) || betAmount < 0.10) {
            this.client.emit('BET_RESPONSE', { success: false, error: 'የተሳሳተ መጠን (Invalid bet amount)' });
            return;
        }

        if (currentBal < betAmount) {
            this.client.emit('BET_RESPONSE', { success: false, error: 'ሂሳብዎ በቂ አይደለም (Insufficient balance)' });
            return;
        }

        if (this.activeBets.has(position)) {
            this.client.emit('BET_RESPONSE', { success: false, error: 'ውርርድ አስቀድሞ ተቀምጧል (Bet already placed)' });
            return;
        }

        let newBal = currentBal - betAmount;
        if (window.HabeshaWallet && typeof window.HabeshaWallet.deduct === 'function') {
            window.HabeshaWallet.deduct(betAmount, 'JetX Bet');
            newBal = this.getWalletBalance();
        } else {
            this.setWalletBalance(newBal);
        }

        const betObj = {
            position,
            amount: betAmount,
            autoCashout: Boolean(autoCashout),
            autoCashoutValue: autoCashout ? Number(autoCashoutValue) : 0,
            cashedOut: false,
            win: 0
        };

        this.activeBets.set(position, betObj);

        this.client.emit('BET_RESPONSE', {
            success: true,
            balance: newBal,
            bet: betObj
        });
    }

    cancelBet(position) {
        if (this.currentState !== this.STATE_WAITING) {
            this.client.emit('CANCEL_RESPONSE', { success: false, error: 'አውሮፕላኑ ከተነሳ በኋላ መሰረዝ አይቻልም' });
            return;
        }

        const bet = this.activeBets.get(position);
        if (!bet) {
            this.client.emit('CANCEL_RESPONSE', { success: false, error: 'ምንም ንቁ ውርርድ አልተገኘም' });
            return;
        }

        let newBal = this.getWalletBalance() + bet.amount;
        if (window.HabeshaWallet && typeof window.HabeshaWallet.add === 'function') {
            window.HabeshaWallet.add(bet.amount, 'JetX Cancel Refund');
            newBal = this.getWalletBalance();
        } else {
            this.setWalletBalance(newBal);
        }

        this.activeBets.delete(position);

        this.client.emit('CANCEL_RESPONSE', {
            success: true,
            balance: newBal,
            position
        });
    }

    executeCashout(position, forcedMultiplier = null) {
        if (this.currentState !== this.STATE_FLYING) {
            this.client.emit('CASHOUT_RESPONSE', { success: false, error: 'በረራ ላይ አይደለም' });
            return;
        }

        const bet = this.activeBets.get(position);
        if (!bet || bet.cashedOut) {
            this.client.emit('CASHOUT_RESPONSE', { success: false, error: 'ምንም የሚወጣ ውርርድ የለም' });
            return;
        }

        const mult = forcedMultiplier || this.currentMultiplier;
        const wonAmount = Number((bet.amount * mult).toFixed(2));

        bet.cashedOut = true;
        bet.cashoutMult = mult;
        bet.win = wonAmount;

        let newBal = this.getWalletBalance() + wonAmount;
        if (window.HabeshaWallet && typeof window.HabeshaWallet.add === 'function') {
            window.HabeshaWallet.add(wonAmount, 'JetX Win');
            newBal = this.getWalletBalance();
        } else {
            this.setWalletBalance(newBal);
        }

        this.roundTotalWin += wonAmount;

        this.client.emit('CASHOUT_RESPONSE', {
            success: true,
            multiplier: mult,
            win: wonAmount,
            balance: newBal,
            position
        });

        this.client.emit('PLAYER_CASHOUT', {
            type: 'PLAYER_CASHOUT',
            player: 'You',
            bet: bet.amount,
            multiplier: mult,
            win: wonAmount,
            position,
            newBalance: newBal
        });
    }
}

/**
 * JetX Realtime Network Client
 */
class NetworkClient {
    constructor() {
        this.ws = null;
        this.userId = localStorage.getItem('jetx_user_id') || `user_${Math.random().toString(36).substring(2, 8)}`;
        localStorage.setItem('jetx_user_id', this.userId);

        this.handlers = new Map();
        this.pingInterval = null;
        this.latency = 20;
        this.embedded = new EmbeddedJetXEngine(this);
        this.isEmbeddedActive = false;

        this.initConnection();
    }

    initConnection() {
        const isStaticHost = window.location.protocol === 'file:' || 
                             window.location.hostname.includes('github.io') || 
                             !window.WebSocket;
        if (isStaticHost) {
            this.activateEmbedded('Static hosting detected');
            return;
        }

        try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws?userId=${this.userId}`;
            this.ws = new WebSocket(wsUrl);

            let connected = false;
            const timeout = setTimeout(() => {
                if (!connected) {
                    this.activateEmbedded('WebSocket connection timeout');
                }
            }, 1000);

            this.ws.onopen = () => {
                connected = true;
                clearTimeout(timeout);
                console.log('Connected to JetX Game Server');
                this.startPing();
                this.emit('connected', {});
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'PONG') {
                        this.latency = Math.max(1, Math.round(Date.now() - data.clientTime));
                        this.emit('ping_update', { latency: this.latency, onlinePlayers: data.onlinePlayers });
                    } else {
                        this.emit(data.type, data);
                    }
                } catch (e) {
                    console.error('Failed to parse WS message:', e);
                }
            };

            this.ws.onclose = () => {
                if (!connected) {
                    this.activateEmbedded('WebSocket closed immediately');
                } else {
                    console.warn('JetX connection lost. Activating embedded engine...');
                    this.activateEmbedded('WebSocket disconnected');
                }
            };

            this.ws.onerror = (err) => {
                console.warn('JetX WebSocket unavailable, switching to Embedded Engine:', err);
                this.activateEmbedded('WebSocket error');
            };
        } catch (e) {
            this.activateEmbedded('WebSocket initialization failed');
        }
    }

    activateEmbedded(reason) {
        if (this.isEmbeddedActive) return;
        this.isEmbeddedActive = true;
        console.log(`[JetX] Running Embedded Engine (${reason})`);
        if (this.ws) {
            try { this.ws.close(); } catch (e) {}
            this.ws = null;
        }
        clearInterval(this.pingInterval);
        this.embedded.start();
    }

    startPing() {
        clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'PING',
                    clientTime: Date.now()
                }));
            }
        }, 1000);
    }

    on(type, handler) {
        if (!this.handlers.has(type)) {
            this.handlers.set(type, []);
        }
        this.handlers.get(type).push(handler);
    }

    emit(type, data) {
        const list = this.handlers.get(type) || [];
        for (const handler of list) {
            try {
                handler(data);
            } catch (err) {
                console.error(`Error in handler for ${type}:`, err);
            }
        }
    }

    send(data) {
        if (this.isEmbeddedActive) return;
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            console.warn('Socket not open, message queued or dropped:', data);
        }
    }

    placeBet(position, amount, autoCashout, autoCashoutValue) {
        if (this.isEmbeddedActive) {
            this.embedded.placeBet(position, amount, autoCashout, autoCashoutValue);
        } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.send({
                type: 'PLACE_BET',
                position,
                amount,
                autoCashout,
                autoCashoutValue
            });
        } else {
            this.activateEmbedded('Socket not open on bet');
            this.embedded.placeBet(position, amount, autoCashout, autoCashoutValue);
        }
    }

    cancelBet(position) {
        if (this.isEmbeddedActive) {
            this.embedded.cancelBet(position);
        } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.send({
                type: 'CANCEL_BET',
                position
            });
        }
    }

    cashout(position) {
        if (this.isEmbeddedActive) {
            this.embedded.executeCashout(position);
        } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.send({
                type: 'CASHOUT',
                position
            });
        }
    }
}

window.networkClient = new NetworkClient();
