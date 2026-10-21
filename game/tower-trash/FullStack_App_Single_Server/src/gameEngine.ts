import { GAME_CONFIG, Difficulty } from './config';
import { ProvablyFair } from './provablyFair';

export interface ActiveGame {
  roundId: string;
  userId: string;
  betAmount: string;
  currency: string;
  difficulty: Difficulty;
  currentStep: number;
  maxSteps: number;
  coeff: string;
  winAmount: string;
  isFinished: boolean;
  bonusType?: 'three-lives' | 'build-your-city';
  attemptsRemaining?: number;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: number;
}

export interface BetHistoryItem {
  roundId: string;
  date: number;
  betAmount: string;
  winAmount: string;
  coeff: string;
  difficulty: Difficulty;
  isWin: boolean;
}

export class GameEngine {
  private activeGames: Map<string, ActiveGame> = new Map();
  private userBalances: Map<string, number> = new Map();
  private userClientSeeds: Map<string, string> = new Map();
  private userNonces: Map<string, number> = new Map();
  private betHistories: Map<string, BetHistoryItem[]> = new Map();

  // 90/10 Dynamic Profit Engine (90% RTP / 10% House Edge)
  private totalWagered: number = 0;
  private totalPaidOut: number = 0;
  private readonly TARGET_RTP: number = 0.90;
  private readonly TARGET_HOUSE_MARGIN: number = 0.10;

  constructor() {
    // Default initial user balance
  }

  /**
   * Calculates the real-time dynamic RTP based on the 90/10 profit engine
   */
  public calculateDynamicRtp(): number {
    if (this.totalWagered <= 0) {
      return this.TARGET_RTP;
    }
    const currentRtp = this.totalPaidOut / this.totalWagered;

    // Dynamic balancing:
    // If player RTP is above 90% (house making < 10% profit), tighten RTP to protect 10% margin.
    // If house profit is high (> 10%), raise RTP to provide rewarding winning runs.
    const deviation = currentRtp - this.TARGET_RTP;
    const dynamicRtp = this.TARGET_RTP - (deviation * 0.7);

    // Bounded between 82% and 95%
    return Math.min(0.95, Math.max(0.82, dynamicRtp));
  }

  public getProfitEngineStats() {
    const houseProfit = this.totalWagered - this.totalPaidOut;
    const currentRtp = this.totalWagered > 0 ? (this.totalPaidOut / this.totalWagered) : this.TARGET_RTP;
    const houseMargin = this.totalWagered > 0 ? (houseProfit / this.totalWagered) : this.TARGET_HOUSE_MARGIN;
    return {
      engine: '90/10 Dynamic Profit Engine',
      targetRtp: '90.0%',
      targetHouseMargin: '10.0%',
      currentRtp: `${(currentRtp * 100).toFixed(2)}%`,
      currentHouseMargin: `${(houseMargin * 100).toFixed(2)}%`,
      totalWagered: this.totalWagered.toFixed(2),
      totalPaidOut: this.totalPaidOut.toFixed(2),
      houseNetProfit: houseProfit.toFixed(2),
      dynamicRtpFactor: this.calculateDynamicRtp().toFixed(4),
      status: houseMargin >= 0.10 ? 'HEALTHY_PROFIT_MAINTAINED' : 'DYNAMIC_MARGIN_BALANCING'
    };
  }

  public getBalance(userId: string): number {
    if (!this.userBalances.has(userId)) {
      this.userBalances.set(userId, 1000000.00); // 1,000,000 USD matching demo session
    }
    return this.userBalances.get(userId)!;
  }

  public setBalance(userId: string, balance: number): void {
    this.userBalances.set(userId, balance);
  }

  public getClientSeed(userId: string): string {
    if (!this.userClientSeeds.has(userId)) {
      this.userClientSeeds.set(userId, ProvablyFair.generateClientSeed());
    }
    return this.userClientSeeds.get(userId)!;
  }

  public setClientSeed(userId: string, seed: string): void {
    this.userClientSeeds.set(userId, seed);
  }

  public getNonce(userId: string): number {
    return this.userNonces.get(userId) || 1;
  }

  public getActiveGame(userId: string): ActiveGame | null {
    const game = this.activeGames.get(userId);
    if (game && !game.isFinished) {
      return game;
    }
    return null;
  }

