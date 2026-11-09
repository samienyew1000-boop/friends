/**
 * JetX Main Application Controller
 */
document.addEventListener('DOMContentLoaded', () => {
    const flightCanvas = new FlightCanvas('flight-canvas');
    const net = window.networkClient;
    const sound = window.soundEngine;

    // DOM Elements
    const elements = {
        balanceAmount: document.getElementById('balance-amount'),
        multiplierHero: document.getElementById('multiplier-hero'),
        multiplierUnit: document.getElementById('multiplier-unit'),
        stageStatusBadge: document.getElementById('stage-status-badge'),
        stageBetsBadge: document.getElementById('stage-bets-badge'),
        countdownOverlay: document.getElementById('countdown-overlay'),
        countdownNumber: document.getElementById('countdown-number'),
        historyBar: document.getElementById('history-bar'),
        latencyIndicator: document.getElementById('latency-indicator'),
        onlinePlayersCount: document.getElementById('online-players-count'),
        roundBetsCount: document.getElementById('round-bets-count'),
        roundTotalWin: document.getElementById('round-total-win'),
        tableBody: document.getElementById('table-body'),
        fourModeToggleBtn: document.getElementById('four-mode-toggle'),
        betPanelsGrid: document.getElementById('bet-panels-grid'),
        historyModal: document.getElementById('history-modal'),
        rulesModal: document.getElementById('rules-modal'),
        historyGridBody: document.getElementById('history-grid-body'),
        muteBtn: document.getElementById('mute-btn'),
        fullscreenBtn: document.getElementById('fullscreen-btn')
    };

    // State
    let userBalance = 20000.00;
    let roundState = 'WAITING_FOR_BETS';
    let currentMultiplier = 1.00;
    let isFourMode = false;
    let activeTab = 'players'; // 'players' | 'rounds' | 'top'
    let topFilter = 'daily';
    let lastMilestone = 1;
    let simulatedBets = [];
    let last100Spins = [];
    let topWins = { daily: [], weekly: [], monthly: [] };

    // Betting Panel Controller Configuration (Support up to 4 panels)
    const panels = [0, 1, 2, 3].map(pos => ({
        pos,
        element: document.getElementById(`bet-panel-${pos}`),
        amountInput: document.getElementById(`bet-amount-${pos}`),
        btnMinus: document.getElementById(`btn-minus-${pos}`),
        btnPlus: document.getElementById(`btn-plus-${pos}`),
        btnAction: document.getElementById(`btn-action-${pos}`),
        actionTopText: document.getElementById(`action-top-text-${pos}`) || document.getElementById(`action-sub-text-${pos}`),
        actionBottomText: document.getElementById(`action-bottom-text-${pos}`) || document.getElementById(`action-main-text-${pos}`),
        autoCashoutToggle: document.getElementById(`auto-cashout-${pos}`),
        autoCashoutInput: document.getElementById(`auto-cashout-val-${pos}`),
        autoplayToggle: document.getElementById(`autoplay-${pos}`),
        autoplayBtn: document.getElementById(`autoplay-btn-${pos}`),
        state: 'IDLE', // 'IDLE', 'PLACED', 'IN_FLIGHT', 'CASHED_OUT', 'QUEUED'
        betAmount: 5.00,
        cashoutMultiplier: null,
        wonAmount: 0
    }));

    let userBetsHistory = [];

    // Authentic SVG Avatars matching SmartSoft JetX
    const AVATAR_SVGS = [
        // Pilot Helmet
        `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12c0 3.7 2.01 6.94 5 8.65V22h10v-1.35c2.99-1.71 5-4.95 5-8.65 0-5.52-4.48-10-10-10zm-3 10c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm6 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>`,
        // Jet Plane
        `<svg viewBox="0 0 24 24"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>`,
        // Astronaut Suit
        `<svg viewBox="0 0 24 24"><path d="M12 2a9 9 0 0 0-9 9c0 3.86 2.45 7.15 5.91 8.39V21a1 1 0 0 0 1 1h4.18a1 1 0 0 0 1-1v-1.61C18.55 18.15 21 14.86 21 11a9 9 0 0 0-9-9zm0 5c3.31 0 6 2.24 6 5s-2.69 5-6 5-6-2.24-6-5 2.69-5 6-5z"/></svg>`,
        // Rocket
        `<svg viewBox="0 0 24 24"><path d="M13.13 2.18c-3.14-.14-6.32 1.57-7.96 4.38-1.54 2.64-1.51 5.92-.02 8.54l-2.85 2.85a1 1 0 0 0 1.41 1.41l2.85-2.85c2.62 1.49 5.9 1.52 8.54-.02 2.81-1.64 4.52-4.82 4.38-7.96l-.01-.34c-.11-2.45-1.22-4.7-3.08-6.22-1-.83-2.14-1.46-3.26-1.79zm-2.13 4.82a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg>`,
        // Star Hero
        `<svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`,
        // Skull
        `<svg viewBox="0 0 24 24"><path d="M12 2a9 9 0 0 0-9 9c0 3.03 1.51 5.7 3.82 7.31.25.18.42.45.47.76l.44 2.43c.09.49.51.85 1.01.85h6.52c.5 0 .92-.36 1.01-.85l.44-2.43c.05-.31.22-.58.47-.76C19.49 16.7 21 14.03 21 11a9 9 0 0 0-9-9zm-3 10a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>`,
        // Crown
        `<svg viewBox="0 0 24 24"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .55-.45 1-1 1H6c-.55 0-1-.45-1-1v-1h14v1z"/></svg>`,
        // Gamepad
        `<svg viewBox="0 0 24 24"><path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H9v2H7v-2H5v-2h2V9h2v2h2v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm3-3c-.83 0-1.5-.67-1.5-1.5S17.67 9 18.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`
    ];

    const AVATAR_COLORS = [
        '#2D9CDB', '#9B51E0', '#F2994A', '#27AE60', '#EB5757', '#F2C94C', '#BB6BD9', '#219653', '#E91E63', '#3F51B5'
    ];

    function getAvatarHtml(seed) {
        const idx = Math.abs(Number(seed) || 0);
        const svg = AVATAR_SVGS[idx % AVATAR_SVGS.length];
        const color = AVATAR_COLORS[idx % AVATAR_COLORS.length];
        return `<div class="avatar-icon" style="background:${color}">${svg}</div>`;
    }

    // Formatters
    function formatCurrency(amount) {
        if (window.HabeshaWallet && typeof window.HabeshaWallet.format === 'function') {
            return window.HabeshaWallet.format(amount);
        }
        return Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ETB';
    }

    function formatAmountOnly(amount) {
        return Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function updateBalanceDisplay(newBalance) {
        userBalance = Number(newBalance);
        elements.balanceAmount.textContent = formatCurrency(userBalance);
    }

    if (window.HabeshaWallet && typeof window.HabeshaWallet.onBalanceChange === 'function') {
        window.HabeshaWallet.onBalanceChange((bal) => {
            updateBalanceDisplay(bal);
        });
    }

    // 1. WebSocket / Embedded Engine Event Bindings
    net.on('INIT_STATE', (data) => {
        updateBalanceDisplay(data.balance);
        last100Spins = data.last100Spins || [];
        topWins = data.topWins || topWins;
        simulatedBets = data.simulatedBets || [];
        renderHistoryBar(last100Spins);
        renderActiveBetsTable();
        
        if (data.onlinePlayers) {
            elements.onlinePlayersCount.textContent = `${data.onlinePlayers} Player`;
        }

        if (data.state === 'WAITING_FOR_BETS') {
            handleRoundStart(data);
        } else if (data.state === 'IN_FLIGHT' || data.state === 'TAKEOFF') {
            handleFlightTick(data);
        }
    });

    net.on('ROUND_START', (data) => {
        handleRoundStart(data);
    });

    net.on('TAKEOFF', (data) => {
        handleTakeoff(data);
    });

    net.on('FLIGHT_TICK', (data) => {
        handleFlightTick(data);
    });

    net.on('BOOM', (data) => {
        handleBoom(data);
    });

    net.on('PLAYER_CASHOUT', (data) => {
        handlePlayerCashout(data);
    });

    net.on('BET_RESPONSE', (data) => {
        if (data.success) {
            const p = panels[data.bet.position];
            p.state = 'PLACED';
            updatePanelButton(p);
            updateBalanceDisplay(data.balance);
            sound.playClick();
            userBetsHistory.unshift({
                id: Date.now(),
                bet: data.bet.amount,
                cashedOut: false,
                cashoutMult: 0,
                win: 0
            });
            if (activeTab === 'mybets') renderActiveBetsTable();
        } else {
            alert(data.error);
        }
    });

    net.on('CANCEL_RESPONSE', (data) => {
        if (data.success) {
            const p = panels[data.position];
            p.state = 'IDLE';
            updatePanelButton(p);
            updateBalanceDisplay(data.balance);
            sound.playClick();
        }
    });

    net.on('CASHOUT_RESPONSE', (data) => {
        if (data.success) {
            const p = panels[data.position];
            p.state = 'CASHED_OUT';
            p.cashoutMultiplier = data.multiplier;
            p.wonAmount = data.win;
            updatePanelButton(p);
            updateBalanceDisplay(data.balance);
            sound.playCashout();
            flightCanvas.spawnParachutist(data.win, 'You');
            if (userBetsHistory.length > 0) {
                userBetsHistory[0].cashedOut = true;
                userBetsHistory[0].cashoutMult = data.multiplier;
                userBetsHistory[0].win = data.win;
            }
            if (activeTab === 'mybets') renderActiveBetsTable();
        }
    });

    net.on('ping_update', (data) => {
        if (elements.latencyIndicator) {
            elements.latencyIndicator.textContent = `${data.latency}MS`;
        }
        if (data.onlinePlayers) {
            elements.onlinePlayersCount.textContent = `${data.onlinePlayers} Player`;
        }
    });

    // 2. Lifecycle Handlers
    function handleRoundStart(data) {
        roundState = 'WAITING_FOR_BETS';
        lastMilestone = 1;
        currentMultiplier = 1.00;

        flightCanvas.setState('WAITING');
        sound.stopFlightHum();

        // UI Reset
        elements.countdownOverlay.style.display = 'flex';
        elements.multiplierHero.style.display = 'none';
        elements.multiplierHero.classList.remove('boom');
        elements.stageStatusBadge.style.display = 'none';
        if (elements.stageBetsBadge) elements.stageBetsBadge.style.display = 'none';

        simulatedBets = data.simulatedBets || [];
        const betsCount = simulatedBets.length > 0 ? simulatedBets.length : 90;
        const roundBetsNum = document.getElementById('round-bets-num');
        if (roundBetsNum) roundBetsNum.textContent = `${betsCount} Bets`;
        const stageBetsText = document.getElementById('stage-bets-text');
        if (stageBetsText) stageBetsText.textContent = `${betsCount} Bets`;
        elements.roundTotalWin.textContent = '$ 0.00';

        // Countdown timer animation with SVG circular stroke
        let count = data.countdown || 5.0;
        const totalCountdown = count;
        elements.countdownNumber.textContent = Math.ceil(count);
        const circleProgress = document.getElementById('countdown-circle-progress');
        const circumference = 276.46;
        if (circleProgress) circleProgress.style.strokeDashoffset = '0';

        if (window.activeCountdownInterval) clearInterval(window.activeCountdownInterval);
        window.activeCountdownInterval = setInterval(() => {
            count -= 0.1;
            if (count > 0) {
                elements.countdownNumber.textContent = Math.ceil(count);
                if (circleProgress) {
                    const offset = circumference * (1 - count / totalCountdown);
                    circleProgress.style.strokeDashoffset = offset;
                }
            } else {
                clearInterval(window.activeCountdownInterval);
                if (circleProgress) circleProgress.style.strokeDashoffset = circumference;
            }
        }, 100);

        // Reset panels for new round
        panels.forEach(p => {
            if (p.autoplayToggle.checked) {
                // Auto play queue bet
                net.placeBet(p.pos, p.betAmount, p.autoCashoutToggle.checked, parseFloat(p.autoCashoutInput.value));
            } else {
                if (p.state !== 'QUEUED') {
                    p.state = 'IDLE';
                } else {
                    // Turn queued into placed
                    net.placeBet(p.pos, p.betAmount, p.autoCashoutToggle.checked, parseFloat(p.autoCashoutInput.value));
                }
                updatePanelButton(p);
            }
        });

        renderActiveBetsTable();
    }

    function handleTakeoff(data) {
        roundState = 'TAKEOFF';
        elements.countdownOverlay.style.display = 'none';
        elements.multiplierHero.style.display = 'flex';
        elements.multiplierHero.classList.remove('boom');
        elements.multiplierHero.firstChild.textContent = '1.00';
        elements.stageStatusBadge.style.display = 'none';
        if (elements.stageBetsBadge) {
            elements.stageBetsBadge.style.display = 'block';
            elements.stageBetsBadge.textContent = `${simulatedBets.length + 1} Bets`;
        }

        flightCanvas.setState('TAKEOFF');
        sound.playTakeoff();

        // Transition placed bets to in-flight
        panels.forEach(p => {
            if (p.state === 'PLACED') {
                p.state = 'IN_FLIGHT';
            }
            updatePanelButton(p);
        });
    }

    function handleFlightTick(data) {
        roundState = 'IN_FLIGHT';
        currentMultiplier = data.multiplier;

        elements.countdownOverlay.style.display = 'none';
        elements.stageStatusBadge.style.display = 'none';
        elements.multiplierHero.style.display = 'flex';
        elements.multiplierHero.firstChild.textContent = currentMultiplier.toFixed(2);
        if (elements.stageBetsBadge) {
            elements.stageBetsBadge.style.display = 'block';
            elements.stageBetsBadge.textContent = `${simulatedBets.length + 1} Bets`;
        }
        
        flightCanvas.setState('FLYING');
        flightCanvas.updateMultiplier(currentMultiplier, data.nextMultiplier);

        if (data.roundTotalWin) {
            elements.roundTotalWin.textContent = formatCurrency(data.roundTotalWin);
        }

        // Milestone fanfare audio at 2x, 5x, 10x, 50x, 100x
        const milestones = [2, 5, 10, 50, 100];
        for (const m of milestones) {
            if (currentMultiplier >= m && lastMilestone < m) {
                lastMilestone = m;
                sound.playMilestone(m);
            }
        }

        // Update in-flight Cashout button amount
        panels.forEach(p => {
            if (p.state === 'IN_FLIGHT') {
                const liveWin = (p.betAmount * currentMultiplier).toFixed(2);
                p.actionTopText.textContent = formatCurrency(liveWin);
                p.actionBottomText.textContent = 'Cashout';
            }
        });
    }

    function handleBoom(data) {
        roundState = 'CRASHED';
        const finalCrash = data.multiplier;

        elements.multiplierHero.firstChild.textContent = finalCrash.toFixed(2);
        elements.multiplierHero.classList.add('boom');
        if (elements.stageBetsBadge) elements.stageBetsBadge.style.display = 'none';
        elements.stageStatusBadge.textContent = 'FLEW AWAY';
        elements.stageStatusBadge.className = 'stage-status-badge flew-away';
        elements.stageStatusBadge.style.display = 'block';

        flightCanvas.setState('FLEW_AWAY', finalCrash);
        sound.playTakeoff(); // Supersonic escape sound as jet zooms away!

        // Update panels
        panels.forEach(p => {
            if (p.state === 'IN_FLIGHT') {
                p.state = 'IDLE';
                updatePanelButton(p);
            }
        });

        // Prepend new round to history bar
        if (data.last100Spins) {
            last100Spins = data.last100Spins;
            renderHistoryBar(last100Spins);
        }
    }

    function handlePlayerCashout(data) {
        // Trigger parachute jump on canvas
        flightCanvas.spawnParachutist(data.win, data.player);

        // Update in table
        const row = document.getElementById(`sim-row-${data.player}`);
        if (row) {
            row.classList.add('cashed-out');
            const xCell = row.querySelector('.mult-cell');
            const winCell = row.querySelector('.win-cell');
            if (xCell) xCell.textContent = `${data.multiplier.toFixed(2)}x`;
            if (winCell) {
                winCell.textContent = formatCurrency(data.win);
                winCell.classList.add('win-green');
            }
        }
    }

    // 3. Betting Panel Logic & Button States
    function updatePanelButton(p) {
        const btn = p.btnAction;
        btn.className = 'btn-primary-action';

        switch (p.state) {
            case 'IDLE':
                btn.classList.add('state-bet');
                p.actionTopText.textContent = formatCurrency(p.betAmount);
                p.actionBottomText.textContent = 'Bet';
                btn.disabled = false;
                break;

            case 'PLACED':
                btn.classList.add('state-cancel');
                p.actionTopText.textContent = 'Cancel';
                p.actionBottomText.textContent = 'Waiting for next round';
                btn.disabled = false;
                break;

            case 'IN_FLIGHT':
                btn.classList.add('state-cashout');
                const currentWin = (p.betAmount * currentMultiplier).toFixed(2);
                p.actionTopText.textContent = formatCurrency(currentWin);
                p.actionBottomText.textContent = 'Cashout';
                btn.disabled = false;
                break;

            case 'CASHED_OUT':
                btn.classList.add('state-bet');
                p.actionTopText.textContent = formatCurrency(p.wonAmount);
                p.actionBottomText.textContent = 'Won!';
                btn.disabled = true;
                break;

            case 'QUEUED':
                btn.classList.add('state-cancel');
                p.actionTopText.textContent = 'Cancel';
                p.actionBottomText.textContent = 'Waiting for next round';
                btn.disabled = false;
                break;
        }
    }

    panels.forEach(p => {
        // Auto cashout toggle visibility
        if (p.autoCashoutToggle && p.autoCashoutInput) {
            p.autoCashoutToggle.addEventListener('change', () => {
                p.autoCashoutInput.style.display = p.autoCashoutToggle.checked ? 'inline-block' : 'none';
            });
        }

        // Autoplay button toggle
        if (p.autoplayBtn && p.autoplayToggle) {
            p.autoplayBtn.addEventListener('click', () => {
                sound.playClick();
                p.autoplayToggle.checked = !p.autoplayToggle.checked;
                p.autoplayBtn.classList.toggle('active', p.autoplayToggle.checked);
            });
        }
        // Stepper -
        p.btnMinus.addEventListener('click', () => {
            sound.playClick();
            p.betAmount = Math.max(0.10, Number((p.betAmount - 1.00).toFixed(2)));
            p.amountInput.value = p.betAmount.toFixed(2);
            if (p.state === 'IDLE') updatePanelButton(p);
        });

        // Stepper +
        p.btnPlus.addEventListener('click', () => {
            sound.playClick();
            p.betAmount = Math.min(100.00, Number((p.betAmount + 1.00).toFixed(2)));
            p.amountInput.value = p.betAmount.toFixed(2);
            if (p.state === 'IDLE') updatePanelButton(p);
        });

        // Manual Input
        p.amountInput.addEventListener('change', () => {
            let val = parseFloat(p.amountInput.value);
            if (isNaN(val) || val < 0.10) val = 0.10;
            if (val > 100.00) val = 100.00;
            p.betAmount = Number(val.toFixed(2));
            p.amountInput.value = p.betAmount.toFixed(2);
            if (p.state === 'IDLE') updatePanelButton(p);
        });

        // Quick Bet Pills
        const pills = p.element.querySelectorAll('.quick-pill');
        pills.forEach(pill => {
            pill.addEventListener('click', () => {
                sound.playClick();
                const valStr = pill.getAttribute('data-val');
                if (valStr === 'max') {
                    p.betAmount = 100.00;
                } else {
                    p.betAmount = parseFloat(valStr);
                }
                p.amountInput.value = p.betAmount.toFixed(2);
                if (p.state === 'IDLE') updatePanelButton(p);
            });
        });

        // Primary Action Button Click State Machine
        p.btnAction.addEventListener('click', () => {
            sound.playClick();

            if (p.state === 'IDLE') {
                if (roundState === 'WAITING_FOR_BETS') {
                    net.placeBet(p.pos, p.betAmount, p.autoCashoutToggle.checked, parseFloat(p.autoCashoutInput.value));
                } else {
                    // Queue for next round
                    p.state = 'QUEUED';
                    updatePanelButton(p);
                }
            } else if (p.state === 'PLACED') {
                net.cancelBet(p.pos);
            } else if (p.state === 'IN_FLIGHT') {
                net.cashout(p.pos);
            } else if (p.state === 'QUEUED') {
                p.state = 'IDLE';
                updatePanelButton(p);
            }
        });
    });

    // 4. History Bar Rendering
    function renderHistoryBar(spins) {
        elements.historyBar.innerHTML = '';
        spins.slice(0, 20).forEach(spin => {
            const pill = document.createElement('div');
            pill.className = 'history-pill';
            const mult = spin.multiplier;
            
            if (mult >= 10.00) {
                pill.classList.add('gold');
            } else if (mult >= 2.00) {
                pill.classList.add('green');
            }

            pill.textContent = `${mult.toFixed(2)}x`;
            pill.title = `Round #${spin.roundId} | ${new Date(spin.time).toLocaleTimeString()}`;
            elements.historyBar.appendChild(pill);
        });
    }

    // 5. Sidebar Table Rendering
    function renderActiveBetsTable() {
        elements.tableBody.innerHTML = '';

        if (activeTab === 'players') {
            simulatedBets.forEach((bet, idx) => {
                const row = document.createElement('div');
                row.className = 'table-row';
                row.id = `sim-row-${bet.player}`;

                row.innerHTML = `
                    <div class="player-cell">
                        ${getAvatarHtml(bet.avatar !== undefined ? bet.avatar : idx)}
                        <span>${bet.player}</span>
                    </div>
                    <div class="bet-cell">${formatAmountOnly(bet.bet)}</div>
                    <div class="mult-cell ${bet.cashedOut ? 'cashed' : ''}">${bet.cashedOut ? bet.cashoutMult.toFixed(2) + 'x' : '--'}</div>
                    <div class="win-cell ${bet.cashedOut ? 'win-green' : ''}">
                        ${bet.cashedOut ? formatAmountOnly(bet.win) : '--'}
                    </div>
                `;
                elements.tableBody.appendChild(row);
            });
        } else if (activeTab === 'mybets') {
            if (userBetsHistory.length === 0) {
                elements.tableBody.innerHTML = '<div style="padding: 3rem 1rem; text-align: center; color: #717182; font-size: 0.85rem; font-weight: 600;">No bets placed in this session</div>';
            } else {
                userBetsHistory.forEach(b => {
                    const row = document.createElement('div');
                    row.className = 'table-row';
                    row.innerHTML = `
                        <div class="player-cell">
                            ${getAvatarHtml(0)}
                            <span>You</span>
                        </div>
                        <div class="bet-cell">${formatAmountOnly(b.bet)}</div>
                        <div class="mult-cell ${b.cashedOut ? 'cashed' : ''}">${b.cashedOut ? b.cashoutMult.toFixed(2) + 'x' : '--'}</div>
                        <div class="win-cell ${b.cashedOut ? 'win-green' : ''}">
                            ${b.cashedOut ? formatAmountOnly(b.win) : '--'}
                        </div>
                    `;
                    elements.tableBody.appendChild(row);
                });
            }
        } else if (activeTab === 'top') {
            const list = topWins[topFilter] || [];
            list.forEach((item, idx) => {
                const row = document.createElement('div');
                row.className = 'table-row';
                row.innerHTML = `
                    <div class="player-cell">
                        ${getAvatarHtml(idx + 1)}
                        <span>${item.player}</span>
                    </div>
                    <div class="bet-cell">${formatAmountOnly(item.bet)}</div>
                    <div class="mult-cell cashed">${item.mult.toFixed(2)}x</div>
                    <div class="win-cell win-green">${formatAmountOnly(item.win)}</div>
                `;
                elements.tableBody.appendChild(row);
            });
        }
    }

    // Sidebar Tabs
    const tabButtons = document.querySelectorAll('.sidebar-tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            sound.playClick();
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeTab = btn.getAttribute('data-tab');
            renderActiveBetsTable();
        });
    });

    // 4-Mode Toggle
    elements.fourModeToggleBtn.addEventListener('click', () => {
        sound.playClick();
        isFourMode = !isFourMode;
        if (isFourMode) {
            elements.betPanelsGrid.classList.add('four-mode');
            document.getElementById('bet-panel-2').style.display = 'flex';
            document.getElementById('bet-panel-3').style.display = 'flex';
            elements.fourModeToggleBtn.innerHTML = '<span class="badge-new">Active</span> Switch to 2 Bets Panel';
        } else {
            elements.betPanelsGrid.classList.remove('four-mode');
            document.getElementById('bet-panel-2').style.display = 'none';
            document.getElementById('bet-panel-3').style.display = 'none';
            elements.fourModeToggleBtn.innerHTML = '<span class="badge-new">New</span> Try 4 Bets Panel &gt;';
        }
    });

    // Modals
    document.getElementById('history-dropdown-btn').addEventListener('click', () => {
        sound.playClick();
        renderHistoryGrid();
        elements.historyModal.classList.add('active');
    });

    function renderHistoryGrid() {
        elements.historyGridBody.innerHTML = '';
        last100Spins.forEach(spin => {
            const card = document.createElement('div');
            card.className = 'history-pill';
            const m = spin.multiplier;
            if (m < 1.5) card.classList.add('low');
            else if (m < 10) card.classList.add('mid');
            else card.classList.add('high');
            card.textContent = `${m.toFixed(2)}x`;
            elements.historyGridBody.appendChild(card);
        });
    }

    document.querySelectorAll('.modal-close-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            sound.playClick();
            elements.historyModal.classList.remove('active');
            elements.rulesModal.classList.remove('active');
        });
    });

    document.getElementById('menu-btn').addEventListener('click', () => {
        sound.playClick();
        elements.rulesModal.classList.add('active');
    });

    elements.muteBtn.addEventListener('click', () => {
        const isMuted = !sound.toggleMute();
        elements.muteBtn.style.opacity = isMuted ? '0.4' : '1.0';
    });

    elements.fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    });
});
