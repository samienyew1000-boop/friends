/**
 * JetX Realtime Client with Embedded Game Engine & HabeshaWallet Sync - Multi-Device Synchronized Edition
 * Provides 100% synchronized deterministic multiplayer gameplay matching across all phones and devices.
 */

// --- Global Clock Synchronization Engine ---
let jetxTimeOffset = 0;
async function syncJetXTime() {
    try {
        const t0 = Date.now();
        const resp = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
        const t1 = Date.now();
        const sDate = resp.headers.get('Date');
        if (sDate) {
            const serverMs = new Date(sDate).getTime();
            jetxTimeOffset = Math.round(serverMs - (t0 + t1) / 2);
        }
    } catch (e) {
        jetxTimeOffset = 0;
    }
}
function getJetXSyncedNow() {
    return Date.now() + jetxTimeOffset;
}
setInterval(syncJetXTime, 180000); // Re-sync every 3 minutes

// --- Seeded Deterministic Math Engine ---
function jetxMulberry32(a) {
    return function() {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        var t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function jetxStringToSeed(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return hash;
}

function getJetXRoundData(roundIndex) {
    const seed = jetxStringToSeed("jetx_sync_master_v1_" + roundIndex);
    const rng = jetxMulberry32(seed);
    const houseEdge = (window.HabeshaWallet && typeof window.HabeshaWallet.getGameMargin === 'function')
        ? (window.HabeshaWallet.getGameMargin('jet_x', 3.0) / 100)
        : 0.03;
    const r1 = rng();
    let mult;
    if (r1 < houseEdge) {
        mult = 1.00;
    } else {
        const r2 = rng();
        const raw = (1 - houseEdge) / (1 - r2);
        mult = Math.max(1.00, Math.min(25000.00, Math.floor(raw * 100) / 100));
    }
    const flightSec = mult <= 1.00 ? 0 : Math.log(mult) / 0.065;
    const flightMs = Math.round(flightSec * 1000);
    const takeoffMs = 800;
    const waitMs = 5000;
    const boomMs = 3500;
    const totalMs = waitMs + takeoffMs + flightMs + boomMs;
    return { roundIndex, mult, waitMs, takeoffMs, flightMs, boomMs, totalMs };
}

const JETX_CHECKPOINTS = [
    [1,1794355200000],[25489,1794960011093],[50983,1795564802223],[76483,1796169606007],
    [102056,1796774420356],[127535,1797379208857],[152999,1797984014551],[178554,1798588807458],
    [204023,1799193600160],[229670,1799798408742],[255234,1800403201203],[280679,1801008051006],
    [306243,1801612810063],[331641,1802217604942],[357019,1802822411847],[382383,1803427203877],
    [407951,1804032012855],[433454,1804636824630],[458852,1805241629832],[484438,1805846413118],
    [509856,1806451206174],[535461,1807056000694],[561026,1807660818023],[586458,1808265600619],
    [611791,1808870417395],[637389,1809475206414],[662872,1810080005454],[688378,1810684807723],
    [713842,1811289600451],[739251,1811894404678],[764582,1812499206451],[789946,1813104006335],
    [815539,1813708826439],[841026,1814313648253],[866551,1814918420097],[892302,1815523210510],
    [917707,1816128008094],[943353,1816732814423],[968655,1817337623935],[994044,1817942443600],
    [1019516,1818547216724],[1044998,1819152008910],[1070515,1819756808050],[1096158,1820361614435],
    [1121571,1820966416186],[1147089,1821571205284],[1172532,1822176045345],[1197811,1822780820659],
    [1223219,1823385608155],[1248737,1823990414166],[1274112,1824595202717],[1299563,1825200014007],
    [1325061,1825804818264]
];

function findJetXRound(syncedNow) {
    let cpIndex = 0;
    for (let i = JETX_CHECKPOINTS.length - 1; i >= 0; i--) {
        if (syncedNow >= JETX_CHECKPOINTS[i][1]) {
            cpIndex = i;
            break;
        }
    }
    let roundIdx = JETX_CHECKPOINTS[cpIndex][0];
    let currTime = JETX_CHECKPOINTS[cpIndex][1];

    while (true) {
        const rData = getJetXRoundData(roundIdx);
        if (currTime + rData.totalMs > syncedNow) {
            const elapsedInRound = syncedNow - currTime;
            let phase = 'WAITING_FOR_BETS';
            let multiplier = 1.00;
            let countdown = 0;

            if (elapsedInRound < rData.waitMs) {
                phase = 'WAITING_FOR_BETS';
                countdown = (rData.waitMs - elapsedInRound) / 1000;
            } else if (elapsedInRound < rData.waitMs + rData.takeoffMs) {
                phase = 'TAKEOFF';
                multiplier = 1.00;
            } else if (elapsedInRound < rData.waitMs + rData.takeoffMs + rData.flightMs) {
                phase = 'IN_FLIGHT';
                const flightElapsed = (elapsedInRound - (rData.waitMs + rData.takeoffMs)) / 1000;
                multiplier = Math.min(rData.mult, Number((Math.pow(Math.E, 0.065 * flightElapsed)).toFixed(2)));
            } else {
                phase = 'CRASHED';
                multiplier = rData.mult;
            }

            return {
                roundIndex: roundIdx,
                roundStartTime: currTime,
                data: rData,
                elapsedInRound,
                phase,
                multiplier: Number(multiplier.toFixed(2)),
                countdown: Number(countdown.toFixed(1))
            };
        }
        currTime += rData.totalMs;
        roundIdx++;
    }
}

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
        this.flightStep = 0;
        this.countdownRemaining = 5.0;

        this.activeBets = new Map(); // pos => betObj
        this.queuedBets = new Map(); // pos => queuedBetObj for next round
        this.onlinePlayerCount = 1240;
        this.simulatedBets = [];
        this.roundTotalWin = 0;
        this.last100Spins = [];
        this.topWins = this.generateInitialTopWins();

        this.lastRecordedBoomRound = 0;
        this.loopInterval = null;
    }

    generateInitialHistory(currentRoundId) {
        const history = [];
        for (let i = 1; i <= 60; i++) {
            const pastId = currentRoundId - i;
            if (pastId > 0) {
                const r = getJetXRoundData(pastId);
                history.push({
                    roundId: pastId,
                    multiplier: r.mult,
                    hash: `000000000000${Math.abs(jetxStringToSeed('hash_' + pastId)).toString(16).padEnd(12, '0').substring(0, 12)}`,
                    time: new Date(getJetXSyncedNow() - (i * 20000)).toISOString()
                });
            }
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

    generateSimulatedBets(roundIndex) {
        const rng = jetxMulberry32(jetxStringToSeed("jetx_sim_bets_" + roundIndex));
        const names = ['Abebe', 'Tadesse', 'Helen', 'Solomon', 'D••••7', 'D••••2', 'D••••4', 'D••••9', 'D••••8', 'D••••3', 'D••••0', 'D••••5'];
        const stakes = [5, 10, 20, 50, 100, 200];
        const count = 35 + Math.floor(rng() * 25);
        this.simulatedBets = [];
        for (let i = 0; i < count; i++) {
            this.simulatedBets.push({
                id: `sim_${i}`,
                player: names[Math.floor(rng() * names.length)],
                avatar: Math.floor(rng() * 24),
                bet: stakes[Math.floor(rng() * stakes.length)],
                targetMult: Number((1.10 + rng() * 6.0).toFixed(2)),
                cashedOut: false,
                win: 0,
                cashoutMult: null
            });
        }
    }

    async start() {
        if (this.loopInterval) clearInterval(this.loopInterval);
        await syncJetXTime();

        const initialRound = findJetXRound(getJetXSyncedNow());
        this.currentRoundId = initialRound.roundIndex;
        this.targetCrashMultiplier = initialRound.data.mult;
        this.last100Spins = this.generateInitialHistory(this.currentRoundId);
        this.generateSimulatedBets(this.currentRoundId);

        setTimeout(() => {
            this.client.emit('INIT_STATE', {
                type: 'INIT_STATE',
                state: initialRound.phase,
                roundId: this.currentRoundId,
                countdown: initialRound.countdown,
                multiplier: initialRound.multiplier,
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

        this.tick();
        this.loopInterval = setInterval(() => {
            this.tick();
        }, 40);
    }

    tick() {
        const syncedNow = getJetXSyncedNow();
        const round = findJetXRound(syncedNow);

        // 1. Detect Round Change
        if (this.currentRoundId !== round.roundIndex) {
            this.currentRoundId = round.roundIndex;
            this.targetCrashMultiplier = round.data.mult;
            this.flightStep = 0;
            this.roundTotalWin = 0;
            this.generateSimulatedBets(round.roundIndex);

            // Promote queued bets to active bets
            this.activeBets.clear();
            for (const [pos, bet] of this.queuedBets.entries()) {
                this.activeBets.set(pos, { ...bet, isQueued: false });
            }
            this.queuedBets.clear();
        }

        // 2. Handle Phase
        if (round.phase === 'WAITING_FOR_BETS') {
            this.countdownRemaining = round.countdown;
            this.currentMultiplier = 1.00;
            if (this.currentState !== this.STATE_WAITING) {
                this.currentState = this.STATE_WAITING;
                this.client.emit('ROUND_START', {
                    type: 'ROUND_START',
                    roundId: this.currentRoundId,
                    countdown: this.countdownRemaining,
                    onlinePlayers: this.onlinePlayerCount,
                    simulatedBets: this.simulatedBets.slice(0, 50)
                });
            }
        } else if (round.phase === 'TAKEOFF') {
            this.currentMultiplier = 1.00;
            if (this.currentState !== this.STATE_TAKEOFF) {
                this.currentState = this.STATE_TAKEOFF;
                this.client.emit('TAKEOFF', {
                    type: 'TAKEOFF',
                    roundId: this.currentRoundId
                });
            }
        } else if (round.phase === 'IN_FLIGHT') {
            this.currentState = this.STATE_FLYING;
            this.flightStep++;
            this.currentMultiplier = round.multiplier;
            const nextMult = Number((round.multiplier + 0.05).toFixed(2));

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
        } else if (round.phase === 'CRASHED') {
            if (this.currentState !== this.STATE_CRASHED) {
                this.currentState = this.STATE_CRASHED;
                const finalCrash = round.data.mult;
                this.currentMultiplier = finalCrash;

                for (const [pos, bet] of this.activeBets.entries()) {
                    if (!bet.cashedOut) {
                        bet.lost = true;
                    }
                }

                if (this.lastRecordedBoomRound !== round.roundIndex) {
                    this.lastRecordedBoomRound = round.roundIndex;
                    const roundRecord = {
                        roundId: this.currentRoundId,
                        multiplier: finalCrash,
                        hash: `000000000000${Math.abs(jetxStringToSeed('hash_' + round.roundIndex)).toString(16).padEnd(12, '0').substring(0, 12)}`,
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
                }
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

    placeBet(position, amount, autoCashout, autoCashoutValue) {
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

        if (this.activeBets.has(position) || this.queuedBets.has(position)) {
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

        const isQueued = (this.currentState !== this.STATE_WAITING);

        const betObj = {
            position,
            amount: betAmount,
            autoCashout: Boolean(autoCashout),
            autoCashoutValue: autoCashout ? Number(autoCashoutValue) : 0,
            cashedOut: false,
            win: 0,
            isQueued
        };

        if (isQueued) {
            this.queuedBets.set(position, betObj);
        } else {
            this.activeBets.set(position, betObj);
        }

        this.client.emit('BET_RESPONSE', {
            success: true,
            balance: newBal,
            bet: betObj
        });
    }

    cancelBet(position) {
        let bet = null;
        let wasQueued = false;

        if (this.queuedBets.has(position)) {
            bet = this.queuedBets.get(position);
            wasQueued = true;
            this.queuedBets.delete(position);
        } else if (this.activeBets.has(position)) {
            if (this.currentState !== this.STATE_WAITING) {
                this.client.emit('CANCEL_RESPONSE', { success: false, error: 'አውሮፕላኑ ከተነሳ በኋላ መሰረዝ አይቻልም' });
                return;
            }
            bet = this.activeBets.get(position);
            this.activeBets.delete(position);
        }

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
