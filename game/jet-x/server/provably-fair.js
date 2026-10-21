const crypto = require('crypto');

/**
 * Provably Fair RNG for JetX Crash Multiplier
 * Follows industry-standard HMAC-SHA256 algorithm with 97% RTP.
 */
class ProvablyFair {
    constructor() {
        this.serverSeed = crypto.randomBytes(32).toString('hex');
        this.clientSeed = '0000000000000000000412e84c98a4497e2bf9cf9d750a98c8f42ef995b00424';
        this.nonce = 1;
    }

    /**
     * Generate the crash multiplier for a round
     * Returns { multiplier, hash, spinNumber }
     */
    generateCrashPoint() {
        const hashInput = `${this.clientSeed}:${this.nonce}`;
        const hmac = crypto.createHmac('sha256', this.serverSeed);
        hmac.update(hashInput);
        const hash = hmac.digest('hex');

        // Extract first 52 bits (13 hex chars)
        const hexSlice = hash.substring(0, 13);
        const intVal = parseInt(hexSlice, 16);
        const e = Math.pow(2, 52);

        // 3% instant crash edge / house edge (RTP = 97%)
        const houseEdge = 0.03;
        let multiplier;

        if (intVal % 33 === 0) {
            // Instant 1.00x crash
            multiplier = 1.00;
        } else {
            // Standard crash formula
            const r = (e - intVal) / e;
            const rawMult = Math.floor((100 * (1 - houseEdge)) / r) / 100;
            multiplier = Math.max(1.00, Math.min(25000.00, Number(rawMult.toFixed(2))));
        }

        const spinNumber = this.nonce;
        this.nonce++;

        return {
            multiplier,
            hash,
            spinNumber,
            serverSeedHash: crypto.createHash('sha256').update(this.serverSeed).digest('hex')
        };
    }
}

module.exports = ProvablyFair;
