export interface BetConfig {
  minBetAmount: string;
  maxBetAmount: string;
  maxWinAmount: string;
  betPresets: string[];
  decimalPlaces: string;
  currency: string;
}

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface GameConfig {
  betConfig: BetConfig;
  coefficients: {
    EASY: string[];
    MEDIUM: string[];
    HARD: string[];
  };
  bonusBuyMultiplierMap: {
    'three-lives': number;
    'build-your-city': number;
  };
  buildYourCityFreeSpins: Record<string, number>;
}

export const GAME_CONFIG: GameConfig = {
  betConfig: {
    minBetAmount: '0.12',
    maxBetAmount: '10000.00',
    maxWinAmount: '100000.00',
    betPresets: ['1', '2', '5', '10', '20', '50', '100'],
    decimalPlaces: '2',
    currency: 'USD'
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
    '9': 0.045,
    '10': 0.166,
    '11': 0.32,
    '12': 0.249,
    '13': 0.165,
    '14': 0.048,
    '15': 0.007
  }
};
