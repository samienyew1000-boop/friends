import crypto from 'crypto';

export interface ProvablyFairSeeds {
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export class ProvablyFair {
  public static generateServerSeed(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  public static hashSeed(seed: string): string {
    return crypto.createHash('sha256').update(seed).digest('hex');
  }

  public static generateClientSeed(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Generates a deterministic float outcome between 0 and 1
   * using HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}:${step}`)
   */
  public static getStepOutcome(serverSeed: string, clientSeed: string, nonce: number, step: number): number {
    const message = `${clientSeed}:${nonce}:${step}`;
    const hmac = crypto.createHmac('sha256', serverSeed).update(message).digest('hex');
    
    // Take first 8 characters (32 bits) and convert to float
    const sub = hmac.substring(0, 8);
    const intVal = parseInt(sub, 16);
    return intVal / 0xffffffff;
  }
}