  public startBet(
    userId: string,
    betAmountStr: string,
    currency: string,
    difficulty: Difficulty,
    bonusType?: 'three-lives' | 'build-your-city'
  ): ActiveGame {
    const betAmount = parseFloat(betAmountStr);
    const balance = this.getBalance(userId);

    let totalCost = betAmount;
    if (bonusType === 'three-lives') {
      totalCost = betAmount * GAME_CONFIG.bonusBuyMultiplierMap['three-lives'];
    } else if (bonusType === 'build-your-city') {
      totalCost = betAmount * GAME_CONFIG.bonusBuyMultiplierMap['build-your-city'];
    }

    if (balance < totalCost) {
      throw new Error('Insufficient balance');
    }

    this.setBalance(userId, balance - totalCost);
    this.totalWagered += totalCost;

    const nonce = this.getNonce(userId);
    this.userNonces.set(userId, nonce + 1);

    const serverSeed = ProvablyFair.generateServerSeed();
    const serverSeedHash = ProvablyFair.hashSeed(serverSeed);
    const clientSeed = this.getClientSeed(userId);

    const coeffs = GAME_CONFIG.coefficients[difficulty] || GAME_CONFIG.coefficients.EASY;
    const maxSteps = coeffs.length;

    const game: ActiveGame = {
      roundId: `round_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId,
      betAmount: betAmount.toFixed(2),
      currency,
      difficulty,
      currentStep: 0,
      maxSteps,
      coeff: '1.00',
      winAmount: '0.00',
      isFinished: false,
      bonusType,
      attemptsRemaining: bonusType === 'three-lives' ? 3 : undefined,
      serverSeed,
      serverSeedHash,
      clientSeed,
      nonce,
      createdAt: Date.now()
    };

    this.activeGames.set(userId, game);
    return game;
  }

  public executeStep(userId: string, requestedStep: number): {
    game: ActiveGame;
    success: boolean;
    blockType: string;
    attemptLost?: boolean;
  } {
    const game = this.getActiveGame(userId);
    if (!game) {
      throw new Error('No active game found');
    }

    if (requestedStep !== game.currentStep + 1) {
      throw new Error(`Invalid step sequence. Expected ${game.currentStep + 1}, got ${requestedStep}`);
    }

    const coeffs = GAME_CONFIG.coefficients[game.difficulty];
    const prevCoeff = game.currentStep === 0 ? 1.0 : parseFloat(coeffs[game.currentStep - 1]);
    const nextCoeff = parseFloat(coeffs[game.currentStep]);

    // 90/10 Dynamic Profit Engine (90% target RTP, 10% operator house margin)
    // Dynamically balances win probability based on pool payout ratio
    const dynamicRtp = this.calculateDynamicRtp();
    const stepRtpFactor = Math.pow(dynamicRtp, 1 / game.maxSteps);
    const winProb = (prevCoeff / nextCoeff) * stepRtpFactor;

    // Deterministic provably fair float outcome
    const outcome = ProvablyFair.getStepOutcome(game.serverSeed, game.clientSeed, game.nonce, requestedStep);
    const success = outcome < winProb;

    // Block visual variants
    const blockTypes = ['wood_cabin', 'brick_house', 'lego_block', 'jail_cell', 'bank_columns', 'clock_tower'];
    const blockType = blockTypes[(requestedStep - 1) % blockTypes.length];

    if (success) {
      game.currentStep = requestedStep;
      game.coeff = nextCoeff.toString();
      game.winAmount = (parseFloat(game.betAmount) * nextCoeff).toFixed(2);

      // Check max floor reached
      if (game.currentStep === game.maxSteps) {
        game.isFinished = true;
        const currentBalance = this.getBalance(userId);
        const winNum = parseFloat(game.winAmount);
        this.setBalance(userId, currentBalance + winNum);
        this.totalPaidOut += winNum;
        this.recordHistory(game, true);
      }

      return { game, success: true, blockType };
    } else {
      // Failed step
      if (game.bonusType === 'three-lives' && (game.attemptsRemaining ?? 0) > 1) {
        game.attemptsRemaining = (game.attemptsRemaining ?? 1) - 1;
        return { game, success: false, blockType, attemptLost: true };
      }

      game.isFinished = true;
      game.winAmount = '0.00';
      game.coeff = '0';
      this.recordHistory(game, false);

      return { game, success: false, blockType };
    }
  }

  public withdraw(userId: string): ActiveGame {
    const game = this.getActiveGame(userId);
    if (!game) {
      throw new Error('No active game found');
    }

    if (game.currentStep === 0) {
      throw new Error('Cannot cash out before placing at least 1 floor');
    }

    game.isFinished = true;
    const winNum = parseFloat(game.winAmount);
    const currentBalance = this.getBalance(userId);
    this.setBalance(userId, currentBalance + winNum);
    this.totalPaidOut += winNum;

    this.recordHistory(game, true);
    return game;
  }

  private recordHistory(game: ActiveGame, isWin: boolean): void {
    const list = this.betHistories.get(game.userId) || [];
    list.unshift({
      roundId: game.roundId,
      date: Date.now(),
      betAmount: game.betAmount,
      winAmount: isWin ? game.winAmount : '0.00',
      coeff: isWin ? game.coeff : '0',
      difficulty: game.difficulty,
      isWin
    });
    if (list.length > 50) {
      list.pop();
    }
    this.betHistories.set(game.userId, list);
  }

  public getHistory(userId: string): BetHistoryItem[] {
    return this.betHistories.get(userId) || [];
  }
}
