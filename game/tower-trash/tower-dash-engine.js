/**
 * Tower Dash - Client-Side Game Engine & Socket Adapter
 * Provides high-speed offline/online gameplay for GitHub Pages & Telegram Mini App,
 * directly synchronized with window.HabeshaWallet.
 */
(function (global) {
  'use strict';

  const GAME_CONFIG = {
    betConfig: {
      minBetAmount: '1.00',
      maxBetAmount: '10000.00',
      maxWinAmount: '100000.00',
      betPresets: ['1', '2', '5', '10', '20', '50', '100', '200'],
      decimalPlaces: '2',
      currency: 'ETB'
    },
    coefficients: {
      EASY: [
        '1.01', '1.04', '1.09', '1.15', '1.21', '1.28', '1.36', '1.45', '1.55', '1.66',
        '1.78', '1.93', '2.08', '2.26', '2.47', '2.7', '2.96', '3.25', '3.59', '3.98',
        '4.42', '4.93', '5.51', '6.19', '6.97', '7.87', '8.93', '10.16', '11.6', '13.29',
        '15.27', '17.61', '20.39', '23.68', '27.6', '32.28', '37.89', '44.63', '52.75', '62.58'
      ],
      MEDIUM: [
        '1.02', '1.09', '1.18', '1.29', '1.42', '1.58', '1.77', '2', '2.29', '2.64',
        '3.07', '3.6', '4.27', '5.11', '6.17', '7.52', '9.27', '11.53', '14.48', '18.38',
        '23.56', '30.52', '39.95', '52.85', '70.66', '95.48', '130.44', '180.17', '251.64', '355.42',
        '507.75', '733.74', '1072.73', '1586.88', '2375.57', '3599.35', '5520.48', '8572.18'
      ],
      HARD: [
        '1.04', '1.14', '1.28', '1.45', '1.66', '1.93', '2.28', '2.72', '3.31', '4.07',
        '5.09', '6.47', '8.33', '10.91', '14.51', '19.61', '26.93', '37.62', '53.44', '77.23',
        '113.57', '170.02', '259.18', '402.45', '636.79', '1027.09', '1689.29', '2834.38', '4853.4', '8484.97',
        '15151.73', '27649.15', '51584.23', '98443.2', '192271.88'
      ]
    },
    bonusBuyMultiplierMap: {
      'three-lives': 50,
      'build-your-city': 100
    },
    buildYourCityFreeSpins: {
      '9': 0.045, '10': 0.166, '11': 0.32, '12': 0.249, '13': 0.165, '14': 0.048, '15': 0.007
    }
  };

  let activeGame = null;

  function getBal() {
    if (global.HabeshaWallet) {
      return global.HabeshaWallet.get();
    }
    const raw = localStorage.getItem('tower_balance') || localStorage.getItem('habesha_balance');
    return raw ? parseFloat(raw) || 200.0 : 200.0;
  }

  function setBal(val) {
    const safe = Math.max(0, Math.round(val * 100) / 100);
    if (global.HabeshaWallet) {
      global.HabeshaWallet.set(safe);
    } else {
      localStorage.setItem('tower_balance', safe.toFixed(2));
      localStorage.setItem('habesha_balance', safe.toFixed(2));
    }
    return safe;
  }

  function createTowerDashMockSocket() {
    const handlers = {};

    const mock = {
      connected: true,
      on(event, fn) {
        handlers[event] = handlers[event] || [];
        handlers[event].push(fn);
        if (event === 'connect') {
          setTimeout(() => fn(), 10);
        } else if (event === 'balance') {
          setTimeout(() => fn({ balance: getBal().toFixed(2), currency: 'ETB' }), 20);
        }
        return mock;
      },
      emit(event, data) {
        if (handlers[event]) {
          handlers[event].forEach(fn => {
            try { fn(data); } catch (e) { console.error('Socket handler error:', e); }
          });
        }
      },
      disconnect() { mock.connected = false; },
      close() { mock.connected = false; },
      async emitWithAck(event, data) {
        if (event === 'gameService-get-my-bets-history') {
          return [[]];
        }
        if (event === 'gameService') {
          const { action, payload } = data || {};
          switch (action) {
            case 'get-game-config':
              return [GAME_CONFIG];

            case 'get-game-state':
              if (activeGame && !activeGame.isFinished) {
                return [{
                  isFinished: false,
                  coeff: activeGame.coeff,
                  winAmount: activeGame.winAmount,
                  difficulty: activeGame.difficulty,
                  currentStep: activeGame.currentStep,
                  maxSteps: activeGame.maxSteps,
                  betAmount: activeGame.betAmount,
                  currency: activeGame.currency,
                  attemptsRemaining: activeGame.attemptsRemaining
                }];
              }
              return [null];

            case 'bet': {
              const betAmt = parseFloat(payload.betAmount || 2.0);
              const difficulty = payload.difficulty || 'EASY';
              const bonusType = payload.bonusType;
              let cost = betAmt;
              if (bonusType === 'three-lives') cost *= 50;
              else if (bonusType === 'build-your-city') cost *= 100;

              const curBal = getBal();
              if (curBal < cost) {
                return { error: { message: 'Insufficient balance' } };
              }

              const updatedBal = setBal(curBal - cost);
              mock.emit('balance', { balance: updatedBal.toFixed(2), currency: 'ETB' });

              const coeffs = GAME_CONFIG.coefficients[difficulty] || GAME_CONFIG.coefficients.EASY;
              activeGame = {
                betAmount: betAmt.toFixed(2),
                currency: 'ETB',
                difficulty,
                currentStep: 0,
                maxSteps: coeffs.length,
                coeff: '1.00',
                winAmount: '0.00',
                isFinished: false,
                bonusType,
                attemptsRemaining: bonusType === 'three-lives' ? 3 : undefined
              };

              return [{
                isFinished: false,
                coeff: activeGame.coeff,
                winAmount: activeGame.winAmount,
                difficulty: activeGame.difficulty,
                currentStep: 0,
                maxSteps: activeGame.maxSteps,
                betAmount: activeGame.betAmount,
                currency: 'ETB',
                attemptsRemaining: activeGame.attemptsRemaining
              }];
            }

            case 'step': {
              if (!activeGame || activeGame.isFinished) {
                return [{ isFinished: true, failed: true, winAmount: '0.00' }];
              }
              const requestedStep = payload.step;
              const coeffs = GAME_CONFIG.coefficients[activeGame.difficulty] || GAME_CONFIG.coefficients.EASY;
              const prevCoeff = activeGame.currentStep === 0 ? 1.0 : parseFloat(coeffs[activeGame.currentStep - 1]);
              const nextCoeff = parseFloat(coeffs[activeGame.currentStep]);

              // 90% RTP dynamic balancing
              const stepRtp = Math.pow(0.90, 1 / activeGame.maxSteps);
              const winProb = (prevCoeff / nextCoeff) * stepRtp;
              const success = Math.random() < winProb;

              const blockTypes = ['wood_cabin', 'brick_house', 'lego_block', 'jail_cell', 'bank_columns', 'clock_tower'];
              const blockType = blockTypes[(requestedStep - 1) % blockTypes.length];

              if (success) {
                activeGame.currentStep = requestedStep;
                activeGame.coeff = nextCoeff.toString();
                activeGame.winAmount = (parseFloat(activeGame.betAmount) * nextCoeff).toFixed(2);

                if (activeGame.currentStep === activeGame.maxSteps) {
                  activeGame.isFinished = true;
                  const winNum = parseFloat(activeGame.winAmount);
                  const newB = setBal(getBal() + winNum);
                  mock.emit('balance', { balance: newB.toFixed(2), currency: 'ETB' });
                }

                return [{
                  isFinished: activeGame.isFinished,
                  coeff: activeGame.coeff,
                  winAmount: activeGame.winAmount,
                  currentStep: activeGame.currentStep,
                  maxSteps: activeGame.maxSteps,
                  blockType,
                  failed: false,
                  attemptLost: false,
                  attemptsRemaining: activeGame.attemptsRemaining
                }];
              } else {
                if (activeGame.bonusType === 'three-lives' && (activeGame.attemptsRemaining || 0) > 1) {
                  activeGame.attemptsRemaining = (activeGame.attemptsRemaining || 1) - 1;
                  return [{
                    isFinished: false,
                    coeff: activeGame.coeff,
                    winAmount: activeGame.winAmount,
                    currentStep: activeGame.currentStep,
                    maxSteps: activeGame.maxSteps,
                    blockType,
                    failed: false,
                    attemptLost: true,
                    attemptsRemaining: activeGame.attemptsRemaining
                  }];
                }
                activeGame.isFinished = true;
                activeGame.winAmount = '0.00';
                activeGame.coeff = '0';
                return [{
                  isFinished: true,
                  coeff: '0',
                  winAmount: '0.00',
                  currentStep: activeGame.currentStep,
                  maxSteps: activeGame.maxSteps,
                  blockType,
                  failed: true,
                  attemptLost: false,
                  attemptsRemaining: activeGame.attemptsRemaining
                }];
              }
            }

            case 'withdraw': {
              if (!activeGame || activeGame.currentStep === 0) {
                return { error: { message: 'Cannot cash out before placing at least 1 floor' } };
              }
              activeGame.isFinished = true;
              const winNum = parseFloat(activeGame.winAmount);
              const newBal = setBal(getBal() + winNum);
              mock.emit('balance', { balance: newBal.toFixed(2), currency: 'ETB' });
              return [{
                isFinished: true,
                winAmount: activeGame.winAmount,
                coeff: activeGame.coeff,
                currentStep: activeGame.currentStep
              }];
            }

            case 'get-game-seeds':
              return [{
                serverSeedHash: 'seed_' + Math.random().toString(36).substring(2),
                clientSeed: 'seed_' + Math.random().toString(36).substring(2),
                nonce: 1
              }];
          }
        }
        return [null];
      }
    };

    // Listen to external balance updates (e.g. from HabeshaWallet)
    if (global.addEventListener) {
      global.addEventListener('habesha_balance_updated', (e) => {
        const bal = e.detail?.balance ?? getBal();
        mock.emit('balance', { balance: Number(bal).toFixed(2), currency: 'ETB' });
      });
    }

    return mock;
  }

  global.__createTowerDashMockSocket = createTowerDashMockSocket;
})(typeof window !== 'undefined' ? window : globalThis);
