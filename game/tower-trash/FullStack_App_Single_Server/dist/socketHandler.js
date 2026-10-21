"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSocketHandlers = setupSocketHandlers;
const config_1 = require("./config");
function setupSocketHandlers(io, engine) {
    io.on('connection', (socket) => {
        const query = socket.handshake.query;
        const userId = query.userId || socket.handshake.auth?.userId || `user_${socket.id.substring(0, 8)}`;
        const operatorId = query.operatorId || 'default-operator';
        const currency = query.currency || 'USD';
        // Helper to send formatted ack responses
        socket.on('gameService', async (data, callback) => {
            if (!data || typeof data !== 'object') {
                if (callback)
                    callback({ error: { message: 'Invalid payload format' } });
                return;
            }
            const { action, payload } = data;
            try {
                switch (action) {
                    case 'get-game-config': {
                        if (callback) {
                            callback([config_1.GAME_CONFIG]);
                        }
                        break;
                    }
                    case 'get-game-state': {
                        const active = engine.getActiveGame(userId);
                        if (callback) {
                            if (active) {
                                callback([{
                                        isFinished: active.isFinished,
                                        coeff: active.coeff,
                                        winAmount: active.winAmount,
                                        difficulty: active.difficulty,
                                        currentStep: active.currentStep,
                                        maxSteps: active.maxSteps,
                                        betAmount: active.betAmount,
                                        currency: active.currency,
                                        attemptsRemaining: active.attemptsRemaining
                                    }]);
                            }
                            else {
                                callback([null]);
                            }
                        }
                        break;
                    }
                    case 'bet': {
                        const betAmount = payload.betAmount || '2.00';
                        const difficulty = payload.difficulty || 'EASY';
                        const bonusType = payload.bonusType;
                        const game = engine.startBet(userId, betAmount, currency, difficulty, bonusType);
                        // Broadcast balance update
                        socket.emit('balance', { balance: engine.getBalance(userId).toFixed(2), currency });
                        if (callback) {
                            callback([{
                                    isFinished: false,
                                    coeff: game.coeff,
                                    winAmount: game.winAmount,
                                    difficulty: game.difficulty,
                                    currentStep: game.currentStep,
                                    maxSteps: game.maxSteps,
                                    betAmount: game.betAmount,
                                    currency: game.currency,
                                    attemptsRemaining: game.attemptsRemaining
                                }]);
                        }
                        break;
                    }
                    case 'step': {
                        const requestedStep = payload.step;
                        const result = engine.executeStep(userId, requestedStep);
                        if (result.game.isFinished && result.success) {
                            // Max floor reached and won
                            socket.emit('balance', { balance: engine.getBalance(userId).toFixed(2), currency });
                        }
                        if (callback) {
                            callback([{
                                    isFinished: result.game.isFinished,
                                    coeff: result.game.coeff,
                                    winAmount: result.game.winAmount,
                                    currentStep: result.game.currentStep,
                                    maxSteps: result.game.maxSteps,
                                    blockType: result.blockType,
                                    failed: !result.success && !result.attemptLost,
                                    attemptLost: result.attemptLost || false,
                                    attemptsRemaining: result.game.attemptsRemaining
                                }]);
                        }
                        break;
                    }
                    case 'withdraw': {
                        const game = engine.withdraw(userId);
                        const balance = engine.getBalance(userId);
                        socket.emit('balance', { balance: balance.toFixed(2), currency });
                        if (callback) {
                            callback([{
                                    isFinished: true,
                                    winAmount: game.winAmount,
                                    coeff: game.coeff,
                                    balance: balance.toFixed(2)
                                }]);
                        }
                        break;
                    }
                    case 'get-game-seeds': {
                        const clientSeed = engine.getClientSeed(userId);
                        const nonce = engine.getNonce(userId);
                        const active = engine.getActiveGame(userId);
                        if (callback) {
                            callback([{
                                    serverSeedHash: active ? active.serverSeedHash : 'none',
                                    clientSeed,
                                    nonce
                                }]);
                        }
                        break;
                    }
                    default:
                        if (callback) {
                            callback({ error: { message: `Unknown action: ${action}` } });
                        }
                }
            }
            catch (err) {
                if (callback) {
                    callback({ error: { message: err.message || 'Internal server error' } });
                }
            }
        });
        // Dedicated bet history handler
        socket.on('gameService-get-my-bets-history', (_data, callback) => {
            const history = engine.getHistory(userId);
            if (callback) {
                callback([history]);
            }
        });
        // Latency round-trip test
        socket.on('gameService-latencyTest', (data, callback) => {
            if (callback) {
                callback({ date: data?.date || Date.now() });
            }
        });
        // Send initial balance
        socket.emit('balance', {
            balance: engine.getBalance(userId).toFixed(2),
            currency
        });
    });
}
